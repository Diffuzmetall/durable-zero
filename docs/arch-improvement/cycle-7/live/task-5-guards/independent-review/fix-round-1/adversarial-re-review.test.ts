import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as checker from "../../../../../../../packages/core/test/architecture-boundaries-checker.ts";

const FIXTURES_ROOT = path.resolve(
  import.meta.dirname,
  "re-review-isolated-fixtures"
);

function setupIsolatedFixtures() {
  fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
}

function cleanupIsolatedFixtures() {
  if (fs.existsSync(FIXTURES_ROOT)) {
    fs.rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  }
}

describe("Task 5A Fix Round 1: Independent Adversarial Verification", () => {
  setupIsolatedFixtures();

  describe("Verification 0: Side-Effect Free Helper Module Extraction", () => {
    it("proves importing architecture-boundaries-checker.ts does not run tests or write reports", () => {
      // The module was imported at top-level. Verify all required functions exist:
      assert.equal(typeof checker.extractAstDependencies, "function");
      assert.equal(typeof checker.auditCoreFileBoundaries, "function");
      assert.equal(typeof checker.auditPackageJsonDependencies, "function");
      assert.equal(typeof checker.auditCliServeEntrypoint, "function");
      assert.equal(typeof checker.buildFullWorkspaceGraph, "function");
      assert.equal(typeof checker.detectDependencyCycles, "function");
      assert.equal(typeof checker.verifyPackageLayering, "function");
      assert.equal(typeof checker.collectAllSourceFiles, "function");
      assert.equal(typeof checker.computeSha256, "function");
      assert.equal(typeof checker.auditLiveWorkspace, "function");
      assert.equal(typeof checker.generateAuditReport, "function");
    });
  });

  describe("Verification 1 (FND-TASK5-01): CLI Serve Entrypoint Rejection & Binding Checks", () => {
    it("CORRECTLY REJECTS hollow CLI serve branch where runner is imported but main() is never invoked", () => {
      const hollowCliPath = path.join(FIXTURES_ROOT, "hollow-cli-serve.js");
      const realRunnerRel = path.relative(
        FIXTURES_ROOT,
        path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
      );
      fs.writeFileSync(
        hollowCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  console.log("Runner imported but main() never called");
}
`,
        "utf8"
      );

      const result = checker.auditCliServeEntrypoint(hollowCliPath);
      assert.equal(result.isOk, false, "Must reject hollow serve branch");
      assert.equal(result.callsMain, false);
      assert.match(
        result.error ?? "",
        /hollow implementation|never invokes main/i
      );
    });

    it("CORRECTLY REJECTS CLI serve branch pointing to a NONEXISTENT runner file", () => {
      const nonexistentCliPath = path.join(
        FIXTURES_ROOT,
        "nonexistent-runner-cli.js"
      );
      fs.writeFileSync(
        nonexistentCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./runner-does-not-exist/dist/main.js");
  await main();
}
`,
        "utf8"
      );

      const result = checker.auditCliServeEntrypoint(nonexistentCliPath);
      assert.equal(result.isOk, false, "Must reject nonexistent file path");
      assert.match(
        result.error ?? "",
        /does not exist on disk/i
      );
    });

    it("CORRECTLY REJECTS dummy string / comment matching regex without AST call expression", () => {
      const dummyRegexCliPath = path.join(FIXTURES_ROOT, "dummy-string-cli.js");
      fs.writeFileSync(
        dummyRegexCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const dummyUsageDoc = "import('../../runner/dist/main.js')";
}
`,
        "utf8"
      );

      const result = checker.auditCliServeEntrypoint(dummyRegexCliPath);
      assert.equal(result.isOk, false, "Must reject string literals in dummy variables");
      assert.match(
        result.error ?? "",
        /does not perform an AST dynamic import/i
      );
    });

    it("CORRECTLY ACCEPTS valid CLI serve branch with alias binding { main: runRunner } and execution", () => {
      const validCliPath = path.join(FIXTURES_ROOT, "valid-alias-cli.js");
      const realRunnerRel = path.relative(
        FIXTURES_ROOT,
        path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
      );
      fs.writeFileSync(
        validCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await runRunner(process.argv.slice(3));
}
`,
        "utf8"
      );

      const result = checker.auditCliServeEntrypoint(validCliPath);
      assert.equal(result.isOk, true, `Expected valid result, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
      assert.ok(result.resolvedPath && fs.existsSync(result.resolvedPath));
    });

    it("CORRECTLY ACCEPTS valid CLI serve branch with namespace access runner.main()", () => {
      const validNamespaceCliPath = path.join(
        FIXTURES_ROOT,
        "valid-namespace-cli.js"
      );
      const realRunnerRel = path.relative(
        FIXTURES_ROOT,
        path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
      );
      fs.writeFileSync(
        validNamespaceCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await runner.main(process.argv.slice(3));
}
`,
        "utf8"
      );

      const result = checker.auditCliServeEntrypoint(validNamespaceCliPath);
      assert.equal(result.isOk, true, `Expected valid result, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runner.main");
    });
  });

  describe("Verification 2 (FND-TASK5-02): Unified Source + Manifest Workspace DAG Cycle Detection", () => {
    it("CORRECTLY DETECTS cross-package source import cycle even when package.json manifests omit the edge", () => {
      const mockWorkspace = path.join(
        FIXTURES_ROOT,
        "mock-source-cycle-workspace"
      );
      const pkgADir = path.join(mockWorkspace, "packages/pkg-a");
      const pkgBDir = path.join(mockWorkspace, "packages/pkg-b");
      fs.mkdirSync(path.join(pkgADir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgBDir, "src"), { recursive: true });

      // OMITTED edges in package.json:
      fs.writeFileSync(
        path.join(pkgADir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-a", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-b", dependencies: {} }),
        "utf8"
      );

      // TypeScript source-level cross-package import cycle:
      fs.writeFileSync(
        path.join(pkgADir, "src/index.ts"),
        `import { b } from "@durable-zero/pkg-b"; export const a = 1;`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "src/index.ts"),
        `import { a } from "@durable-zero/pkg-a"; export const b = 2;`,
        "utf8"
      );

      const { graph, edges } = checker.buildFullWorkspaceGraph(mockWorkspace);
      const cycles = checker.detectDependencyCycles(graph);

      assert.ok(
        cycles.length >= 1,
        "Unified graph builder MUST detect source-level circular dependencies"
      );
      const cycleFlattened = cycles.flat();
      assert.ok(cycleFlattened.includes("@durable-zero/pkg-a"));
      assert.ok(cycleFlattened.includes("@durable-zero/pkg-b"));

      // Verify edge provenance is tracked:
      const sourceEdges = edges.filter((e) => e.kind === "source-import");
      assert.ok(sourceEdges.length >= 2, "Must record source-import edge provenance");
    });

    it("CORRECTLY DETECTS cross-package barrel re-export cycle with omitted manifest edge", () => {
      const mockWorkspace = path.join(
        FIXTURES_ROOT,
        "mock-reexport-cycle-workspace"
      );
      const pkgXDir = path.join(mockWorkspace, "packages/pkg-x");
      const pkgYDir = path.join(mockWorkspace, "packages/pkg-y");
      fs.mkdirSync(path.join(pkgXDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgYDir, "src"), { recursive: true });

      fs.writeFileSync(
        path.join(pkgXDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-x", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-y", dependencies: {} }),
        "utf8"
      );

      // Barrel re-export cycle:
      fs.writeFileSync(
        path.join(pkgXDir, "src/index.ts"),
        `export * from "@durable-zero/pkg-y";`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "src/index.ts"),
        `export * from "@durable-zero/pkg-x";`,
        "utf8"
      );

      const { graph, edges } = checker.buildFullWorkspaceGraph(mockWorkspace);
      const cycles = checker.detectDependencyCycles(graph);

      assert.ok(cycles.length >= 1, "Must detect barrel re-export cycle");
      const reexportEdges = edges.filter((e) => e.kind === "export-reexport");
      assert.ok(reexportEdges.length >= 2, "Must track export-reexport provenance");
    });

    it("CORRECTLY DETECTS relative path cross-package escape cycle", () => {
      const mockWorkspace = path.join(
        FIXTURES_ROOT,
        "mock-relative-cycle-workspace"
      );
      const pkg1Dir = path.join(mockWorkspace, "packages/pkg-1");
      const pkg2Dir = path.join(mockWorkspace, "packages/pkg-2");
      fs.mkdirSync(path.join(pkg1Dir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkg2Dir, "src"), { recursive: true });

      fs.writeFileSync(
        path.join(pkg1Dir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-1", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkg2Dir, "package.json"),
        JSON.stringify({ name: "@durable-zero/pkg-2", dependencies: {} }),
        "utf8"
      );

      fs.writeFileSync(
        path.join(pkg1Dir, "src/index.ts"),
        `import { two } from "../../pkg-2/src/index.ts"; export const one = 1;`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkg2Dir, "src/index.ts"),
        `import { one } from "../../pkg-1/src/index.ts"; export const two = 2;`,
        "utf8"
      );

      const { graph } = checker.buildFullWorkspaceGraph(mockWorkspace);
      const cycles = checker.detectDependencyCycles(graph);
      assert.ok(cycles.length >= 1, "Must detect relative cross-package import cycle");
    });
  });

  describe("Verification 3 (FND-TASK5-03): Dynamic Evidence & Report Integrity", () => {
    it("generates status 'FAIL' in report.json when live audit finds violations (anti-false-pass)", () => {
      const fakeAudit: checker.LiveAuditResult = {
        status: "FAIL",
        coreFilesScanned: 16,
        coreBoundaryViolations: [
          {
            file: "packages/core/src/policy/store.ts",
            line: 5,
            character: 1,
            specifier: "@earendil-works/pi-durable",
            kind: "static-import",
            rule: "AP-010",
            severity: "P0",
            message: "Forbidden vendor dependency",
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

      const outDir = path.join(FIXTURES_ROOT, "dynamic-report-test");
      const { jsonPath, mdPath } = checker.generateAuditReport(fakeAudit, outDir);

      const reportData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(reportData.status, "FAIL", "Report status must be FAIL");
      assert.equal(reportData.summary.coreBoundaryViolationsCount, 1);
      assert.equal(reportData.summary.totalViolations, 1);

      const mdContent = fs.readFileSync(mdPath, "utf8");
      assert.ok(mdContent.includes("**FAIL**"));
      assert.ok(mdContent.includes("Forbidden vendor dependency"));
    });

    it("generates status 'FAIL' in report.json when test receipt reports test failure", () => {
      const cleanAudit: checker.LiveAuditResult = {
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

      const outDir = path.join(FIXTURES_ROOT, "failed-receipt-test");
      const { jsonPath } = checker.generateAuditReport(cleanAudit, outDir, {
        totalTests: 23,
        passed: 22,
        failed: 1,
        durationMs: 350,
        exitCode: 1,
      });

      const reportData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(
        reportData.status,
        "FAIL",
        "Report status must be FAIL when test receipt reports failures"
      );
      assert.equal(reportData.summary.testSuiteResults.failed, 1);
    });
  });

  describe("Verification 4 (FND-TASK5-04): AST Syntax Coverage & Extension Support", () => {
    it("CORRECTLY DETECTS dynamic import using no-substitution template literal (import(`vendor`))", () => {
      const tempFile = path.join(FIXTURES_ROOT, "template-import.ts");
      fs.writeFileSync(
        tempFile,
        `export async function load() { return await import(\`@earendil-works/pi-durable\`); }`,
        "utf8"
      );

      const deps = checker.extractAstDependencies(tempFile);
      assert.equal(deps.length, 1);
      assert.equal(deps[0].kind, "dynamic-import");
      assert.equal(deps[0].specifier, "@earendil-works/pi-durable");

      const violations = checker.auditCoreFileBoundaries(tempFile, FIXTURES_ROOT);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, "AP-010");
      assert.equal(violations[0].severity, "P0");
    });

    it("CORRECTLY DETECTS TypeScript import = require('...') syntax", () => {
      const tempFile = path.join(FIXTURES_ROOT, "import-require.ts");
      fs.writeFileSync(
        tempFile,
        `import fs = require("node:fs"); export const x = fs;`,
        "utf8"
      );

      const deps = checker.extractAstDependencies(tempFile);
      assert.equal(deps.length, 1);
      assert.equal(deps[0].kind, "import-equals");
      assert.equal(deps[0].specifier, "node:fs");

      const violations = checker.auditCoreFileBoundaries(tempFile, FIXTURES_ROOT);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].rule, "AP-012");
      assert.equal(violations[0].severity, "P1");
    });

    it("collectAllSourceFiles discovers all supported extensions (.ts, .mts, .cts, .js, .mjs, .cjs, .tsx, .jsx) and excludes node_modules/dist", () => {
      const extDir = path.join(FIXTURES_ROOT, "ext-discovery-test");
      fs.mkdirSync(path.join(extDir, "node_modules"), { recursive: true });
      fs.mkdirSync(path.join(extDir, "dist"), { recursive: true });

      fs.writeFileSync(path.join(extDir, "file.ts"), "");
      fs.writeFileSync(path.join(extDir, "file.mts"), "");
      fs.writeFileSync(path.join(extDir, "file.cts"), "");
      fs.writeFileSync(path.join(extDir, "file.js"), "");
      fs.writeFileSync(path.join(extDir, "file.mjs"), "");
      fs.writeFileSync(path.join(extDir, "file.cjs"), "");
      fs.writeFileSync(path.join(extDir, "file.tsx"), "");
      fs.writeFileSync(path.join(extDir, "file.jsx"), "");
      fs.writeFileSync(path.join(extDir, "file.json"), ""); // Not in allowedExtensions
      fs.writeFileSync(path.join(extDir, "node_modules/bad.ts"), ""); // Must be excluded
      fs.writeFileSync(path.join(extDir, "dist/bundle.js"), ""); // Must be excluded

      const found = checker.collectAllSourceFiles(extDir);
      assert.equal(found.length, 8, "Must discover exactly 8 source files");
      const extensions = found.map((f) => path.extname(f).toLowerCase()).sort();
      assert.deepEqual(
        extensions,
        [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].sort()
      );
    });
  });
});
