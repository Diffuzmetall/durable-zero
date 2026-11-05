# Cycle 7 Task 1 Consumer Test Migration — Final Closure & Verification Report

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Latest Parent Checkpoint Commit:** `b84a585`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **TASK 1 CONSUMER MIGRATION 100% COMPLETE — ZERO BROKEN IMPORTS IN CORE — ALL 360/360 WORKSPACE TESTS PASSING — QUIESCED AWAITING PARENT PRESERVATION**

---

## 1. Executive Summary & Verification of the 3 Requested Test-Only Corrections

All three test-only corrections requested by parent thread `thr_9yjb93iwmn` were implemented, verified, and preserved:

1. **`codemode-canonical-routines.test.ts` (Test 4):**
   - Replaced ad-hoc/fake builtin with the real public `createCodemodeBuiltinExtension` from `@durable-zero/adapter-codemode` (`../../adapter-codemode/src/index.ts`).
   - Delegates `register(ctx)` directly to the real builtin, recording `receivedNamespaces = ctx.dynamicNamespaces`.
   - Asserts that the actual native `codemode` tool is registered in the snapshot.
   - Awaits `teardown()` in a guaranteed `finally` block.
   - **Result:** 4/4 tests PASS (~3.5ms).
2. **`durable-engine-facade.test.ts` (Dynamic Import & Owned CWD Isolation):**
   - Eliminated static SDK/engine import; uses `await import("../src/index.ts")` dynamically **after** environment isolation is in effect, preventing module-level caching of global/repo configs.
   - Creates an owned temporary working directory `isolatedCwd` and passes it explicitly to `PiDurableEngine({ cwd: isolatedCwd, ... })`.
   - Bounded per-test timeout (30s) and outer process timeout.
   - Engine variable declared in outer scope; `await engine.close()` guaranteed in outer `finally`.
3. **`durable-engine-facade.test.ts` (Environment Restoration):**
   - Saves exact presence state for `HOME`, `XDG_CONFIG_HOME`, `PI_AGENT_DIR`, and `PI_ADDITIONAL_EXTENSIONS`.
   - In `finally`, explicitly deletes keys that were previously absent (`delete process.env[key]`) rather than leaving them pointing at deleted temporary directories.
   - Encapsulation assertion preserved as a clean boolean check:
     `const instanceLeaked = (engine as any).instance !== undefined;`
     `assert.equal(instanceLeaked, false, "raw SDK instance must be encapsulated and not leaked on facade");`
   - Following Track A's `#instance` private field encapsulation in `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`, this test now executes cleanly and **PASSES** in 752ms without leaking raw SDK internals or diffs.

---

## 2. Global Test Suite Status (`npm test`)

- **Command:** `node --test --test-timeout 30000 packages/*/test/*.test.ts`
- **Output:**
  ```text
  ℹ tests 360
  ℹ suites 51
  ℹ pass 360
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 17434.800083
  ```
- **Total Tests:** 360
- **Passed:** 360 (100%)
- **Failed:** 0
- **Duration:** 17.4 seconds
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
- Zero production code modified (all work was strictly test harness & migrations).
- Worker is now **QUIESCED** awaiting parent instructions.
