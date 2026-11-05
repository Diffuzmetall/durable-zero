# Independent Architecture & Adversarial Final Review: Task 5A (Fix Round 4)

**Date:** 2026-11-05  
**Reviewer Role:** Independent Architecture / Adversarial Reviewer (Pi Provider, zero subagents)  
**Target Repository:** `/Users/vanya/Projects/durable-zero`  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Frozen Candidate Commit:** `475745bb6c439cd4746b55335783ba22bb4b355f`  
**Candidate Modular Source:**
- `packages/core/test/architecture-boundaries-ast.ts` (239 LOC)
- `packages/core/test/architecture-boundaries-core.ts` (165 LOC)
- `packages/core/test/architecture-boundaries-cli.ts` (243 LOC)
- `packages/core/test/architecture-boundaries-runner-verify.ts` (127 LOC)
- `packages/core/test/architecture-boundaries-dag.ts` (237 LOC)
- `packages/core/test/architecture-boundaries-report.ts` (234 LOC)
- `packages/core/test/architecture-boundaries-checker.ts` (11 LOC facade)  
**Regression Tests:** `packages/core/test/architecture-boundaries-regressions.test.ts` (542 LOC)  
**Main Test Suite:** `packages/core/test/architecture-boundaries.test.ts` (47/47 passing tests)  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-4/`

---

## 1. Executive Summary & Final Verdict

In Fix Round 4 (`475745bb`), the author incorporated the official TypeScript `TypeChecker` call signature API into `verifyFileExportsMain` and added strict package export resolution in `architecture-boundaries-cli.ts`.

Both the parent's standalone adjudication suite (`parent-adjudication/round-4/`, 4/4 passing, exit code 0) and our comprehensive independent adversarial test suite (`r4-adversarial.test.ts`, 22/22 passing) confirm that **all structural false-green bypasses and callable target defects are resolved**:
1. **Genuine Callable Target Verification:**
   - `verifyFileExportsMain` uses `program.getTypeChecker()` and resolves `type.getCallSignatures()`.
   - Primitive-returning call expressions (`main = Number('17')`), primitive identifiers (`main = n` where `n = 17`), primitive aliased re-exports (`export { n as main }` where `n = 17`), and boolean constants (`main = false`) are **strictly rejected**.
   - Modules with unrelated function exports but no `main` are **strictly rejected** (no false rescue by siblings).
   - Malformed/unparseable syntax fails closed.
   - Legitimate function declarations, arrow functions, async functions, function re-exports, and the production compiled esbuild bundle in `packages/runner/dist/main.js` are **strictly accepted**.
2. **CLI Serve Invariant & Package Export Resolution:**
   - `resolveRunnerPackageExport` validates target package identity against `packages/runner/package.json` (`pkgJson.name === "@durable-zero/runner"`).
   - Declared package exports (`pkgJson.exports`) are resolved accurately; unexported subpaths (`@durable-zero/runner/invalid.js`) and fake package prefixes (`@durable-zero/runner-fake-package`) are **strictly rejected**.
   - `findServeIf` enforces strict binary equality (`=== "serve"`), rejecting inverted conditions (`!== "serve"`).
   - `scanInvocations` skips nested function declarations, rejecting dead-code calls in uncalled functions.
3. **AP-019 Modular Decomposition:**
   - Every single component submodule is strictly **<= 250 LOC** (11 to 243 LOC), satisfying the AP-019 hard limit.
   - All modules import cleanly with zero side-effects.
4. **Unified Workspace DAG & Report Integrity:**
   - Full AST source, dynamic import, and re-export scanning across all workspace packages confirmed 100% acyclic (0 cycles).
   - Dynamically generated reports strictly author `FAIL` upon any defect and `PASS` when clean; zero false PASS receipts.

With zero open P0, P1, or P2 defects remaining across the entire Task 5A scope, the architecture boundary guard is completely sound and ready for acceptance.

### **FINAL VERDICT: PASS**

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability (AP-074, AP-076)
- **Status:** PASS
- **Evidence:** `auditCliServeEntrypoint` actively traces the imported binding from dynamic import declarations (`importType: "destructured-main" | "namespace"`) to actual top-level CallExpressions, filtering out locally declared variables, shadowed functions, and uninvoked nested function bodies.

### Probe 2: Runtime Completeness & Split-Brain Detection
- **Status:** PASS
- **Evidence:** Clean deletion of legacy files in `packages/core/src/` verified. `packages/core/scripts/build-runner.mjs` remains logged as [P3] for whole-cycle cleanup.

### Probe 3: Entry Point Wiring (AP-020, AP-075)
- **Status:** PASS
- **Evidence:** Production `packages/cli/bin/durable-zero.js` wiring is verified to dynamically import `runner` (`../../runner/dist/main.js`) and execute `main(args)`, with the target file existing on disk and exporting a verified callable `main` function (call signatures > 0).

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Status:** PASS (AP-019 Hard Limit Satisfied)
- **Evidence:** All 7 checker modules are strictly <= 250 LOC:
  - `architecture-boundaries-checker.ts`: 11 LOC
  - `architecture-boundaries-runner-verify.ts`: 127 LOC
  - `architecture-boundaries-core.ts`: 165 LOC
  - `architecture-boundaries-report.ts`: 234 LOC
  - `architecture-boundaries-dag.ts`: 237 LOC
  - `architecture-boundaries-ast.ts`: 239 LOC
  - `architecture-boundaries-cli.ts`: 243 LOC

---

## 3. Independent Adversarial Probes Summary (`r4-adversarial.test.ts`)

- **Command:** `node --test docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-4/r4-adversarial.test.ts`
- **Results:** 22 tests executed, **22 passed, 0 failed** (duration: 14.4s).
- **Log:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-4/test-output.txt`
- **JUnit:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-4/junit.xml`

### Highlights:
1. **TypeChecker Signature Rejection Probes:**
   - `export const main = Number('17')` -> **REJECTED** (0 call signatures).
   - `export const main = n` (where `n = 17`) -> **REJECTED** (0 call signatures).
   - `export { n as main }` (where `n = 17`) -> **REJECTED** (aliased symbol has 0 call signatures).
   - `export const main = false` -> **REJECTED** (primitive boolean).
   - Module exporting `helper()` but no `main` -> **REJECTED** (not rescued by siblings).
   - Syntax error -> **FAILS CLOSED** (`returns false`).
2. **Genuine Positives:**
   - `export function main()`, `export async function main()`, `export const main = () => {}`, and `export { run as main }` -> **ACCEPTED**.
   - Production bundle `packages/runner/dist/main.js` -> **ACCEPTED**.
3. **CLI Serve Invariants:**
   - Production `packages/cli/bin/durable-zero.js` -> **ACCEPTED**.
   - Direct call `main()`, alias `runRunner()`, and namespace `runner.main()` -> **ACCEPTED**.
   - Inverted condition `!== 'serve'` -> **REJECTED**.
   - Uncalled nested function `main()` -> **REJECTED**.
   - Unexported runner subpath -> **REJECTED**.
   - Fake package prefix -> **REJECTED**.
4. **Reporter Failure Negative Control:**
   - Live audit with defects strictly generates `status: "FAIL"` and populates violation counts.
   - Test receipt failure strictly generates `status: "FAIL"`.
5. **Module Purity:**
   - Zero side-effects on import across all checker modules.

---

## 4. Findings Matrix (Fix Round 4 - Final)

| Finding ID | Severity | Status | Title & Rule | Action / Outcome |
| :--- | :---: | :---: | :--- | :--- |
| **FND-TASK5-01-R4** | **P1** | **RESOLVED** | CLI Serve Guard Invariant Enforcement & TypeChecker-Backed Target Verification (AP-076, AP-021) | Verified PASS |
| **FND-TASK5-AP019-R4** | **P2** | **RESOLVED** | Modular Checker Decomposition into Cohesive Submodules <= 250 LOC (AP-019, AP-018) | Verified PASS |
| **FND-TASK5-02-R4** | **P1** | **RESOLVED** | Unified Workspace DAG Cycle Detection via Source & Re-Exports (AP-025, AP-076) | Verified PASS |
| **FND-TASK5-03-R4** | **P1** | **RESOLVED** | Durable Evidence & Dynamic Reporting Integrity (AP-076, AP-012) | Verified PASS |
| **FND-TASK5-04-R4** | **P2** | **RESOLVED** | AST Syntax Coverage & Multi-Extension Discovery (AP-025, AP-076) | Verified PASS |
| **FND-MONOREPO-CYCLE-01** | **P1** | **RESOLVED** | Monorepo Contracts Re-Export Cycle Resolved in Commit 0d1195b (AP-020, AP-025) | Verified PASS (0 cycles in 475745bb) |
| **FND-TASK5-05** | **P3** | **LOGGED** | Unreferenced `packages/core/scripts/build-runner.mjs` on disk (AP-018) | log-only (whole-cycle cleanup) |

---

## 5. Architecture Verification

- **Passed AP Rules:**
  - **AP-010 (Modular Monolith + Ports & Adapters):** Core domain pure, SPIs decoupled.
  - **AP-012 (Fail-Fast & Zero Concrete I/O in Core):** Node I/O forbidden modules strictly enforced.
  - **AP-019 (Line Budget & Meaningful Decomposition):** All 7 checker submodules strictly <= 250 LOC.
  - **AP-020 (Clean Architecture & Inversion of Control):** Monorepo package DAG strictly acyclic; layering enforced.
  - **AP-021 (Thin Entry Points):** Production CLI serve delegation verified with strict AST and TypeChecker-backed callable target checks.
  - **AP-025 (Import Discipline & Boundary Enforcement):** Dynamic import template literals, `import = require`, and all 8 module extensions handled.
  - **AP-076 (Assertion Integrity & Anti-Hollow Abstraction):** Guard verified with exhaustive behavioral tests; zero false PASS generation.

- **Residual Risk:**
  - Legacy `packages/core/scripts/build-runner.mjs` remains logged as [P3] for scheduled whole-cycle cleanup.
  - Task 5A checker infrastructure is complete, modular, and ready for acceptance.

Reviewer is now on **HOLD** for parent checkpoint and push.
