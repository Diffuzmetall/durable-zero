# Cycle 7 Task 1 Consumer Test Migration — Final Closure & Escalation Report

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **TASK 1 CONSUMER MIGRATION COMPLETE — ZERO BROKEN IMPORTS IN CORE — 359/360 WORKSPACE TESTS PASSING — 1 REPRODUCED PRODUCTION ENCAPSULATION DEFECT REPORTED TO TRACK A — QUIESCED FOR IMMEDIATE PARENT CHECKPOINT & BACKUP**

---

## 1. Executive Summary

Under the explicit lease extension granted by parent thread `thr_9yjb93iwmn`, the final five test suites were retargeted and relocated with zero production edits, zero weakened assertions, and zero coverage loss:

1. **`codemode-canonical-routines.test.ts`:** Relocated to `packages/adapter-pi-durable/test/codemode-canonical-routines.test.ts`. All 4 tests PASS. Test 4 adapted to explicit injected codemode builtin through the real `createCodingRegistry`/`BuiltinExtension` contract, proving dynamic namespaces are passed to builtin context.
2. **`codemode-sandbox-isolation.test.ts`:** Relocated to `packages/adapter-codemode/test/codemode-sandbox-isolation.test.ts`. Both tests PASS. Preserves exact spy assertions that underlying `close()` actually runs separately per sandbox.
3. **`extension-cli-multi.test.ts`:** Relocated to `packages/runner/test/extension-cli-multi.test.ts`. PASSES. Preserves exact assertions for multiple `--extension` values and `--no-global-extensions`.
4. **`plugin-strategy-wiring.test.ts`:** Relocated to `packages/adapter-pi-durable/test/plugin-strategy-wiring.test.ts`. PASSES. Retargeted to `BuiltinExtension`/`CodingRegistry` API, verifying custom register side-effect, native extension registration, and built-in subagent retention.
5. **`durable-engine-facade.test.ts`:** Relocated to `packages/adapter-pi-durable/test/durable-engine-facade.test.ts`. Isolated `HOME/XDG/PI_AGENT_DIR` environment in owned temp before execution, outer-scoped `engine`, and ensured `await engine.close()` in `finally`. Preserves the exact facade encapsulation assertion using sanitized boolean presence testing without serializing sensitive internals.

### Workspace-Wide Milestone Status
- **Remaining broken imports in `packages/core/test/`:** **EXACTLY 0** (zero broken files).
- **Intentionally retained pure Core tests:** **10 files, 36 tests — 100% GREEN**.
- **Full root declared test suite (`npm test`):** **360 tests executed, 359 passed, 1 failed**, duration **12.4s**.
- **The single failing test** reproduced an authoritative production encapsulation defect in `PiDurableEngine` reported to Track A below.

---

## 2. Production Defect Report for Track A

[P1] Evidence: In `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts:48`, the underlying SDK instance is declared as `private instance: OpenDurableResult | null = null;`. Because TypeScript `private` properties compile to ordinary enumerable JavaScript properties on `this`, `(engine as any).instance` is directly exposed on the public `IAgentEngine` object at runtime (`instanceLeaked === true`). Impact: The public domain facade leaks raw infrastructure internals (`OpenDurableResult`, internal `harness`, `view`, `settings`), violating AP-010 (Hexagonal Boundaries) and AP-074 (Constructor DI & Encapsulation). Fix decision: Track A should encapsulate `instance` using a true private field (`#instance`) or private `WeakMap` in `PiDurableEngine` so `Object.hasOwn(engine, 'instance') === false` and `(engine as any).instance === undefined`.

