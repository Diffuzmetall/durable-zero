# Independent Architecture & Adversarial Review: Task 5A (Boundary & Regression Guards)

**Date:** 2026-11-04  
**Reviewer Role:** Independent Architecture / Adversarial Reviewer (Pi Provider, zero subagents)  
**Target Repository:** `/Users/vanya/Projects/durable-zero`  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Frozen Candidate Commit:** `07609af56742247003414564463cc99ebd0ac89f`  
**Candidate Source:** `packages/core/test/architecture-boundaries.test.ts` (1013 lines, SHA-256: `71a94b9bef3e4fef4c447bb958e1ffc7123f7bb3545a27078c9b2aec5d9fe7f9`)  
**Fixtures:** `packages/core/test/architecture-boundaries-fixtures/`  
**Author's Submitted Receipts:** `docs/arch-improvement/cycle-7/live/task-5-guards/{report.md,report.json,junit.xml,test-output.txt}`  
**Review Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/`

---

## 1. Executive Summary & Verdict

The author of Task 5A (`thr_rhrzagp727`) produced a comprehensive 1013-line test suite with 23 passing tests and 16 fixtures. The suite correctly validates basic static imports against pure `@durable-zero/core` domain boundaries, disallowing Node I/O and vendor packages.

However, an independent adversarial investigation demonstrates that **the guard is not yet sound**: several critical checks are either hollow, blind to declared failure modes, or generate deceptive pass receipts. Specifically:
1. `auditCliServeEntrypoint` computes `let callsMain = false` but never checks it before returning `isOk: true`, allowing hollow CLI serve branches that never invoke the runner to pass green. It also lacks path resolution, accepting nonexistent runner files.
2. The live workspace DAG cycle detector reads **only** `package.json` manifests, remaining completely blind to cross-package TypeScript source imports and re-export barrel cycles with omitted manifest edges (which was an explicit requirement of the task).
3. Suite 4's report generator hardcodes `status: "PASS"` and `coreBoundaryViolations: 0` unconditionally into `report.json`, which would emit a passing report even when Suite 3 detects violations.
4. The AST parser ignores dynamic imports using no-substitution template literals (``await import(`@earendil-works/pi-durable`)``) and `import = require(...)` statements.

Because of these P1/P2 defects in the guard's assertion integrity, Task 5A cannot be accepted in its current state.

### **VERDICT: FAIL** (Blocked by [P1]-01, [P1]-02, [P1]-03, [P2]-04)

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Traceability of Injected Dependencies (AP-074, AP-076)
- **Status:** PASS (Scoped to Candidate Test Helpers)
- **Evidence:** `auditCoreFileBoundaries` correctly traces extracted dependencies across AST nodes into rule violations. However, within `auditCliServeEntrypoint`, `callsMain` is calculated at line 335 but never consumed in the return condition at lines 357–380, representing a decorative variable that leads to hollow entry point acceptance.

### Probe 2: Runtime Completeness & Split-Brain Detection
- **Status:** PASS (with P3 whole-cycle observation)
- **Evidence:** Clean deletion of legacy core files (`runner-server.ts`, `jsonl.ts`, `cli-args.ts`, `host-rpc.ts`) in `packages/core/src/` is verified. Stale files `packages/core/scripts/build-runner.mjs` and `packages/core/dist/runner.js` exist on disk, but neither is invoked by `packages/core/package.json` nor by CLI. (See critical adjudication in Section 4).

### Probe 3: Entry Point Wiring (AP-020, AP-075)
- **Status:** FAIL ([P1]-01)
- **Evidence:** `packages/cli/bin/durable-zero.js` is inspected by `auditCliServeEntrypoint`. The production file currently calls `main(args)`, but the guard itself accepts invalid scripts that never call `main` or reference fake runner targets, failing to guarantee entry point wiring integrity.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Status:** FAIL ([P1]-03)
- **Evidence:** Suite 4 writes `report.json` with hardcoded values: `"status": "PASS"`, `"coreBoundaryViolations": 0`, `"workspaceAcyclic": true`. This violates AP-076 (Assertion Integrity) by decoupling the reported status from actual executed assertion results.

---

## 3. Adversarial Probes & Executable Proofs

All adversarial probes were executed independently in `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/adversarial-probes.test.ts` against an exact extraction of the frozen checker helpers (`extracted-checker.ts`, matching commit `07609af5` lines 1–495).

**Execution Receipt:**
- Test command: `node --test docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/adversarial-probes.test.ts`
- Result: **9 tests passed, 0 failed** (proving all 9 adversarial counterexamples).
- Log: `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/test-output.txt`
- JUnit: `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/junit.xml`

### Probe 1: `auditCliServeEntrypoint` Blindspots
1. **Uncalled `main()` (Hollow Serve Branch):**
   - Counterexample: CLI script imports runner/dist/main.js, but never calls `main()`.
   - Result: `auditCliServeEntrypoint` returns `{ isOk: true, targetImport: "../../runner/dist/main.js" }`.
   - Proof: `callsMain` is calculated at line 335 but completely omitted from the return predicate at lines 357–380.
2. **Nonexistent Target Path:**
   - Counterexample: CLI script imports `"../../nonexistent-runner-xyz/dist/main.js"`.
   - Result: `auditCliServeEntrypoint` returns `{ isOk: true }`.
   - Proof: String matching checks only `.includes("runner")` and `.endsWith("main.js")`, without `fs.existsSync` or path resolution.
3. **Naive Regex Over Statements:**
   - Counterexample: Variable declaration `const dummy = "import('../../runner/dist/main.js')"`.
   - Result: `auditCliServeEntrypoint` matches the regex on `innerText` and returns `{ isOk: true }`.

### Probe 2: Workspace DAG Cycle Detection via Source & Re-Exports
- **Methodology & Limitations:** The candidate test suite implements its workspace graph builder inline within `it("verifies live workspace package DAG is strictly acyclic")` (lines 771–789) rather than exporting a standalone production graph-builder function. Probe 2 faithfully reproduces this exact inline manifest-builder logic against the exported AST and cycle-detection helpers to evaluate whether it respects cross-package source and re-export edges.
1. **Source Import Cycle with Omitted Manifest Edges:**
   - Counterexample: Package A imports Package B in TypeScript source; Package B imports Package A in source. Neither declares the other in `package.json` `dependencies`.
   - Result: The manifest-based DAG builder scans only `package.json` dependencies, finding **0 cycles**.
   - Proof: An AST-aware source scanner run on the same packages identifies the cycle immediately.
2. **Re-Export Barrel Cycle Evasion:**
   - Counterexample: Package X has `export * from "@mock/pkg-y"`; Package Y has `export * from "@mock/pkg-x"`. Manifests omit dependencies.
   - Result: Workspace DAG check reports `detectDependencyCycles(graph) == []` (clean PASS).

### Probe 3: Suite 4 Unconditional Report Generation & Genuine Failing Run Proof
- **Source Inspection Finding:** Suite 4 lines 864–885 construct `reportData` with hardcoded literals:
  ```ts
  status: "PASS",
  summary: {
    coreBoundaryViolations: 0,
    workspaceAcyclic: true,
    ...
  }
  ```
- **Genuine End-to-End Execution Receipt (Supplemental Isolated Run):**
  - To eliminate any reliance on parallel simulations and definitively prove the live behavior of candidate `07609af5`, an isolated temporary `git archive` copy of commit `07609af5` was created with `node_modules` symlinked solely for TypeScript AST parsing (preserving all original Core sources and receipts unmodified).
  - A single valid forbidden Core import (`import "@earendil-works/pi-durable";`) was added to `packages/core/src/version.ts` in that isolated copy.
  - The actual test suite was executed:
    `node --test --test-reporter=junit --test-reporter-destination=... --test-reporter=spec --test-reporter-destination=... packages/core/test/architecture-boundaries.test.ts`
  - **Empirical Outcome:**
    - Runner process exited with **exit code 1** (`fail 1`, `pass 22`).
    - Suite 3 failed: `AssertionError [ERR_ASSERTION]: Live packages/core/src has 1 boundary violations` at line 778.
    - Node test runner continued to Suite 4, which passed (`✔ generates structured evidence report with file SHA hashes`).
    - Generated `report.json` was captured and verified: despite the failed test run and the fact that `report.json` lists the violation under `files[].dependencies`, the top-level report summary emitted:
      ```json
      "status": "PASS",
      "summary": {
        "coreSourceFilesScanned": 16,
        "coreBoundaryViolations": 0,
        "corePackageJsonValid": true,
        "workspaceAcyclic": true,
        "cliServeDelegationValid": true
      }
      ```
  - **Saved Supplemental Artifacts:**
    - `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/supplemental/failing-runner-output.txt`
    - `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/supplemental/failing-runner-junit.xml`
    - `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/supplemental/false-pass-report.json`
    - `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/supplemental/false-pass-report.md`

### Probe 4: AST Syntax Blindspots
1. **Dynamic Import with Template Literal:**
   - Counterexample: `await import(\`@earendil-works/pi-durable\`)`.
   - Result: `ts.isStringLiteral(node.arguments[0])` returns `false` for `NoSubstitutionTemplateLiteral`. 0 violations reported.
2. **TypeScript `import = require(...)`:**
   - Counterexample: `import fs = require("node:fs");`.
   - Result: `extractAstDependencies` does not inspect `ts.isImportEqualsDeclaration`. 0 violations reported.
3. **Ignored File Extensions:**
   - Counterexample: Files ending in `.mts`, `.cts`, `.js`, or `.tsx`.
   - Result: `collectAllSourceFiles` only matches `.endsWith(".ts")`, ignoring other module extensions.

---

## 4. Adjudication on Legacy Build Script & Stale Dist

The author reported:
> `[P2] Lingering legacy build script in packages/core/scripts/build-runner.mjs and packages/core/dist/runner.js`

**Critical Review Adjudication:**
1. **Runtime & Product Impact:** `packages/core/package.json` contains no `"build:runner"` script. `packages/cli` delegates directly to `packages/runner/dist/main.js`. No runtime process or test invokes `build-runner.mjs`.
2. **Migration Classification:** As documented in `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md`, deleting `build-runner.mjs` is part of whole-cycle repository cleanup.
3. **Verdict:** This issue is reclassified from [P2] to **[P3] (Log-only / Whole-Cycle Cleanup)**. It is an unreferenced leftover file, not an active broken runtime defect, and does not block Task 5A acceptance on its own.

---

## 5. Formal Findings

- [P1] CLI Serve Entrypoint Checker Accepts Hollow Implementations & Nonexistent Paths
  - Evidence: `packages/core/test/architecture-boundaries.test.ts:316,335,357-380`; reproduced by Probe 1 in `adversarial-probes.test.ts`.
  - Impact: `auditCliServeEntrypoint` calculates `callsMain` but never checks it before returning `{ isOk: true }`. A CLI script that imports runner without calling `main()` or that points to a nonexistent file path erroneously passes.
  - Rule: AP-076 (Assertion Integrity & Anti-Hollow Abstraction), AP-021 (Thin Entry Points).
  - Fix decision: fix-now

- [P1] Workspace DAG Cycle Detector Relies Exclusively on package.json Manifests, Completely Blind to Cross-Package Source & Re-Export Cycles
  - Evidence: `packages/core/test/architecture-boundaries.test.ts:771-789`; reproduced by Probe 2 in `adversarial-probes.test.ts`.
  - Impact: Cross-package imports and re-export barrels in TypeScript source that omit `package.json` edges completely evade the monorepo cycle detector, violating the explicit worker brief requirement.
  - Rule: AP-025 (Import Discipline & Boundary Enforcement), AP-076 (Assertion Integrity).
  - Fix decision: fix-now

- [P1] Suite 4 Evidence Generator Hardcodes Unconditional 'status: PASS' and 'coreBoundaryViolations: 0' Independent of Test Results
  - Evidence: `packages/core/test/architecture-boundaries.test.ts:864-885`; reproduced by Probe 3 in `adversarial-probes.test.ts`.
  - Impact: If Suite 3 detects a forbidden import and fails, Suite 4 still runs and overwrites `report.json` with `status: "PASS"` and `0` violations, creating false green receipts.
  - Rule: AP-076 (Assertion Integrity & Anti-Hollow Abstraction), AP-012 (Fail-Fast & Explicit Error Contracts).
  - Fix decision: fix-now

- [P2] AST Dependency Extractor Ignores Dynamic Import Template Literals, import = require, and Non-.ts Extensions
  - Evidence: `packages/core/test/architecture-boundaries.test.ts:127-133,454`; reproduced by Probe 4 in `adversarial-probes.test.ts`.
  - Impact: Forbidden dynamic imports using template literals (``import(`vendor`)``) or `import = require(...)` bypass AST detection. Source files with `.mts`, `.cts`, or `.js` extensions are ignored by file scanning.
  - Rule: AP-025 (Import Discipline), AP-076 (Anti-Hollow Abstraction).
  - Fix decision: fix-now

- [P3] Unreferenced Pre-Migration Legacy Build Script and Dist Artifact in Core
  - Evidence: `packages/core/scripts/build-runner.mjs` and `packages/core/dist/runner.js`.
  - Impact: Obsolete build script left on disk; not referenced by any package.json or production entry point.
  - Rule: AP-018 (Clarity), AP-020 (Composition Root).
  - Fix decision: log-only (scheduled for whole-cycle cleanup).

---

## 6. Architecture Verification Summary

- **Passed Rules (In Scope for Tested Boundaries):**
  - **AP-010 (Modular Monolith + Ports & Adapters):** Core SPIs and positive domain fixtures demonstrate pure port isolation.
  - **AP-012 (Zero Concrete I/O in Core):** Node I/O negative fixtures verify basic forbidden module blocking (`node:fs`, `node:child_process`, `node:net`).
  - **AP-020 (Clean Architecture & Inversion of Control):** Inter-tier layering rules properly reject core depending on adapters or runner.

- **Failed Rules:**
  - **AP-076 (Assertion Integrity & Anti-Hollow Abstraction):** Fails on unchecked `callsMain`, hardcoded report values, and manifest-only DAG blindspot.
  - **AP-025 (Import Discipline & Boundary Enforcement):** Fails on unhandled dynamic import template literals and source-level cross-package import cycles.
  - **AP-021 (Thin Entry Points):** Fails on CLI serve audit missing path resolution and hollow execution verification.

- **Semantic Probes:**
  - Dependency Traceability: PASS (with decorative variable finding in entry point audit)
  - Runtime Completeness: PASS (legacy build script triaged as P3 whole-cycle cleanup)
  - Entry Point Wiring: FAIL ([P1]-01)
  - Implementation Completeness: FAIL ([P1]-03)

- **Residual Risk:**
  - Remediating Task 5A requires updating `packages/core/test/architecture-boundaries.test.ts` to evaluate `callsMain`, resolve target paths on disk, scan cross-package AST imports for the workspace DAG, handle template literals and `import = require`, and link `report.json` dynamically to actual scan violation counts.
  - Author `thr_rhrzagp727` must remain under source-write HOLD until parent routes these findings.

---

**FINAL VERDICT: FAIL**
