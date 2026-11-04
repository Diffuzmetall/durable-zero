# Independent Architecture & Adversarial Re-Review: Task 5A (Fix Round 1 - Amended)

**Date:** 2026-11-05  
**Reviewer Role:** Independent Architecture / Adversarial Reviewer (Pi Provider, zero subagents)  
**Target Repository:** `/Users/vanya/Projects/durable-zero`  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Frozen Candidate Commit:** `2d0be594953483c2c0f4a550036ed355186f11f6`  
**Candidate Source:**
- `packages/core/test/architecture-boundaries-checker.ts` (1128 lines, SHA-256: `6295514f777bfb47...`)
- `packages/core/test/architecture-boundaries.test.ts` (883 lines)
- `packages/core/test/architecture-boundaries-regressions.test.ts` (331 lines)  
**Fixtures:** `packages/core/test/architecture-boundaries-fixtures/`  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-1/`

---

## 1. Executive Summary & Verdict (Amended)

Following critical architectural probing of the frozen candidate `2d0be594`, the initial assessment of complete FND-TASK5-01 resolution has been **re-examined and amended**. While the author successfully eliminated the naive text regex and added file existence checks, deeper adversarial analysis reveals that **`auditCliServeEntrypoint` still exhibits critical false-green vulnerabilities**, and the helper architecture breaches AP-019 size and cohesion baselines.

### Concrete Findings on Frozen 2d0 Checker:
1. **FND-TASK5-01 (CLI Serve Invariant) Remains OPEN / FAILING:**
   - **Unbound Callee Name Match:** In `architecture-boundaries-checker.ts` lines 499–514, `if (callee === importedBinding || callee === "main" || callee === "runRunner")` accepts any callee identifier literally named `"main"` or `"runRunner"` regardless of `importedBinding`. When a serve script imports runner as `unusedModule` and invokes an unrelated local `function main()`, the checker erroneously reports `isOk: true, callsMain: true`.
   - **Missing Target Export Verification:** The checker verifies that the target runner file exists on disk via `fs.existsSync`, but **never** inspects the target file's AST or module exports to confirm that `main` is actually exported. A file under runner that exports no `main` passes green.
   - **Weak Substring Package Check:** Line 619 tests `if (!resolvedPath.includes("runner"))`. An arbitrary exploit file whose parent path merely contains the word `"runner"` (e.g. `fake-runner-exploit/dist/main.js`) passes as a valid runner.
2. **AP-019 (Modular Cohesion & 250 LOC Hard Limit) Violation:**
   - `architecture-boundaries-checker.ts` is 1128 lines of monolithic synchronous analysis bundling 6 distinct roles: file discovery, AST dependency extraction, core boundary auditing, manifest parsing, CLI entrypoint auditing, workspace DAG generation, and dynamic Markdown/JSON report authoring. Unlike an inseparable streaming async runtime pipeline, these are independent synchronous modules requiring clean decomposition.
3. **FND-TASK5-02 (Unified Workspace DAG) is VERIFIED RESOLVED:**
   - Unified source + manifest scan catches cross-package source and re-export cycles. In fact, it immediately uncovered an active architectural violation in `packages/contracts/src/index.ts:15`.
4. **FND-TASK5-03 (Report Integrity) is VERIFIED RESOLVED:**
   - Dynamically-computed reports strictly emit `status: "FAIL"` and list all violations when defects exist; false PASS receipts are eliminated.
5. **FND-TASK5-04 (AST Syntax & Extensions) is VERIFIED RESOLVED:**
   - Template literals in dynamic imports, `import = require`, and all 8 module extensions are fully handled.

### **VERDICT: FAIL**
**Reasons for Rejection:**
- **[P1] FND-TASK5-01-RECHECK:** Unbound callee false-green, missing target export verification, and substring package match.
- **[P2] FND-TASK5-AP019-DECOMPOSITION:** Monolithic 1128 LOC helper bundling 6 independent roles without architectural decomposition.
- **[P1] FND-MONOREPO-CYCLE-01:** Active monorepo circular dependency in `packages/contracts/src/index.ts:15` (routed to native contracts owner).

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability (AP-074, AP-076)
- **Status:** FAIL ([P1] FND-TASK5-01-RECHECK)
- **Evidence:** `auditCliServeEntrypoint` lines 499–514 allows `callee === "main"` to trigger `callsMain = true` even when `importedBinding` is not invoked. Tracing between the dynamic import binding and the actual invocation is decoupled.

### Probe 2: Runtime Completeness & Split-Brain Detection
- **Status:** PASS
- **Evidence:** Legacy files in `packages/core/src/` remain purged. `packages/core/scripts/build-runner.mjs` remains logged as [P3] for whole-cycle cleanup.

### Probe 3: Entry Point Wiring (AP-020, AP-075)
- **Status:** FAIL ([P1] FND-TASK5-01-RECHECK)
- **Evidence:** The entrypoint checker accepts scripts that invoke an unrelated local function or point to files without an exported `main`, failing to guarantee real composition root wiring.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Status:** FAIL ([P2] FND-TASK5-AP019-DECOMPOSITION)
- **Evidence:** `packages/core/test/architecture-boundaries-checker.ts` is 1128 LOC (>4x the hard limit of 250 LOC). It groups independent synchronous AST, DAG, and reporting roles in a single file without modular decomposition.

---

## 3. Empirical Counterexample Receipts (`focused-counterexamples.test.ts`)

All three counterexamples were executed and confirmed in `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-1/focused-counterexamples.test.ts`.

- **Command:** `node --test docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-1/focused-counterexamples.test.ts`
- **Result:** 4 tests passed, 0 failed (confirming 3 false-green vulnerabilities + 1 legitimate positive).
- **Log:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-1/focused-counterexamples.txt`
- **JUnit:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-1/focused-counterexamples.junit.xml`

### Counterexamples Verified:
1. **Import real runner as `unusedModule` + call unrelated local `main()`:**
   - Script imports runner as `const unusedModule = await import(...)`, defines `function main() {}`, and calls `main()`.
   - Result: `auditCliServeEntrypoint` returns `{ isOk: true, callsMain: true, invokedIdentifier: "main" }`.
   - Flaw: Runner was never executed; unrelated local function satisfied `callee === "main"`.
2. **Target file under runner package with NO exported `main`:**
   - Script imports a target file in a runner directory that exports only `dummyHelper`.
   - Result: `auditCliServeEntrypoint` returns `{ isOk: true, callsMain: true }`.
   - Flaw: Checker checks only `fs.existsSync(resolvedPath)`, never inspecting exports of the target file.
3. **Wrong package path whose directory merely contains `"runner"`:**
   - Script imports `fake-runner-exploit/dist/main.js`.
   - Result: `auditCliServeEntrypoint` returns `{ isOk: true }`.
   - Flaw: Line 619 tests `if (!resolvedPath.includes("runner"))`, accepting arbitrary non-runner packages with "runner" in their name.

---

## 4. AP-019 Modular Decomposition Adjudication

`packages/core/test/architecture-boundaries-checker.ts` stands at 1128 lines. Under AP-019:
- **Soft limit:** 150 lines.
- **Hard limit:** 250 lines (requires refactoring before merge).
- **Inseparable Pipeline Doctrine:** The AP-019 exception specifically addresses inseparable async runtime loops to prevent hollow stubbing. It does **not** exempt large synchronous test-infrastructure tools that naturally decouple into independent modules.
- **Required Architecture:** The monolithic checker should be decomposed into cohesive submodules:
  - `checker/ast-extractor.ts`: AST traversal for imports, re-exports, template literals, and `import = require`.
  - `checker/core-rules.ts`: Core pure domain boundary rules (forbidden vendors, node:fs, adapters).
  - `checker/cli-audit.ts`: Robust CLI serve AST binding and target export verification.
  - `checker/workspace-dag.ts`: Cross-package AST source + manifest graph construction and cycle DFS.
  - `checker/report-generator.ts`: Dynamic evidence formatting and file inventory.

---

## 5. Comprehensive Findings Matrix (Fix Round 1)

| Finding ID | Severity | Status | Title & Rule | Action / Fix Decision |
| :--- | :---: | :---: | :--- | :--- |
| **FND-TASK5-01-RECHECK** | **P1** | **OPEN** | CLI Serve Entrypoint Checker Retains False-Green Flaws: Unbound Callee, Missing Export Inspection, Substring Package Match (AP-076, AP-021) | fix-now |
| **FND-TASK5-AP019-DECOMPOSITION** | **P2** | **OPEN** | `architecture-boundaries-checker.ts` (1128 LOC) Violates AP-019 Hard Limit Across Multiple Synchronous Responsibilities (AP-019, AP-018) | fix-now (decompose into submodules) |
| **FND-TASK5-02-RECHECK** | **P1** | **RESOLVED** | Unified Workspace DAG Cycle Detection via Source & Re-Exports (AP-025, AP-076) | Verified PASS |
| **FND-TASK5-03-RECHECK** | **P1** | **RESOLVED** | Durable Evidence & Report Integrity Anti-False-Pass (AP-076, AP-012) | Verified PASS |
| **FND-TASK5-04-RECHECK** | **P2** | **RESOLVED** | AST Syntax Coverage & Multi-Extension Discovery (AP-025, AP-076) | Verified PASS |
| **FND-MONOREPO-CYCLE-01** | **P1** | **OPEN** | Active Monorepo Circular Dependency: `packages/contracts/src/index.ts:15` re-exports from `../../adapter-pi-durable/src/session-fork.ts` (AP-020, AP-025) | Blocked (routed to contracts owner) |
| **FND-TASK5-05** | **P3** | **LOGGED** | Unreferenced `packages/core/scripts/build-runner.mjs` on disk (AP-018) | log-only (whole-cycle cleanup) |

---

## 6. Architecture Verification Summary

- **Passed Rules (Infrastructure & Syntax):**
  - **AP-010, AP-012:** Pure core boundary rules and AST syntax coverage verified.
  - **AP-025:** Unified workspace DAG accurately detects cross-package source and re-export cycles.
- **Failed Rules (Blocking Acceptance):**
  - **AP-076 (Assertion Integrity) & AP-021 (Thin Entry Points):** Blocked by 3 concrete false-green vulnerabilities in `auditCliServeEntrypoint`.
  - **AP-019 (Size Limits & Decomposition):** Blocked by 1128 LOC monolithic helper combining 6 synchronous roles.
  - **AP-020 (Clean Architecture & Inversion of Control):** Monorepo live integration blocked by `packages/contracts/src/index.ts:15`.

**FINAL VERDICT: FAIL**
Reviewer is on **HOLD** for parent routing and author remediation round 2.