### Raw Test Receipt of Defect
- **File:** `packages/adapter-pi-durable/test/durable-engine-facade.test.ts:59`
- **Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/root-test-final.log`
- **Output:**
  ```text
  ✖ PiDurableEngine: provides a cohesive in-process facade implementing IAgentEngine (39.809541ms)
    AssertionError [ERR_ASSERTION]: raw SDK instance must be encapsulated and not leaked on facade
    true !== false
        at TestContext.<anonymous> (packages/adapter-pi-durable/test/durable-engine-facade.test.ts:59:10)
  ```

---

## 3. Retargeting Mapping for Final 5 Suites

| # | Original Location (`packages/core/test/`) | Final Target Location | Retargeting & Assertion Preservation Details | Status |
|---|---|---|---|---|
| 1 | `codemode-canonical-routines.test.ts` | `packages/adapter-pi-durable/test/codemode-canonical-routines.test.ts` | Adapted test 4 to explicit injected codemode builtin via `BuiltinExtension`; verifies dynamic namespaces passing. Tests 1–3 preserved verbatim. | **PASS (4/4)** |
| 2 | `codemode-sandbox-isolation.test.ts` | `packages/adapter-codemode/test/codemode-sandbox-isolation.test.ts` | Preserved sandbox spy verification that underlying `close()` executes separately per sandbox without mutual interference. | **PASS (2/2)** |
| 3 | `extension-cli-multi.test.ts` | `packages/runner/test/extension-cli-multi.test.ts` | Retained multiple `--extension` array accumulation and `--no-global-extensions` flag parsing against `runner/src/cli-args.ts`. | **PASS (1/1)** |
| 4 | `plugin-strategy-wiring.test.ts` | `packages/adapter-pi-durable/test/plugin-strategy-wiring.test.ts` | Retargeted to `BuiltinExtension` contract; asserts side effect, native extension install via `snapshot.extension()`, and subagent retention. | **PASS (1/1)** |
| 5 | `durable-engine-facade.test.ts` | `packages/adapter-pi-durable/test/durable-engine-facade.test.ts` | Retargeted to `PiDurableEngine implements IAgentEngine` with temp isolated env & guaranteed `finally` close; boolean presence check for raw instance encapsulation. | **REPRODUCED P1 DEFECT** |

---

## 4. Full Workspace Test Verification Receipt (`npm test`)

- **Command:** `node --test --test-timeout 30000 packages/*/test/*.test.ts`
- **Duration:** 12427ms (~12.4s)
- **Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/root-test-final.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/root-test-final.junit.xml`
- **Summary:** `360 tests, 359 passed, 1 failed (the P1 encapsulation defect), 0 skipped, 0 cancelled`

---

## 5. Source Hashes (SHA256) of Files Touched in This Checkpoint
```text
5d8615f2a1b92040902c3bb5fe2dd980be1ee805be4a3070407a5050f24e930f  packages/adapter-pi-durable/test/codemode-canonical-routines.test.ts
f5573752e257ebc8967926189ef9c228801d9c9a62243d6c753b7082490aa563  packages/adapter-codemode/test/codemode-sandbox-isolation.test.ts
8e61266209b0b467ec7469a9e334a1a0dfc89fbf09945cb57a5b3a4a169b1834  packages/runner/test/extension-cli-multi.test.ts
8892f336696b9487c64a7da931e505299da1b171f11467554907a3eb1ca48c77  packages/adapter-pi-durable/test/plugin-strategy-wiring.test.ts
41ec720f180e8e4ae0f16cf8c85777ce2b834162e8412613d964fefb4b6fc524  packages/adapter-pi-durable/test/durable-engine-facade.test.ts
```

---

## 6. Architecture Verification Scoped
- **Passed:**
  - AP-010 (Modular Monolith / Ports & Adapters): Zero native/vendor tests remain in Core. Core imports only `@durable-zero/contracts` and `zod`.
  - AP-020 (Clean Architecture & Boundaries): All native tests live in their proper packages (`adapter-pi-durable`, `adapter-codemode`, `runner`).
  - AP-025 (Import Discipline): All imports resolve cleanly from local relative paths or declared package boundaries; zero broken imports across the entire workspace.
  - AP-028 (Deterministic Testing): Entire 360-test workspace suite executes in 12.4s with isolated temp environments and zero network calls.
- **Residual Risk:**
  - Track A must address the P1 raw instance encapsulation leak in `PiDurableEngine` (#instance field).

---

## 7. Quiescence & Scope Statement
- **Task 1 Consumer Migration is 100% COMPLETE.**
- **Zero git commits or pushes executed** (reserved for parent thread).
- **Zero shared ledger changes made** (`docs/arch-improvement/ledger.md` untouched).
- **Zero production code edited** (test harness & migrations only).
- **All receipts and reports committed to permanent project path:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/`.
- **Worker is QUIESCED awaiting parent checkpoint and push.**
