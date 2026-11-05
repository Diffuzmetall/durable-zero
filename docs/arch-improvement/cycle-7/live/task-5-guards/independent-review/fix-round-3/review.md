# Independent Architecture & Adversarial Review: Task 5A (Fix Round 3 - Superseded / FAIL)

**Date:** 2026-11-05  
**Reviewer Role:** Independent Architecture / Adversarial Reviewer (Pi Provider, zero subagents)  
**Target Repository:** `/Users/vanya/Projects/durable-zero`  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Frozen Candidate Commit:** `c248e6c4e6f6db55f8fac3032ed9988d73cfeaf5`  
**Candidate Modular Source:**
- `packages/core/test/architecture-boundaries-ast.ts` (239 LOC)
- `packages/core/test/architecture-boundaries-core.ts` (165 LOC)
- `packages/core/test/architecture-boundaries-cli.ts` (211 LOC)
- `packages/core/test/architecture-boundaries-runner-verify.ts` (112 LOC)
- `packages/core/test/architecture-boundaries-dag.ts` (237 LOC)
- `packages/core/test/architecture-boundaries-report.ts` (234 LOC)
- `packages/core/test/architecture-boundaries-checker.ts` (11 LOC facade)  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-5-guards/independent-review/fix-round-3/`

---

## 1. Executive Summary & Canonical Verdict (Amended & Superseded)

The initial Round 3 review verified that literal primitive values (`export const main = 17;`), inverted if conditions (`!== "serve"`), fake runner package prefixes, and uninvoked nested calls were structurally rejected.

However, subsequent critical parent adjudication (`docs/arch-improvement/cycle-7/live/task-5-guards/parent-adjudication/round-3/`) empirically proved that **`verifyFileExportsMain` still fails to enforce genuine callable semantics**:
- `isCallableNode` returns `true` unconditionally for any `CallExpression` (accepting `export const main = Number("17");`).
- `isCallableNode` returns `true` unconditionally for any `Identifier` (accepting `export const main = n;` where `n = 17`).
- Named re-exports (`export { n as main };` where `n = 17`) fall back to `!sf.isDeclarationFile`, which is unconditionally `true` for all ordinary JavaScript/TypeScript source files, accepting non-callable re-exports.

Native Node testing of the exact frozen helper (`frozen-runner-verify.ts`, SHA `2f026edc4d...`) resulted in **3 test failures and exit code 1**.

Because these defects leave the target export verification vulnerable to false greens, finding `FND-TASK5-01-R3` is **re-opened as an unresolved P2 defect**. Per canonical architecture rules (`arch-improvement-review/SKILL.md`), all P0, P1, and P2 findings block scope acceptance.

### **FINAL VERDICT: FAIL (BLOCKED by P2 FND-TASK5-01-R3)**

---

## 2. Parent Empirical Counterexample Adjudication Receipts

Documented in `docs/arch-improvement/cycle-7/live/task-5-guards/parent-adjudication/round-3/adjudication.json`:
- **Frozen Helper SHA-256:** `2f026edc4daaf79bba65d2cd46b724d1f3256548ef2ceb90b1f684dfaca07452`
- **Native Test Runner:** `callable-target.test.mjs`
- **Exit Code:** 1 (3 failed, 1 passed)
- **JUnit Log:** `docs/arch-improvement/cycle-7/live/task-5-guards/parent-adjudication/round-3/junit.xml`

### Confirmed False-Green Bypasses:
1. `export const main = Number("17");` -> **Falsely Accepted**  
   *Root Cause:* `isCallableNode` checks `ts.isCallExpression(node)` without validating whether the called entity is a known primitive constructor (`Number`, `String`, `Boolean`, `Symbol`) or an actual function factory.
2. `export const main = n;` (where `const n = 17;`) -> **Falsely Accepted**  
   *Root Cause:* `isCallableNode` checks `ts.isIdentifier(node)` unconditionally, treating any local variable identifier as callable.
3. `export { n as main };` (where `const n = 17;`) -> **Falsely Accepted**  
   *Root Cause:* Lines 66–70 check `localFunctions.has(localName) || !sf.isDeclarationFile`. Because `!sf.isDeclarationFile` is always `true` for standard `.ts`/`.js` implementation files, non-function local variables exported as `main` completely bypass validation.
4. Positive Control: `export function main() {}` -> **Correctly Accepted**.

---

## 3. Retained Historical Probes & Invariants

All prior structural and modular invariants remain verified and historically preserved:
- **AP-019 Modular Decomposition:** All 6 submodules are strictly **<= 250 LOC** (11 to 239 LOC) with zero import side-effects.
- **Inverted Condition:** `if (command !== "serve")` is properly rejected via `cond.operatorToken.kind === EqualsEqualsEqualsToken`.
- **Nested Dead-Code Invocations:** `main()` inside uninvoked local function declarations is properly rejected by skipping nested function bodies in `scanInvocations`.
- **Package Exact Matching:** `@durable-zero/runner-fake-package` is rejected; `@durable-zero/runner/subpath` resolves to the exact subpath on disk.
- **Unified Workspace DAG:** Acyclic monorepo DAG confirmed (0 cycles in candidate `c248e6c4`).
- **Dynamic Report Integrity:** Dynamic status authoring prevents false PASS generation.

---

## 4. Findings Matrix (Fix Round 3 - Amended)

| Finding ID | Severity | Status | Title & Rule | Action / Fix Decision |
| :--- | :---: | :---: | :--- | :--- |
| **FND-TASK5-01-R3** | **P2** | **OPEN** | `verifyFileExportsMain` Falsely Accepts Non-Callable Exports via CallExpression/Identifier/DeclarationFile Bypasses (AP-076, AP-021) | **BLOCKING (fix-now in round 4/5)** |
| **FND-TASK5-AP019-R3** | **P2** | **RESOLVED** | Modular Checker Decomposition into Cohesive Submodules <= 250 LOC (AP-019, AP-018) | Verified PASS |
| **FND-TASK5-02-R3** | **P1** | **RESOLVED** | Unified Workspace DAG Cycle Detection via Source & Re-Exports (AP-025, AP-076) | Verified PASS |
| **FND-TASK5-03-R3** | **P1** | **RESOLVED** | Durable Evidence & Dynamic Reporting Integrity (AP-076, AP-012) | Verified PASS |
| **FND-TASK5-04-R3** | **P2** | **RESOLVED** | AST Syntax Coverage & Multi-Extension Discovery (AP-025, AP-076) | Verified PASS |
| **FND-MONOREPO-CYCLE-01** | **P1** | **RESOLVED** | Monorepo Contracts Re-Export Cycle Resolved in Commit 0d1195b (AP-020, AP-025) | Verified PASS (0 cycles in c248e6c4) |
| **FND-TASK5-05** | **P3** | **LOGGED** | Unreferenced `packages/core/scripts/build-runner.mjs` on disk (AP-018) | log-only (whole-cycle cleanup) |

---

## 5. Reviewer State

- Scope acceptance of Task 5A is **BLOCKED** by P2 defect `FND-TASK5-01-R3`.
- The defect has been assigned to the original guard author for Fix Round 4/5.
- Reviewer is on **HOLD** for parent notification and frozen candidate commit for Round 4. Zero production source changes made.
