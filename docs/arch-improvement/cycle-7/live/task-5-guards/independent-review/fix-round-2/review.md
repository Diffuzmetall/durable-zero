# Independent Architecture & Adversarial Re-Review: Task 5A (Fix Round 2 - Canonical Adjudication)

**Date:** 2026-11-05  
**Reviewer Role:** Independent Architecture / Adversarial Reviewer (Pi Provider, zero subagents)  
**Target Repository:** `/Users/vanya/Projects/durable-zero`  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Frozen Candidate Commit:** `e0066aee670ad85490a41969243c350deee78ce9`  
**Candidate Modular Source:**
- `packages/core/test/architecture-boundaries-ast.ts` (239 LOC)
- `packages/core/test/architecture-boundaries-core.ts` (165 LOC)
- `packages/core/test/architecture-boundaries-cli.ts` (249 LOC)
- `packages/core/test/architecture-boundaries-runner-verify.ts` (78 LOC)
- `packages/core/test/architecture-boundaries-dag.ts` (237 LOC)
- `packages/core/test/architecture-boundaries-report.ts` (234 LOC)
- `packages/core/test/architecture-boundaries-checker.ts` (45 LOC facade)  
**Fixtures:** `packages/core/test/architecture-boundaries-fixtures/`  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-2/`

---

## 1. Executive Summary & Verdict

Per the canonical Architecture Review standard (`arch-improvement-review/SKILL.md`), **all P0, P1, and P2 findings are strictly blocking**. In Fix Round 2 (`e0066aee`), the author successfully decomposed the monolithic checker into 6 focused submodules under the 250 LOC hard limit and resolved the former 3 major bypasses.

However, targeted adversarial probing in `r2-counterexamples.test.ts` confirmed **four concrete structural false-green bypasses** in `architecture-boundaries-cli.ts` and `architecture-boundaries-runner-verify.ts`. Because these defects undermine the assertion integrity of the CLI serve invariant (AP-076, AP-021), they are classified as **P2 (Blocking Scope Acceptance)**.

### **FINAL VERDICT: FAIL (BLOCKED by P2 FND-TASK5-01-R2)**

---

## 2. Candidate Provenance Correction & Monorepo DAG Status

- **Provenance Correction:** An audit of frozen blob `e0066aee:packages/contracts/src/index.ts` (SHA `1ec029828b4eb8128d2e8307b12ee2131c024acb`) demonstrates that line 15 was already updated to `export * from "./session-fork.ts";` by the native source owner in commit `0d1195b` prior to `e0066aee`.
- **DAG Acyclicity Verified:** Executing `buildFullWorkspaceGraph` and `detectDependencyCycles` against the candidate `e0066aee` tree yields:
  - `Workspace cycles: []`
  - `Contracts dependencies: []`
  The live monorepo DAG is verified **100% acyclic with 0 cycles**. The former external blocker (`FND-MONOREPO-CYCLE-01`) is **RESOLVED**.

---

## 3. Four Confirmed Structural P2 Bypasses (`FND-TASK5-01-R2`)

All 4 bypasses were empirically verified via `node --test` in `r2-counterexamples.test.ts` (11/11 tests pass, receipts in `junit.xml` and `test-output.txt`):

1. **Non-Callable Export Falsely Accepted:**
   - **Code:** Target file exports `export const main = 17;`.
   - **Flaw:** `verifyFileExportsMain` (lines 48–56) checks only if an exported variable identifier is named `"main"`, without verifying that it is a function declaration, arrow function, or function expression.
   - **Impact:** Accepts non-callable primitive constants as valid entry points.
2. **Inverted Condition `if (command !== "serve")` Falsely Accepted:**
   - **Code:** CLI script uses `if (command !== "serve") { ... }`.
   - **Flaw:** `findServeIf` (lines 170–176) uses naive substring search: `condText.includes("command") && condText.includes('"serve"')`.
   - **Impact:** Treats inverted conditions (`!==`) as valid serve branches.
3. **Prefix Matching Substitutes Real Runner for Fake Package:**
   - **Code:** CLI script imports `@durable-zero/runner-fake-package`.
   - **Flaw:** `architecture-boundaries-cli.ts` (lines 201–207) checks `targetImport.startsWith("@durable-zero/runner")` and blindly substitutes `../../runner/dist/main.js`.
   - **Impact:** Accepts invalid subpaths and foreign packages starting with `@durable-zero/runner`.
4. **Invocation Inside Never-Invoked Local Function Satisfies `callsMain`:**
   - **Code:** Script imports runner and declares `function uninvokedWorker() { main(); }` without ever calling `uninvokedWorker()`.
   - **Flaw:** `scanInvocations` recursively traverses inside local function declarations.
   - **Impact:** Accepts dead code invocations inside uncalled local functions as active entrypoint execution.

---

## 4. AP-019 Modular Decomposition Verification

`packages/core/test/architecture-boundaries-checker.ts` (formerly 1128 LOC) has been cleanly decomposed into 6 independent submodules:
- `ast.ts` (239 LOC) — AST dependency extraction and module kinds.
- `core.ts` (165 LOC) — Pure Core domain boundary invariants.
- `cli.ts` (249 LOC) — CLI serve branch inspection.
- `runner-verify.ts` (78 LOC) — Package JSON ancestor resolution and main export verification.
- `dag.ts` (237 LOC) — Full workspace graph construction and cycle DFS.
- `report.ts` (234 LOC) — Dynamic report authoring and evidence formatting.
- `checker.ts` (45 LOC) — Re-export facade.

Every module strictly complies with the AP-019 hard limit (**<= 250 LOC**). All submodules import cleanly with zero test execution or report side-effects. `FND-TASK5-AP019-R2` is **RESOLVED**.

---

## 5. Findings Matrix (Fix Round 2)

| Finding ID | Severity | Status | Title & Rule | Action / Fix Decision |
| :--- | :---: | :---: | :--- | :--- |
| **FND-TASK5-01-R2** | **P2** | **OPEN** | CLI Serve Guard Retains Four Structural False-Green Bypasses (AP-076, AP-021) | **BLOCKING (fix-now)** |
| **FND-TASK5-AP019-R2** | **P2** | **RESOLVED** | Modular Checker Decomposition (<250 LOC Each) Across 6 Cohesive Submodules (AP-019, AP-018) | Verified PASS |
| **FND-TASK5-02-R2** | **P1** | **RESOLVED** | Unified Workspace DAG Cycle Detection via Source & Re-Exports (AP-025, AP-076) | Verified PASS |
| **FND-TASK5-03-R2** | **P1** | **RESOLVED** | Durable Evidence & Dynamic Reporting Integrity (AP-076, AP-012) | Verified PASS |
| **FND-TASK5-04-R2** | **P2** | **RESOLVED** | AST Syntax Coverage & Multi-Extension Discovery (AP-025, AP-076) | Verified PASS |
| **FND-MONOREPO-CYCLE-01** | **P1** | **RESOLVED** | Monorepo Contracts Re-Export Cycle Resolved in Commit 0d1195b (AP-020, AP-025) | Verified PASS (0 cycles in e0066aee) |

---

## 6. Architecture Verification Summary

- **Passed Invariants:**
  - **AP-010, AP-012, AP-020, AP-025:** Pure Core ports, zero concrete I/O, acyclic workspace DAG, AST syntax coverage (`.ts` through `.jsx`, template literals, `import = require`).
  - **AP-019:** All modules <= 250 LOC with cohesive responsibilities.
- **Failed Invariants (Blocking):**
  - **AP-076 & AP-021:** Blocked by 4 confirmed P2 structural false-green bypasses in CLI serve entrypoint inspection.
- **Reviewer State:**
  - Reviewer is in **HOLD** awaiting the author's Fix Round 3 remediation.
