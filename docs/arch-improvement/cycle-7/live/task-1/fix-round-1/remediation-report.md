# Task 1 Remediation Round 1: Foundational Cycle Removal (Contracts -> Adapter)

**Date:** November 4, 2026  
**Trigger:** Strengthened Task 5A guard independent review identified cross-package DAG circularity:
`AssertionError: Circular package dependencies detected in workspace: [["@durable-zero/adapter-pi-durable","@durable-zero/contracts","@durable-zero/adapter-pi-durable"]]`  
**Status:** **REMEDIATED & GREEN**  

---

## 1. Defect Root Cause Analysis

- In `packages/contracts/src/index.ts:15`, an old re-export was present:
  ```typescript
  export * from "../../adapter-pi-durable/src/session-fork.ts";
  ```
- This inverted the layer DAG: `@durable-zero/contracts` directly imported concrete runtime code from `@durable-zero/adapter-pi-durable`.
- Meanwhile, `@durable-zero/adapter-pi-durable` depends on `@durable-zero/contracts`, forming a circular dependency across package boundaries.
- The concrete implementation in `session-fork.ts` uses Node.js `node:sqlite`, `node:fs`, and `node:path` (VACUUM INTO, WAL truncation, entry and task pruning).

---

## 2. Bounded Remediation Applied

1. **Pure DTO Port in Contracts:**
   - Created `packages/contracts/src/session-fork.ts` declaring pure `ForkSessionDatabaseOptions` interface:
     ```typescript
     export interface ForkSessionDatabaseOptions {
     	sourceDir: string;
     	targetDir: string;
     	checkpointId?: string | number;
     }
     ```
   - Updated `packages/contracts/src/index.ts` to export from `./session-fork.ts` instead of traversing to `adapter-pi-durable`.
2. **Concrete Implementation in Adapter:**
   - In `packages/adapter-pi-durable/src/session-fork.ts`, imported `ForkSessionDatabaseOptions` from `@durable-zero/contracts` and re-exported it alongside `forkSessionDatabase`.
   - `packages/adapter-pi-durable/src/index.ts` continues to export `forkSessionDatabase`.
3. **No Consumer Regressions:**
   - Verified all existing call sites (`packages/adapter-pi-durable/src/store.ts`, `session-commands.ts`, `session-fork.test.ts`) import `forkSessionDatabase` from `@durable-zero/adapter-pi-durable`.
   - Zero foreign/consumer test files required editing; zero fixture branches introduced.

---

## 3. Verification Receipts

### 3.1. Architecture Boundaries Guard (Task 5A)
- **Failing Log (Pre-Fix):** `docs/arch-improvement/cycle-7/live/task-1/fix-round-1/guard-red.log`
- **Passing Log (Post-Fix):** `docs/arch-improvement/cycle-7/live/task-1/fix-round-1/guard-green.log`
- **Result:** 30/30 tests pass (including live full AST DAG cycle scan):
  ```
  ✔ verifies live workspace package DAG is strictly acyclic via full AST source and manifest scan (113ms)
  ✔ Task 5A: Architecture Boundaries & Regression Guards (Fix Round 1) (226ms)
  ```

### 3.2. Retained Native Focused Suite (13 tests)
- **Log:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-1/native-suite.log`
- **JUnit:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-1/native-suite.junit.xml`
- **Tests Passing:**
  - `packages/adapter-pi-durable/test/session-fork.test.ts`: 1 test pass
  - `packages/adapter-pi-durable/test/watch-events-compat.test.ts`: 1 test pass
  - `packages/cli/test/cli.test.ts`: 3 tests pass
  - `packages/core/test/pure-domain-coordinator.test.ts`: 4 tests pass
  - `packages/runner/test/composition-root.test.ts`: 3 tests pass
  - `packages/runner/test/e2e-walking-skeleton.test.ts`: 1 test pass (10 steps)
  - **Total:** 13 passed, 0 failed, duration: ~3.9s.

---

## 4. Lease & Scope Boundaries Preserved

- `packages/core/test/architecture-boundaries*` tests and helpers: Untouched (only executed for verification).
- `packages/runner/src/dispatch/**` and `capability-dispatch` tests: Untouched.
- Legacy native test consumers: Untouched (relinquished to `thr_t38ban9s79`).
- Workspace is clean, build is verified, tests pass, and this thread is quiesced for immediate parent checkpoint.
