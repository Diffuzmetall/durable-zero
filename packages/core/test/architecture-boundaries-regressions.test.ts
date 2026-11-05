import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  extractAstDependencies,
  auditCoreFileBoundaries,
  auditCliServeEntrypoint,
  collectAllSourceFiles,
  buildFullWorkspaceGraph,
  detectDependencyCycles,
  generateAuditReport,
  type LiveAuditResult,
} from "./architecture-boundaries-checker.ts";

const ISOLATED_DIR = path.resolve(
  import.meta.dirname,
  "architecture-boundaries-fixtures/fix-round-1-regressions"
);

describe("Task 5A Remediation: Regression Tests on Independent Review Findings", () => {
  fs.mkdirSync(ISOLATED_DIR, { recursive: true });

  describe("FND-TASK5-01 (P1): CLI Serve Entrypoint Invariant Enforcement", () => {
    it("REJECTS hollow CLI serve branch that imports runner but NEVER invokes main()", () => {
      const hollowCliPath = path.join(ISOLATED_DIR, "hollow-cli.js");
      const relToRealRunner = path.relative(
        ISOLATED_DIR,
        path.resolve(import.meta.dirname, "../../runner/dist/main.js")
      );
      fs.writeFileSync(
        hollowCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("${relToRealRunner.startsWith(".") ? relToRealRunner : `./${relToRealRunner}`}");
  console.log("Runner loaded but main() was never called");
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(hollowCliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject hollow serve branch where main() is not invoked"
      );
      assert.match(
        result.error ?? "",
        /hollow implementation|never invokes main|never calls main|callsMain/i
      );
    });

    it("REJECTS CLI serve target pointing to nonexistent runner file on disk", () => {
      const nonexistentPath = path.join(ISOLATED_DIR, "nonexistent-target.js");
      fs.writeFileSync(
        nonexistentPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("../../nonexistent-runner-xyz/dist/main.js");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(nonexistentPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject nonexistent runner target on disk"
      );
      assert.match(
        result.error ?? "",
        /not found|does not exist|nonexistent/i
      );
    });

    it("REJECTS CLI script that matches import only in string literal or comment", () => {
      const dummyRegexPath = path.join(ISOLATED_DIR, "dummy-string-import.js");
      fs.writeFileSync(
        dummyRegexPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const doc = "Usage: await import('../../runner/dist/main.js')";
  console.log(doc);
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(dummyRegexPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject fake import inside string literal"
      );
    });

    it("REJECTS CLI serve where runner is imported as unusedModule and unrelated local main() is called [R2 Bypass 1]", () => {
      const relToRealRunner = path.relative(
        ISOLATED_DIR,
        path.resolve(import.meta.dirname, "../../runner/dist/main.js")
      );
      const cliPath = path.join(ISOLATED_DIR, "unrelated-local-main-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const unusedModule = await import("${relToRealRunner.startsWith(".") ? relToRealRunner : `./${relToRealRunner}`}");
  function main() { console.log("unrelated local main"); }
  main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject CLI script where imported runner is never called, even if local main() exists"
      );
    });

    it("REJECTS CLI serve where target file under runner does NOT export main [R2 Bypass 2]", () => {
      const mockRunnerDir = path.join(ISOLATED_DIR, "mock-runner-pkg/dist");
      fs.mkdirSync(mockRunnerDir, { recursive: true });
      fs.writeFileSync(
        path.join(ISOLATED_DIR, "mock-runner-pkg/package.json"),
        JSON.stringify({ name: "@durable-zero/runner" }),
        "utf8"
      );

      const noMainTarget = path.join(mockRunnerDir, "no-main-target.js");
      fs.writeFileSync(
        noMainTarget,
        `export const dummyHelper = () => "no main here";\n`,
        "utf8"
      );

      const relToNoMain = path.relative(ISOLATED_DIR, noMainTarget);
      const cliPath = path.join(ISOLATED_DIR, "import-no-main-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToNoMain.startsWith(".") ? relToNoMain : `./${relToNoMain}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must verify target file actually exports callable main"
      );
      assert.match(result.error ?? "", /exports? no (callable )?main|missing.*main export/i);
    });

    it("REJECTS CLI serve where path merely contains substring 'runner' outside packages/runner [R2 Bypass 3]", () => {
      const trapDir = path.join(ISOLATED_DIR, "fake-runner-exploit/dist");
      fs.mkdirSync(trapDir, { recursive: true });
      const trapMain = path.join(trapDir, "main.js");
      fs.writeFileSync(
        trapMain,
        `export function main() { console.log("exploit payload"); }\n`,
        "utf8"
      );

      const relToTrap = path.relative(ISOLATED_DIR, trapMain);
      const cliPath = path.join(ISOLATED_DIR, "runner-trap-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToTrap.startsWith(".") ? relToTrap : `./${relToTrap}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject target outside real @durable-zero/runner package"
      );
      assert.match(result.error ?? "", /not in @durable-zero\/runner package|not.*runner package/i);
    });

    it("REJECTS CLI serve target where exported main is non-callable constant (e.g. main = 17) [R3 Defect 1]", () => {
      const mockPkgDir = path.join(ISOLATED_DIR, "non-callable-pkg/dist");
      fs.mkdirSync(mockPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(ISOLATED_DIR, "non-callable-pkg/package.json"),
        JSON.stringify({ name: "@durable-zero/runner" }),
        "utf8"
      );
      const targetPath = path.join(mockPkgDir, "main.js");
      fs.writeFileSync(targetPath, `export const main = 17;\n`, "utf8");

      const relToTarget = path.relative(ISOLATED_DIR, targetPath);
      const cliPath = path.join(ISOLATED_DIR, "non-callable-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToTarget.startsWith(".") ? relToTarget : `./${relToTarget}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject target file whose exported main is non-callable"
      );
      assert.match(result.error ?? "", /non-callable|callable.*main|exports no.*callable.*main/i);
    });

    it("REJECTS CLI script with inverted condition if (command !== 'serve') [R3 Defect 2]", () => {
      const relToRealRunner = path.relative(
        ISOLATED_DIR,
        path.resolve(import.meta.dirname, "../../runner/dist/main.js")
      );
      const cliPath = path.join(ISOLATED_DIR, "inverted-cond-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command !== "serve") {
  const { main } = await import("${relToRealRunner.startsWith(".") ? relToRealRunner : `./${relToRealRunner}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject inverted condition if (command !== 'serve')"
      );
    });

    it("REJECTS fake package prefix '@durable-zero/runner-fake' without blind substitution [R3 Defect 3]", () => {
      const cliPath = path.join(ISOLATED_DIR, "fake-prefix-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner-fake-exploit");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject fake package prefix without substituting real runner"
      );
      assert.match(result.error ?? "", /not.*@durable-zero\/runner/i);
    });

    it("REJECTS CLI serve where main() is inside uncalled nested function [R3 Defect 4]", () => {
      const relToRealRunner = path.relative(
        ISOLATED_DIR,
        path.resolve(import.meta.dirname, "../../runner/dist/main.js")
      );
      const cliPath = path.join(ISOLATED_DIR, "nested-uncalled-cli.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToRealRunner.startsWith(".") ? relToRealRunner : `./${relToRealRunner}`}");
  function unusedWorker() {
    main(); // Inside uninvoked function definition!
  }
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(
        result.isOk,
        false,
        "Checker must reject invocation inside uncalled nested function"
      );
      assert.match(result.error ?? "", /Hollow implementation|never invokes main/i);
    });

    it("ACCEPTS valid CLI serve entrypoint that imports runner and calls main()", () => {
      const validCliPath = path.join(ISOLATED_DIR, "valid-cli.js");
      // Use relative path to real runner main.js
      const relToRealRunner = path.relative(
        ISOLATED_DIR,
        path.resolve(import.meta.dirname, "../../runner/dist/main.js")
      );
      fs.writeFileSync(
        validCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("${relToRealRunner.startsWith(".") ? relToRealRunner : `./${relToRealRunner}`}");
  await runRunner();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(validCliPath);
      assert.equal(result.isOk, true, `Expected valid CLI entry to pass: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
    });
  });

  describe("FND-TASK5-02 (P1): Workspace DAG Cycle Detection via Source & Re-Exports", () => {
    it("DETECTS cross-package source import cycle even when package.json dependencies omit edges", () => {
      const mockWorkspace = path.join(ISOLATED_DIR, "mock-source-cycle-ws");
      const packagesDir = path.join(mockWorkspace, "packages");
      const pkgADir = path.join(packagesDir, "pkg-a");
      const pkgBDir = path.join(packagesDir, "pkg-b");
      fs.mkdirSync(path.join(pkgADir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgBDir, "src"), { recursive: true });

      // Empty package.json dependencies:
      fs.writeFileSync(
        path.join(pkgADir, "package.json"),
        JSON.stringify({ name: "@durable-zero/mock-a", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/mock-b", dependencies: {} }),
        "utf8"
      );

      // Source-level cycle:
      fs.writeFileSync(
        path.join(pkgADir, "src/index.ts"),
        `import { b } from "@durable-zero/mock-b"; export const a = 1;`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "src/index.ts"),
        `import { a } from "@durable-zero/mock-a"; export const b = 2;`,
        "utf8"
      );

      const { graph } = buildFullWorkspaceGraph(mockWorkspace);
      const cycles = detectDependencyCycles(graph);
      assert.ok(
        cycles.length > 0,
        "Full workspace graph scanner must detect source-level import cycle without manifest edges"
      );
    });

    it("DETECTS cross-package barrel re-export cycle when package.json dependencies omit edges", () => {
      const mockWorkspace = path.join(ISOLATED_DIR, "mock-barrel-cycle-ws");
      const packagesDir = path.join(mockWorkspace, "packages");
      const pkgXDir = path.join(packagesDir, "pkg-x");
      const pkgYDir = path.join(packagesDir, "pkg-y");
      fs.mkdirSync(path.join(pkgXDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgYDir, "src"), { recursive: true });

      fs.writeFileSync(
        path.join(pkgXDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/mock-x", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/mock-y", dependencies: {} }),
        "utf8"
      );

      // Re-export barrel cycle:
      fs.writeFileSync(
        path.join(pkgXDir, "src/index.ts"),
        `export * from "@durable-zero/mock-y";`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "src/index.ts"),
        `export * from "@durable-zero/mock-x";`,
        "utf8"
      );

      const { graph } = buildFullWorkspaceGraph(mockWorkspace);
      const cycles = detectDependencyCycles(graph);
      assert.ok(
        cycles.length > 0,
        "Full workspace graph scanner must detect barrel re-export cycle without manifest edges"
      );
    });
  });

  describe("FND-TASK5-03 (P1): Evidence Integrity & Dynamic Reporting", () => {
    it("GENERATES failing report and non-zero violation count when violations exist (no false PASS)", () => {
      const simulatedFailureAudit: LiveAuditResult = {
        status: "FAIL",
        coreFilesScanned: 16,
        coreBoundaryViolations: [
          {
            file: "packages/core/src/policy/store.ts",
            line: 10,
            character: 1,
            specifier: "@earendil-works/pi-durable",
            kind: "static-import",
            rule: "AP-010",
            severity: "P0",
            message: "Forbidden vendor dependency in Core",
          },
        ],
        corePackageJsonViolations: [],
        workspaceCycles: [],
        layeringViolations: [],
        cliServeAudit: { isOk: true, callsMain: true },
        legacyFilesFound: [],
        workspaceGraph: {},
        edgeProvenance: [],
        fileInventory: [],
      };

      const outDir = path.join(ISOLATED_DIR, "report-test");
      const { jsonPath } = generateAuditReport(simulatedFailureAudit, outDir);

      const savedReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(
        savedReport.status,
        "FAIL",
        "Report status must be FAIL when audit detected violations"
      );
      assert.equal(
        savedReport.summary.coreBoundaryViolationsCount,
        1,
        "Report summary must reflect real count of violations"
      );
      assert.equal(
        savedReport.summary.totalViolations,
        1,
        "Total violations must be 1"
      );
    });
  });

  describe("FND-TASK5-04 (P2): AST Syntax & File Extension Coverage", () => {
    it("DETECTS dynamic import with no-substitution template literal (import(`vendor`))", () => {
      const templatePath = path.join(ISOLATED_DIR, "template-import.ts");
      fs.writeFileSync(
        templatePath,
        `export async function load() {
  return await import(\`@earendil-works/pi-durable\`);
}
`,
        "utf8"
      );

      const deps = extractAstDependencies(templatePath);
      assert.ok(
        deps.length > 0,
        "Must extract dependency from no-substitution template literal"
      );
      assert.equal(deps[0].specifier, "@earendil-works/pi-durable");

      const violations = auditCoreFileBoundaries(templatePath, ISOLATED_DIR);
      assert.ok(
        violations.length > 0,
        "Must flag forbidden vendor import from template literal"
      );
      assert.equal(violations[0].specifier, "@earendil-works/pi-durable");
    });

    it("DETECTS TypeScript import = require(...) syntax", () => {
      const requirePath = path.join(ISOLATED_DIR, "import-require.ts");
      fs.writeFileSync(
        requirePath,
        `import fs = require("node:fs");
export function read() { return fs.readFileSync("foo"); }
`,
        "utf8"
      );

      const deps = extractAstDependencies(requirePath);
      assert.ok(
        deps.length > 0,
        "Must extract dependency from import = require(...) syntax"
      );
      assert.equal(deps[0].specifier, "node:fs");

      const violations = auditCoreFileBoundaries(requirePath, ISOLATED_DIR);
      assert.ok(
        violations.length > 0,
        "Must flag forbidden node:fs import from import = require"
      );
      assert.equal(violations[0].specifier, "node:fs");
    });

    it("SCANS supported module extensions (.ts, .mts, .cts, .js, .mjs, .cjs, .tsx)", () => {
      const extDir = path.join(ISOLATED_DIR, "ext-check");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, "a.ts"), "export const a = 1;");
      fs.writeFileSync(path.join(extDir, "b.mts"), "export const b = 2;");
      fs.writeFileSync(path.join(extDir, "c.cts"), "export const c = 3;");
      fs.writeFileSync(path.join(extDir, "d.js"), "export const d = 4;");
      fs.writeFileSync(path.join(extDir, "e.mjs"), "export const e = 5;");
      fs.writeFileSync(path.join(extDir, "f.cjs"), "export const f = 6;");
      fs.writeFileSync(path.join(extDir, "g.tsx"), "export const g = 7;");

      const files = collectAllSourceFiles(extDir);
      assert.equal(
        files.length,
        7,
        `Expected all 7 files with supported extensions to be scanned, got: ${files.length}`
      );
    });
  });
});
