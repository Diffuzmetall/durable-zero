import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  extractAstDependencies,
  auditCoreFileBoundaries,
  auditPackageJsonDependencies,
  auditCliServeEntrypoint,
  buildFullWorkspaceGraph,
  detectDependencyCycles,
  verifyPackageLayering,
  collectAllSourceFiles,
  computeSha256,
  auditLiveWorkspace,
  generateAuditReport,
  type BoundaryViolation,
  type LiveAuditResult,
} from "./architecture-boundaries-checker.ts";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "architecture-boundaries-fixtures"
);
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const CORE_SRC_DIR = path.resolve(REPO_ROOT, "packages/core/src");
const CORE_PKG_JSON = path.resolve(REPO_ROOT, "packages/core/package.json");
const CLI_BIN_FILE = path.resolve(
  REPO_ROOT,
  "packages/cli/bin/durable-zero.js"
);
const REPORT_DIR = path.resolve(
  REPO_ROOT,
  "docs/arch-improvement/cycle-7/live/task-5-guards/fix-round-2"
);

describe("Task 5A: Architecture Boundaries & Regression Guards (Fix Round 1)", () => {
  describe("Suite 1: Negative Fixture Tests (Verifying Detector Catches Real Defects)", () => {
    it("fails on forbidden vendor import (@earendil-works/pi-durable)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-vendor.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect vendor violation");
      const v = violations.find((x) =>
        x.specifier.includes("@earendil-works/pi-durable")
      );
      assert.ok(v, "Must pinpoint forbidden specifier");
      assert.equal(v?.rule, "AP-010");
      assert.equal(v?.severity, "P0");
    });

    it("fails on forbidden adapter import (@durable-zero/adapter-pi-durable)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-adapter.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect adapter violation");
      const v = violations.find((x) =>
        x.specifier.includes("@durable-zero/adapter-pi-durable")
      );
      assert.ok(v, "Must pinpoint adapter specifier");
      assert.equal(v?.rule, "AP-020");
    });

    it("fails on forbidden runner import (@durable-zero/runner)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-runner.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect runner violation");
      const v = violations.find((x) =>
        x.specifier.includes("@durable-zero/runner")
      );
      assert.ok(v, "Must pinpoint runner specifier");
      assert.equal(v?.rule, "AP-020");
    });

    it("fails on forbidden concrete Node I/O imports (node:fs, node:child_process, node:net)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-node-io.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(
        violations.length >= 3,
        `Expected at least 3 I/O violations, got ${violations.length}`
      );
      const specifiers = violations.map((v) => v.specifier);
      assert.ok(specifiers.includes("node:fs"));
      assert.ok(specifiers.includes("node:child_process"));
      assert.ok(specifiers.includes("node:net"));
      assert.equal(violations[0].rule, "AP-012");
    });

    it("fails on forbidden type-only vendor import (import type { ... })", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-type-import.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect type-only vendor import");
      assert.equal(violations[0].kind, "type-import");
      assert.equal(
        violations[0].specifier,
        "@earendil-works/pi-coding-agent"
      );
    });

    it("fails on forbidden TypeScript import-type syntax (import('mod').Type)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-import-type.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect import-type syntax");
      assert.equal(violations[0].kind, "import-type");
      assert.equal(violations[0].specifier, "@earendil-works/pi-ai");
    });

    it("fails on forbidden literal dynamic import (await import('adapter'))", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-dynamic-import.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect dynamic import");
      assert.equal(violations[0].kind, "dynamic-import");
      assert.equal(
        violations[0].specifier,
        "@durable-zero/adapter-codemode"
      );
    });

    it("fails on forbidden template literal dynamic import (import(`vendor`)) [FND-TASK5-04]", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-template-dynamic-import.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect template literal dynamic import");
      assert.equal(violations[0].kind, "dynamic-import");
      assert.equal(violations[0].specifier, "@earendil-works/pi-durable");
    });

    it("fails on forbidden TypeScript import = require syntax [FND-TASK5-04]", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-import-require.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect import = require syntax");
      assert.equal(violations[0].kind, "import-equals");
      assert.equal(violations[0].specifier, "node:fs");
    });

    it("fails on forbidden re-export barrel (export * from 'vendor')", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-reexport-barrel.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect re-export barrel");
      assert.equal(violations[0].kind, "export-reexport");
      assert.equal(violations[0].specifier, "@earendil-works/chord");
    });

    it("fails on relative path escaping core root (../../../adapter)", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-relative-escape.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.ok(violations.length >= 1, "Must detect relative escape");
      assert.equal(violations[0].rule, "AP-025");
      assert.ok(violations[0].message.includes("escapes core source root"));
    });

    it("fails on package.json declaring vendor dependencies in Core", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/forbidden-core-package.json"
      );
      const violations = auditPackageJsonDependencies(fixture);
      assert.ok(
        violations.length >= 1,
        "Must flag forbidden package.json dependency"
      );
      assert.equal(
        violations[0].specifier,
        "@earendil-works/pi-durable"
      );
    });

    it("fails on legacy CLI serve entrypoint pointing to deleted core runner", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/legacy-cli-serve.js"
      );
      const result = auditCliServeEntrypoint(fixture);
      assert.equal(result.isOk, false);
      assert.ok(
        result.error?.includes("Legacy entrypoint detected"),
        `Unexpected error: ${result.error}`
      );
    });

    it("fails on hollow CLI serve entrypoint that never calls main() [FND-TASK5-01]", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/hollow-cli-serve.js"
      );
      const result = auditCliServeEntrypoint(fixture);
      assert.equal(result.isOk, false);
      assert.equal(result.callsMain, false);
      assert.match(result.error ?? "", /Hollow implementation detected/i);
    });

    it("fails on CLI serve pointing to nonexistent runner file on disk [FND-TASK5-01]", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/nonexistent-runner-cli-serve.js"
      );
      const result = auditCliServeEntrypoint(fixture);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /does not exist on disk/i);
    });

    it("fails on CLI script matching dynamic import only in string literal [FND-TASK5-01]", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "negative/dummy-string-cli-serve.js"
      );
      const result = auditCliServeEntrypoint(fixture);
      assert.equal(result.isOk, false);
      assert.match(result.error ?? "", /does not perform an AST dynamic import/i);
    });

    it("fails on source-level cross-package import cycle with omitted manifest edges [FND-TASK5-02]", () => {
      const cycleWs = path.join(
        FIXTURES_DIR,
        "negative/source-cycle-workspace"
      );
      const { graph } = buildFullWorkspaceGraph(cycleWs);
      const cycles = detectDependencyCycles(graph);
      assert.ok(cycles.length >= 1, "Must detect source-level import cycle");
      assert.ok(
        cycles.some(
          (c) =>
            c.includes("@durable-zero/pkg-alpha") &&
            c.includes("@durable-zero/pkg-beta")
        ),
        "Cycle must include pkg-alpha and pkg-beta"
      );
    });
  });

  describe("Suite 2: Positive Fixture Tests (Verifying Allowed Dependencies Pass)", () => {
    it("passes cleanly on pure domain service with contracts and zod", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "positive/clean-core-service.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.deepEqual(
        violations,
        [],
        "Clean domain service must have zero violations"
      );
    });

    it("passes cleanly on pure TypeScript port definitions", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "positive/clean-domain-port.ts"
      );
      const violations = auditCoreFileBoundaries(fixture, FIXTURES_DIR);
      assert.deepEqual(
        violations,
        [],
        "Clean port must have zero violations"
      );
    });

    it("passes cleanly on conformant Core package.json", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "positive/clean-core-package.json"
      );
      const violations = auditPackageJsonDependencies(fixture);
      assert.deepEqual(
        violations,
        [],
        "Conformant package.json must have zero violations"
      );
    });

    it("passes cleanly on real CLI serve entrypoint fixture pointing to runner and calling main()", () => {
      const fixture = path.join(
        FIXTURES_DIR,
        "positive/clean-cli-serve.js"
      );
      const result = auditCliServeEntrypoint(fixture);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
      assert.ok(result.targetImport?.includes("runner/dist/main.js"));
    });

    it("scans all supported source file extensions (.ts, .mts, .cts, .js, .mjs, .cjs, .tsx)", () => {
      const testDir = path.join(
        FIXTURES_DIR,
        "fix-round-1-regressions/ext-check"
      );
      if (fs.existsSync(testDir)) {
        const files = collectAllSourceFiles(testDir);
        assert.equal(files.length, 7, "Must scan all 7 supported extensions");
      }
    });

    it("passes cleanly on acyclic multi-tier workspace", () => {
      const cleanGraph = new Map<string, string[]>([
        ["@durable-zero/contracts", []],
        ["@durable-zero/core", ["@durable-zero/contracts"]],
        [
          "@durable-zero/adapter-pi-durable",
          ["@durable-zero/contracts", "@durable-zero/core"],
        ],
        [
          "@durable-zero/runner",
          ["@durable-zero/adapter-pi-durable", "@durable-zero/core"],
        ],
      ]);
      const cycles = detectDependencyCycles(cleanGraph);
      assert.deepEqual(cycles, [], "Must have zero cycles");
      const layeringViolations = verifyPackageLayering(cleanGraph);
      assert.deepEqual(
        layeringViolations,
        [],
        "Must have zero layering violations"
      );
    });
  });

  describe("Suite 3: Live Project Source Snapshot Execution", () => {
    it("scans live packages/core/src/ and checks AST boundaries", () => {
      const coreFiles = collectAllSourceFiles(CORE_SRC_DIR);
      assert.ok(
        coreFiles.length > 0,
        `Must find source files in ${CORE_SRC_DIR}`
      );

      const allViolations: BoundaryViolation[] = [];
      for (const file of coreFiles) {
        const violations = auditCoreFileBoundaries(file, CORE_SRC_DIR);
        allViolations.push(...violations);
      }

      assert.deepEqual(
        allViolations,
        [],
        `Live packages/core/src has ${allViolations.length} boundary violations: ${JSON.stringify(allViolations, null, 2)}`
      );
    });

    it("verifies live packages/core/package.json contains only contracts and zod", () => {
      const violations = auditPackageJsonDependencies(CORE_PKG_JSON);
      assert.deepEqual(
        violations,
        [],
        `packages/core/package.json has violations: ${JSON.stringify(violations, null, 2)}`
      );
    });

    it("verifies live workspace package DAG is strictly acyclic via full AST source and manifest scan", () => {
      const { graph, edges } = buildFullWorkspaceGraph(REPO_ROOT);
      const cycles = detectDependencyCycles(graph);
      assert.deepEqual(
        cycles,
        [],
        `Circular package dependencies detected in workspace: ${JSON.stringify(cycles)}`
      );

      const layeringViolations = verifyPackageLayering(graph, edges);
      assert.deepEqual(
        layeringViolations,
        [],
        `Package layering violations detected: ${JSON.stringify(layeringViolations, null, 2)}`
      );
    });

    it("verifies live packages/cli/bin/durable-zero.js serve entry resolves to runner and calls main()", () => {
      const result = auditCliServeEntrypoint(CLI_BIN_FILE);
      assert.equal(
        result.isOk,
        true,
        `CLI serve entry audit failed: ${result.error}`
      );
      assert.equal(
        result.callsMain,
        true,
        "CLI serve branch must actively invoke main()"
      );
      assert.ok(
        result.targetImport?.includes("runner/dist/main.js"),
        `CLI serve must import runner main, got: ${result.targetImport}`
      );
      assert.ok(
        fs.existsSync(result.resolvedPath!),
        `Resolved runner file must exist on disk: ${result.resolvedPath}`
      );
    });

    it("verifies legacy deleted files do not exist in packages/core/src/", () => {
      const legacyFiles = [
        "runner-server.ts",
        "jsonl.ts",
        "cli-args.ts",
        "host-rpc.ts",
        "engine.ts",
      ];
      const existingLegacy: string[] = [];
      for (const legacy of legacyFiles) {
        const p = path.join(CORE_SRC_DIR, legacy);
        if (fs.existsSync(p)) {
          existingLegacy.push(legacy);
        }
      }
      assert.deepEqual(
        existingLegacy,
        [],
        `Legacy deleted files still lingering in packages/core/src: ${existingLegacy.join(", ")}`
      );
    });
  });

  describe("Suite 4: Durable Evidence & Report Integrity [FND-TASK5-03]", () => {
    it("dynamically generates evidence report from computed audit facts (no hardcoded PASS)", () => {
      const liveAudit = auditLiveWorkspace(REPO_ROOT);

      const { jsonPath, mdPath } = generateAuditReport(liveAudit, REPORT_DIR);
      assert.ok(fs.existsSync(jsonPath), "report.json must be written");
      assert.ok(fs.existsSync(mdPath), "report.md must be written");

      const savedReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      // Report status must dynamically match live audit status (never hardcoded PASS)
      assert.equal(
        savedReport.status,
        liveAudit.status,
        "Report status must accurately reflect live audit outcome"
      );
      assert.equal(
        savedReport.summary.coreBoundaryViolationsCount,
        liveAudit.coreBoundaryViolations.length
      );
      assert.equal(
        savedReport.summary.workspaceCyclesCount,
        liveAudit.workspaceCycles.length
      );
      assert.equal(
        savedReport.summary.totalViolations,
        liveAudit.coreBoundaryViolations.length +
          liveAudit.corePackageJsonViolations.length +
          liveAudit.workspaceCycles.length +
          liveAudit.layeringViolations.length +
          (liveAudit.cliServeAudit.isOk ? 0 : 1) +
          liveAudit.legacyFilesFound.length
      );
    });

    it("PROVES PIPELINE INTEGRITY: simulated forbidden Core mutation produces FAIL in report and non-zero violations (anti-false-pass)", () => {
      // Create isolated temporary workspace simulating a mutated core with forbidden vendor import
      const tempMutationRoot = path.join(
        FIXTURES_DIR,
        "fix-round-1-regressions/mutated-workspace"
      );
      const mutatedCoreSrc = path.join(
        tempMutationRoot,
        "packages/core/src"
      );
      fs.mkdirSync(mutatedCoreSrc, { recursive: true });

      // Copy one clean file and inject a forbidden vendor import
      fs.writeFileSync(
        path.join(mutatedCoreSrc, "violation.ts"),
        `import { Harness } from "@earendil-works/pi-durable";
export const x = 1;
`,
        "utf8"
      );
      // Valid package.json
      fs.writeFileSync(
        path.join(tempMutationRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "@durable-zero/core",
          dependencies: { "@durable-zero/contracts": "workspace:*", zod: "^4.0.0" },
        }),
        "utf8"
      );

      // Run live audit on this mutated root
      const mutatedAudit = auditLiveWorkspace(tempMutationRoot);
      assert.equal(
        mutatedAudit.status,
        "FAIL",
        "Mutated workspace audit MUST return FAIL"
      );
      assert.ok(
        mutatedAudit.coreBoundaryViolations.length >= 1,
        "Must record at least 1 violation"
      );

      // Generate report and assert that the report itself reflects FAIL
      const tempReportDir = path.join(tempMutationRoot, "reports");
      const { jsonPath } = generateAuditReport(mutatedAudit, tempReportDir);

      const generatedReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      assert.equal(
        generatedReport.status,
        "FAIL",
        "Pipeline CANNOT emit false PASS when violations exist!"
      );
      assert.equal(
        generatedReport.summary.coreBoundaryViolationsCount,
        mutatedAudit.coreBoundaryViolations.length
      );
      assert.notEqual(
        generatedReport.summary.totalViolations,
        0,
        "Total violations must not be 0 on mutated core"
      );
    });
  });
});
