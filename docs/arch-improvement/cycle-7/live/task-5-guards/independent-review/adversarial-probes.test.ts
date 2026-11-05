import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  extractAstDependencies,
  auditCoreFileBoundaries,
  auditPackageJsonDependencies,
  auditCliServeEntrypoint,
  detectDependencyCycles,
  verifyPackageLayering,
  collectAllSourceFiles,
  computeSha256,
} from "./extracted-checker.ts";

const ISOLATED_TEMP_DIR = path.resolve(
  import.meta.dirname,
  "isolated-adversarial-fixtures"
);

function setupIsolatedFixtures() {
  fs.mkdirSync(ISOLATED_TEMP_DIR, { recursive: true });
}

function cleanupIsolatedFixtures() {
  if (fs.existsSync(ISOLATED_TEMP_DIR)) {
    fs.rmSync(ISOLATED_TEMP_DIR, { recursive: true, force: true });
  }
}

describe("Adversarial Architecture Review Probes (Task 5A)", () => {
  setupIsolatedFixtures();

  describe("Probe 1: auditCliServeEntrypoint Blindspots", () => {
    it("FLAW PROVEN: passes a serve branch that imports runner but NEVER calls main() (hollow entrypoint)", () => {
      const hollowCliPath = path.join(
        ISOLATED_TEMP_DIR,
        "hollow-cli-serve.js"
      );
      // imports runner/dist/main.js, but callsMain is false because main() is never invoked!
      fs.writeFileSync(
        hollowCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runnerModule = await import("../../runner/dist/main.js");
  // Never calls main! Hollow implementation.
  console.log("Serving disabled or bypassed");
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(hollowCliPath);
      // The checker calculates callsMain = false internally, but NEVER checks it before returning { isOk: true }!
      // This assertion proves the checker returns isOk: true on a hollow serve branch:
      assert.equal(
        result.isOk,
        true,
        "Checker erroneously returned isOk: true because callsMain is ignored!"
      );
      assert.equal(result.targetImport, "../../runner/dist/main.js");
    });

    it("FLAW PROVEN: passes a serve target pointing to a NONEXISTENT runner file", () => {
      const nonexistentTargetCliPath = path.join(
        ISOLATED_TEMP_DIR,
        "nonexistent-target-cli.js"
      );
      // The target path contains 'runner' and ends with 'main.js', but does NOT exist on disk!
      fs.writeFileSync(
        nonexistentTargetCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("../../nonexistent-runner-xyz/dist/main.js");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(nonexistentTargetCliPath);
      // Checker does string matching only, never resolves path or checks existence on disk!
      assert.equal(
        result.isOk,
        true,
        "Checker erroneously returned isOk: true on nonexistent file path!"
      );
      assert.equal(
        result.targetImport,
        "../../nonexistent-runner-xyz/dist/main.js"
      );
    });

    it("FLAW PROVEN: matches dynamic import from string literals in comments or dummy variables via naive regex", () => {
      const dummyRegexCliPath = path.join(
        ISOLATED_TEMP_DIR,
        "dummy-regex-cli.js"
      );
      // import is inside a string literal assigned to a dummy variable; actual serve calls something else!
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

      const result = auditCliServeEntrypoint(dummyRegexCliPath);
      // The regex match inside AST variable statement extracted the target from the string literal 'Usage: await import(...)':
      assert.equal(
        result.isOk,
        true,
        "Checker used naive regex on innerText matching string literal!"
      );
      assert.equal(result.targetImport, "../../runner/dist/main.js");
    });
  });

  describe("Probe 2: Workspace DAG Cycle Detection via Source Imports / Re-exports (Suite 3 Manifest-Builder Logic Reproduction + Extracted AST Helpers)", () => {
    // Note on probe methodology: The candidate suite implements the manifest graph builder inline inside
    // Suite 3's `it("verifies live workspace package DAG is strictly acyclic")` rather than exporting a standalone
    // production graph builder. This probe faithfully reproduces that exact inline manifest-builder logic
    // alongside the exported AST and cycle-detection helpers to prove the blindspot.
    it("FLAW PROVEN: cross-package source import cycle evades workspace DAG check when package.json dependencies omit edge", () => {
      // Create mock workspace with 2 packages: pkg-a and pkg-b
      // pkg-a source imports from pkg-b
      // pkg-b source imports from pkg-a (making a real cycle!)
      // But neither package.json lists the other under dependencies!
      const mockWorkspace = path.join(ISOLATED_TEMP_DIR, "mock-workspace");
      const pkgADir = path.join(mockWorkspace, "pkg-a");
      const pkgBDir = path.join(mockWorkspace, "pkg-b");
      fs.mkdirSync(path.join(pkgADir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgBDir, "src"), { recursive: true });

      fs.writeFileSync(
        path.join(pkgADir, "package.json"),
        JSON.stringify({ name: "@mock/pkg-a", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "package.json"),
        JSON.stringify({ name: "@mock/pkg-b", dependencies: {} }),
        "utf8"
      );

      // Source-level cycle:
      fs.writeFileSync(
        path.join(pkgADir, "src/index.ts"),
        `import { b } from "@mock/pkg-b"; export const a = 1;`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgBDir, "src/index.ts"),
        `import { a } from "@mock/pkg-a"; export const b = 2;`,
        "utf8"
      );

      // Reproduce Suite 3's exact workspace DAG builder logic:
      const pkgDirs = fs.readdirSync(mockWorkspace);
      const manifestGraph = new Map<string, string[]>();

      for (const d of pkgDirs) {
        const pkgJsonPath = path.join(mockWorkspace, d, "package.json");
        if (fs.existsSync(pkgJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
          const deps = Object.keys(pkg.dependencies || {}).filter(
            (dep) => dep.startsWith("@mock/")
          );
          manifestGraph.set(pkg.name, deps);
        }
      }

      const cycles = detectDependencyCycles(manifestGraph);
      // Because Suite 3 relies ONLY on package.json dependencies, cycles is empty!
      assert.deepEqual(
        cycles,
        [],
        "Manifest-only DAG detector is blind to source-level cross-package import cycles!"
      );

      // Now verify that an AST-aware source scanner WOULD find the cycle:
      const astGraph = new Map<string, string[]>();
      for (const d of pkgDirs) {
        const pkgJsonPath = path.join(mockWorkspace, d, "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        const srcFiles = collectAllSourceFiles(path.join(mockWorkspace, d, "src"));
        const packageDeps = new Set<string>();
        for (const file of srcFiles) {
          const deps = extractAstDependencies(file);
          for (const dep of deps) {
            if (dep.specifier.startsWith("@mock/")) {
              packageDeps.add(dep.specifier);
            }
          }
        }
        astGraph.set(pkg.name, Array.from(packageDeps));
      }

      const astCycles = detectDependencyCycles(astGraph);
      assert.ok(
        astCycles.length > 0,
        "An AST source-aware checker correctly identifies the cross-package cycle!"
      );
    });

    it("FLAW PROVEN: cross-package barrel re-export cycle evades workspace DAG check", () => {
      const mockWorkspace = path.join(
        ISOLATED_TEMP_DIR,
        "mock-reexport-workspace"
      );
      const pkgXDir = path.join(mockWorkspace, "pkg-x");
      const pkgYDir = path.join(mockWorkspace, "pkg-y");
      fs.mkdirSync(path.join(pkgXDir, "src"), { recursive: true });
      fs.mkdirSync(path.join(pkgYDir, "src"), { recursive: true });

      fs.writeFileSync(
        path.join(pkgXDir, "package.json"),
        JSON.stringify({ name: "@mock/pkg-x", dependencies: {} }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "package.json"),
        JSON.stringify({ name: "@mock/pkg-y", dependencies: {} }),
        "utf8"
      );

      // Re-export barrel cycle:
      fs.writeFileSync(
        path.join(pkgXDir, "src/index.ts"),
        `export * from "@mock/pkg-y";`,
        "utf8"
      );
      fs.writeFileSync(
        path.join(pkgYDir, "src/index.ts"),
        `export * from "@mock/pkg-x";`,
        "utf8"
      );

      const manifestGraph = new Map<string, string[]>();
      for (const d of fs.readdirSync(mockWorkspace)) {
        const pkgJsonPath = path.join(mockWorkspace, d, "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        manifestGraph.set(pkg.name, Object.keys(pkg.dependencies || {}));
      }

      const cycles = detectDependencyCycles(manifestGraph);
      assert.deepEqual(
        cycles,
        [],
        "Manifest-only DAG detector completely misses re-export barrel cycles!"
      );
    });
  });

  describe("Probe 3: Suite 4 Unconditional PASS Report Integrity", () => {
    it("FLAW PROVEN: Suite 4 writes status 'PASS' and 0 violations unconditionally even when Core has boundary violations", () => {
      // Simulate Suite 4 report generation logic from architecture-boundaries.test.ts lines 864-885
      // Suppose Suite 3 detected 2 violations in a file:
      const simulatedViolations = [
        {
          file: "packages/core/src/policy/store.ts",
          line: 10,
          character: 1,
          specifier: "@earendil-works/pi-durable",
          kind: "static-import" as const,
          rule: "AP-010",
          severity: "P0" as const,
          message: "Forbidden vendor dependency",
        },
      ];

      // In architecture-boundaries.test.ts, Suite 4 does NOT receive violations from Suite 3.
      // Instead, reportData is constructed with hardcoded values:
      const reportData = {
        task: "Task 5A: Architecture Boundary & Regression Guards",
        timestamp: new Date().toISOString(),
        status: "PASS", // <--- HARDCODED
        sourceBaseline: "7d4b235",
        summary: {
          coreSourceFilesScanned: 16,
          coreBoundaryViolations: 0, // <--- HARDCODED
          corePackageJsonValid: true, // <--- HARDCODED
          workspaceAcyclic: true, // <--- HARDCODED
          cliServeDelegationValid: true,
          fixturesTested: {
            negativeFixturesCount: 11,
            positiveFixturesCount: 5,
          },
        },
      };

      // Even if simulatedViolations.length > 0, reportData.status is "PASS" and coreBoundaryViolations is 0!
      assert.equal(reportData.status, "PASS");
      assert.equal(reportData.summary.coreBoundaryViolations, 0);
      assert.notEqual(
        reportData.summary.coreBoundaryViolations,
        simulatedViolations.length,
        "Report generator hardcodes 0 violations and PASS, disconnected from actual audit results!"
      );
    });
  });

  describe("Probe 4: AST Syntax Blindspots", () => {
    it("FLAW PROVEN: ignores dynamic import with no-substitution template literal (import(`vendor`))", () => {
      const templateImportCode = `
export async function loadVendor() {
  const mod = await import(\`@earendil-works/pi-durable\`);
  return mod;
}
`;
      const tempFile = path.join(
        ISOLATED_TEMP_DIR,
        "template-dynamic-import.ts"
      );
      fs.writeFileSync(tempFile, templateImportCode, "utf8");

      const deps = extractAstDependencies(tempFile);
      // Because ts.isStringLiteral(node.arguments[0]) was used instead of handling template literals, deps is empty!
      assert.equal(
        deps.length,
        0,
        "extractAstDependencies failed to detect dynamic import using no-substitution template literal!"
      );

      const violations = auditCoreFileBoundaries(
        tempFile,
        ISOLATED_TEMP_DIR
      );
      assert.equal(
        violations.length,
        0,
        "Forbidden vendor import slipped past boundary checker due to template literal syntax!"
      );
    });

    it("FLAW PROVEN: ignores TypeScript import = require('...') syntax", () => {
      const importEqualsCode = `
import fs = require("node:fs");
export function readData() {
  return fs.readFileSync("foo");
}
`;
      const tempFile = path.join(ISOLATED_TEMP_DIR, "import-equals.ts");
      fs.writeFileSync(tempFile, importEqualsCode, "utf8");

      const deps = extractAstDependencies(tempFile);
      assert.equal(
        deps.length,
        0,
        "extractAstDependencies failed to detect import = require syntax!"
      );

      const violations = auditCoreFileBoundaries(
        tempFile,
        ISOLATED_TEMP_DIR
      );
      assert.equal(
        violations.length,
        0,
        "Forbidden Node I/O import slipped past boundary checker due to import = require syntax!"
      );
    });

    it("FLAW PROVEN: collectAllSourceFiles ignores .mts, .cts, .js and .tsx extensions", () => {
      const scanDir = path.join(ISOLATED_TEMP_DIR, "scan-ext-test");
      fs.mkdirSync(scanDir, { recursive: true });
      fs.writeFileSync(path.join(scanDir, "valid.ts"), "export const a = 1;");
      fs.writeFileSync(path.join(scanDir, "esm.mts"), "export const b = 2;");
      fs.writeFileSync(path.join(scanDir, "cjs.cts"), "export const c = 3;");
      fs.writeFileSync(path.join(scanDir, "script.js"), "export const d = 4;");
      fs.writeFileSync(path.join(scanDir, "view.tsx"), "export const e = 5;");

      const scanned = collectAllSourceFiles(scanDir);
      assert.equal(
        scanned.length,
        1,
        "Default collectAllSourceFiles scanned ONLY .ts files, ignoring .mts, .cts, .js, .tsx!"
      );
      assert.ok(scanned[0].endsWith("valid.ts"));
    });
  });
});
