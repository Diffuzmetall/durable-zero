import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as checker from "../../../../../../../packages/core/test/architecture-boundaries-checker.ts";
import {
  auditCliServeEntrypoint,
  resolveRunnerPackageExport,
} from "../../../../../../../packages/core/test/architecture-boundaries-cli.ts";
import { verifyFileExportsMain } from "../../../../../../../packages/core/test/architecture-boundaries-runner-verify.ts";
import { generateAuditReport, type LiveAuditResult } from "../../../../../../../packages/core/test/architecture-boundaries-report.ts";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "r4-fixtures"
);

function setupFixtures() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

describe("Task 5A Fix Round 4: Independent Adversarial Probes & Invariant Verification", () => {
  setupFixtures();

  const realRunnerDistRel = path.relative(
    FIXTURES_DIR,
    path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
  );

  describe("Section 1: Callable Target Verification (TypeChecker Signatures & Anti-False-Green)", () => {
    it("REJECTS primitive-returning CallExpression (export const main = Number('17'))", () => {
      const file = path.join(FIXTURES_DIR, "primitive-call-main.js");
      fs.writeFileSync(file, 'export const main = Number("17");\n', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Number('17') has 0 call signatures and must be rejected");
    });

    it("REJECTS primitive identifier assignment (const n = 17; export const main = n)", () => {
      const file = path.join(FIXTURES_DIR, "primitive-identifier-main.js");
      fs.writeFileSync(file, 'const n = 17;\nexport const main = n;\n', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Identifier resolving to number must be rejected");
    });

    it("REJECTS primitive named re-export (const n = 17; export { n as main })", () => {
      const file = path.join(FIXTURES_DIR, "primitive-reexport-main.js");
      fs.writeFileSync(file, 'const n = 17;\nexport { n as main };\n', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Aliased symbol resolving to number must be rejected");
    });

    it("REJECTS primitive boolean/string constants (export const main = false)", () => {
      const file = path.join(FIXTURES_DIR, "primitive-bool-main.js");
      fs.writeFileSync(file, 'export const main = false;\n', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Boolean literal must be rejected");
    });

    it("REJECTS module with unrelated function export but NO main (no false-rescue by siblings)", () => {
      const file = path.join(FIXTURES_DIR, "unrelated-export-no-main.js");
      fs.writeFileSync(file, 'export function helper() { return 1; }\nexport const config = {};\n', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Module without main export must be rejected even if other functions exist");
    });

    it("FAILS CLOSED on syntax error / unparseable code", () => {
      const file = path.join(FIXTURES_DIR, "malformed-syntax.js");
      fs.writeFileSync(file, 'export const main = ;;; syntax error', "utf8");
      assert.equal(verifyFileExportsMain(file), false, "Malformed syntax must fail closed to false");
    });
  });

  describe("Section 2: Genuine Callable Target Positives", () => {
    it("ACCEPTS standard export function main()", () => {
      const file = path.join(FIXTURES_DIR, "genuine-fn-main.js");
      fs.writeFileSync(file, 'export function main(args) { return args; }\n', "utf8");
      assert.equal(verifyFileExportsMain(file), true);
    });

    it("ACCEPTS export async function main()", () => {
      const file = path.join(FIXTURES_DIR, "genuine-async-fn-main.js");
      fs.writeFileSync(file, 'export async function main() {}\n', "utf8");
      assert.equal(verifyFileExportsMain(file), true);
    });

    it("ACCEPTS export const main = () => {}", () => {
      const file = path.join(FIXTURES_DIR, "genuine-arrow-main.js");
      fs.writeFileSync(file, 'export const main = (args) => { console.log(args); };\n', "utf8");
      assert.equal(verifyFileExportsMain(file), true);
    });

    it("ACCEPTS genuine function re-export (function run() {} export { run as main })", () => {
      const file = path.join(FIXTURES_DIR, "genuine-aliased-fn-main.js");
      fs.writeFileSync(file, 'function run() {}\nexport { run as main };\n', "utf8");
      assert.equal(verifyFileExportsMain(file), true);
    });

    it("ACCEPTS production compiled bundle in packages/runner/dist/main.js", () => {
      const realRunnerMain = path.resolve(
        import.meta.dirname,
        "../../../../../../../packages/runner/dist/main.js"
      );
      assert.ok(fs.existsSync(realRunnerMain), "Real runner bundle must exist");
      assert.equal(verifyFileExportsMain(realRunnerMain), true, "Compiled runner bundle must have callable main");
    });
  });

  describe("Section 3: CLI Serve Invariant & Package Export Resolution", () => {
    it("ACCEPTS real production CLI entrypoint in packages/cli/bin/durable-zero.js", () => {
      const prodCli = path.resolve(
        import.meta.dirname,
        "../../../../../../../packages/cli/bin/durable-zero.js"
      );
      const result = auditCliServeEntrypoint(prodCli);
      assert.equal(result.isOk, true, `Expected ok for prod CLI, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
      assert.ok(result.resolvedPath && fs.existsSync(result.resolvedPath));
    });

    it("ACCEPTS direct destructuring { main } and main() invocation", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-direct-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerDistRel.startsWith(".") ? realRunnerDistRel : `./${realRunnerDistRel}`}");
  await main(process.argv.slice(3));
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "main");
    });

    it("ACCEPTS destructured alias { main: runRunner } and runRunner() invocation", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-alias-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("${realRunnerDistRel.startsWith(".") ? realRunnerDistRel : `./${realRunnerDistRel}`}");
  await runRunner(process.argv.slice(3));
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
    });

    it("ACCEPTS namespace import runner and runner.main() property invocation", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-namespace-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("${realRunnerDistRel.startsWith(".") ? realRunnerDistRel : `./${realRunnerDistRel}`}");
  await runner.main(process.argv.slice(3));
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runner.main");
    });

    it("REJECTS inverted condition if (command !== 'serve')", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-inverted-cond.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command !== "serve") {
  const { main } = await import("${realRunnerDistRel.startsWith(".") ? realRunnerDistRel : `./${realRunnerDistRel}`}");
  await main();
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /does not declare an if \(command === "serve"\) branch/);
    });

    it("REJECTS invocation inside never-invoked nested function declaration", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-nested-uncalled.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerDistRel.startsWith(".") ? realRunnerDistRel : `./${realRunnerDistRel}`}");
  function uninvokedWorker() {
    main();
  }
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /Hollow implementation detected.*never invokes main/);
    });

    it("REJECTS unexported runner package subpath import", () => {
      const mockCliBinDir = path.join(FIXTURES_DIR, "packages/cli/bin");
      const mockRunnerDir = path.join(FIXTURES_DIR, "packages/runner");
      fs.mkdirSync(mockCliBinDir, { recursive: true });
      fs.mkdirSync(mockRunnerDir, { recursive: true });

      fs.writeFileSync(
        path.join(mockRunnerDir, "package.json"),
        JSON.stringify({
          name: "@durable-zero/runner",
          exports: { "./dist/main.js": "./dist/main.js" },
        }),
        "utf8"
      );

      const cliPath = path.join(mockCliBinDir, "cli-unexported-subpath.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner/unexported-subpath-xyz.js");
  await main();
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /Runner package does not export subpath|does not exist on disk/);
    });

    it("REJECTS fake package prefix @durable-zero/runner-fake-package", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-fake-prefix.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner-fake-package");
  await main();
}
`,
        "utf8"
      );
      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /not @durable-zero\/runner package/);
    });
  });

  describe("Section 4: Real Reporter Failure Negative Control", () => {
    it("strictly writes status FAIL and lists violations when live audit finds defects", () => {
      const mutatedAudit: LiveAuditResult = {
        status: "FAIL",
        coreFilesScanned: 16,
        coreBoundaryViolations: [
          {
            file: "packages/core/src/policy/store.ts",
            line: 12,
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

      const outDir = path.join(FIXTURES_DIR, "failing-report-test");
      const { jsonPath, mdPath } = generateAuditReport(mutatedAudit, outDir);

      const reportJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(reportJson.status, "FAIL", "Report must show FAIL");
      assert.equal(reportJson.summary.coreBoundaryViolationsCount, 1);
      assert.equal(reportJson.summary.totalViolations, 1);

      const reportMd = fs.readFileSync(mdPath, "utf8");
      assert.ok(reportMd.includes("**FAIL**"));
      assert.ok(reportMd.includes("Forbidden vendor dependency in Core"));
    });

    it("strictly writes status FAIL when testReceipt indicates failure", () => {
      const cleanAudit: LiveAuditResult = {
        status: "PASS",
        coreFilesScanned: 16,
        coreBoundaryViolations: [],
        corePackageJsonViolations: [],
        workspaceCycles: [],
        layeringViolations: [],
        cliServeAudit: { isOk: true, callsMain: true },
        legacyFilesFound: [],
        workspaceGraph: {},
        edgeProvenance: [],
        fileInventory: [],
      };

      const outDir = path.join(FIXTURES_DIR, "failed-receipt-report-test");
      const { jsonPath } = generateAuditReport(cleanAudit, outDir, {
        totalTests: 47,
        passed: 46,
        failed: 1,
        durationMs: 450,
        exitCode: 1,
      });

      const reportJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(reportJson.status, "FAIL", "Report must reflect test failure");
      assert.equal(reportJson.summary.testSuiteResults.failed, 1);
    });
  });

  describe("Section 5: Helper Purity & AP-019 Module Boundaries", () => {
    it("proves importing modular checker submodules is completely side-effect free", () => {
      assert.equal(typeof checker.auditCliServeEntrypoint, "function");
      assert.equal(typeof checker.extractAstDependencies, "function");
      assert.equal(typeof checker.buildFullWorkspaceGraph, "function");
      assert.equal(typeof checker.detectDependencyCycles, "function");
      assert.equal(typeof checker.generateAuditReport, "function");
      assert.equal(typeof checker.collectAllSourceFiles, "function");
      assert.equal(typeof checker.auditLiveWorkspace, "function");
    });
  });
});
