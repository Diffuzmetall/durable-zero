# Cycle 7 Task 1 Consumer Test Migration — Final Closure & Full 374-Test Verification Report

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **TASK 1 CONSUMER MIGRATION 100% COMPLETE — ZERO BROKEN IMPORTS IN CORE — ALL 374/374 WORKSPACE TESTS PASSING (100% GREEN) — QUIESCED AWAITING PARENT PRESERVATION**

---

## 1. Executive Summary & Resolution of `execution-env-strategy.test.ts`

Following parent thread `thr_9yjb93iwmn`'s directive regarding the single remaining failure on the isolated root test surface:

- **Target File:** `packages/adapter-pi-durable/test/execution-env-strategy.test.ts`
- **Issue:** Test 1 `delegates environment instantiation to injected ExecutionEnvFactory...` called `envs.env(...)` synchronously. In the R8 collection seam, `envs.env(target, context)` is an async method taking an explicit `Context` and returning `Promise<ExecutionEnv | undefined>`.
- **Correction Applied (Test-Only):**
  - Updated test to `async () => { ... }`.
  - Passed `BACKGROUND_CONTEXT` from `@earendil-works/chord/context` to `await envs.env({ cwd: "/sandbox/dir" }, BACKGROUND_CONTEXT)`.
  - Preserved exact assertions: `calledWithCwd === "/sandbox/dir"` and `(env as any)?.id === "mock-env"`.
  - Added guaranteed teardown in `finally { await envs.cleanup(BACKGROUND_CONTEXT); }`.
- **Result:**
  ```text
  ▶ ExecutionEnvs Strategy Pattern in Core (AP-012, AP-072)
    ✔ delegates environment instantiation to injected ExecutionEnvFactory without depending on concrete adapters (0.653958ms)
    ✔ fails fast when ExecutionEnvFactory is not provided (AP-012, AP-072, AP-073) (0.164625ms)
    ✔ fails fast in openDurable when executionEnvFactory is not provided (AP-012, AP-072, AP-073) (0.304334ms)
  ✔ ExecutionEnvs Strategy Pattern in Core (AP-012, AP-072) (1.612ms)
  ```

---

## 2. Global Test Suite Status (`npm test`)

- **Command:** `node --test --test-timeout 30000 packages/*/test/*.test.ts`
- **Output:**
  ```text
  ℹ tests 374
  ℹ suites 54
  ℹ pass 374
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 12009.818084
  ```
- **Total Tests:** 374
- **Passed:** 374 (100% GREEN)
- **Failed:** 0
- **Duration:** 12.0 seconds
- **Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/root-test-final.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/root-test-final.junit.xml`

---

## 3. Retargeting Mapping for All 5 Former Core Test Files

| Suite | Target Location | Architecture / Verification Role | Status |
|---|---|---|---|
| `codemode-canonical-routines.test.ts` | `packages/adapter-pi-durable/test/codemode-canonical-routines.test.ts` | Injects real `createCodemodeBuiltinExtension` from `@durable-zero/adapter-codemode`; verifies dynamic namespaces passing, native tool registration, and prompt rules. | **PASS (4/4)** |
| `codemode-sandbox-isolation.test.ts` | `packages/adapter-codemode/test/codemode-sandbox-isolation.test.ts` | Verifies underlying `close()` executes separately per sandbox with sandbox isolation spying. | **PASS (2/2)** |
| `extension-cli-multi.test.ts` | `packages/runner/test/extension-cli-multi.test.ts` | Retains multiple `--extension` array parsing and `--no-global-extensions` against `packages/runner/src/cli-args.ts`. | **PASS (1/1)** |
| `plugin-strategy-wiring.test.ts` | `packages/adapter-pi-durable/test/plugin-strategy-wiring.test.ts` | Retargeted to `BuiltinExtension`/`CodingRegistry` API; asserts register side effect, native extension install, and subagent retention. | **PASS (1/1)** |
| `durable-engine-facade.test.ts` | `packages/adapter-pi-durable/test/durable-engine-facade.test.ts` | Tests `PiDurableEngine implements IAgentEngine` with isolated environment, dynamic import, guaranteed close, and boolean encapsulation verification. | **PASS (1/1)** |

---

## 4. Final Core Domain State
- **Remaining broken imports in `packages/core/test/`:** **0**
- **Retained pure domain tests in `packages/core/test/`:** **10 files, 36 tests — 100% PASS** (~0.4s)
- **Zero vendor or adapter imports in Core domain tests.**

---

## 5. Scope & Quiescence Notice
- **Task 1 Consumer Migration is 100% COMPLETE.**
- Zero git commits or pushes executed.
- Zero shared ledger edits made (`docs/arch-improvement/ledger.md` untouched).
- Zero production code modified (strictly test-only edits).
- Worker is now **QUIESCED** and holding for parent review and preservation.
