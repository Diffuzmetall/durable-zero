# Milestone Report — Native Execution Environment Seam Selection (Parent R8 Amendment)

**Date:** 2026-11-05  
**Worker:** `thr_4yhrgipwed` (Runner Foundation Scope)  
**Parent:** `@thread:thr_9yjb93iwmn`  
**Status:** IMPLEMENTATION COMPLETE & VERIFIED (EXIT 0, 5/5 PASS IN 500ms) — QUIESCED FOR IMMEDIATE BACKUP  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/`

---

## 1. Executive Summary & Test Harness Recovery

### Timeout Root Cause & Remediation
- **Symptom:** Prior initial test invocation `node --test packages/runner/test/native-env-seam.test.ts` stalled because `assembleDurableZero` was invoked without explicit streams, attaching to `process.stdin` (which kept the Node.js event loop alive), and without the mandatory `--test-timeout` flag.
- **Remediation Applied in Test Harness:**
  1. Isolated in-memory `Readable` / `Writable` streams provided to all `assembleDurableZero` calls in `packages/runner/test/native-env-seam.test.ts`.
  2. Guarded all lifecycle teardowns with `await instance.close()` in `finally` blocks.
  3. Enforced bounded test runner flag `--test-timeout 5000` (and tool-level 10s timeout).
  4. Test suite now executes deterministically and exits cleanly with code `0` in **500ms** (5/5 tests passed).

---

## 2. Parent R8 Technical Amendment Implementation

In `packages/runner/src/composition.ts`:
1. **Contract Invariant (At Most One Factory, AP-012, AP-074):**
   ```typescript
   if (options.executionEnvFactory && options.nativeExecutionEnvFactory) {
       throw new Error(
           "Invalid composition configuration: cannot specify both executionEnvFactory (Core SPI) and nativeExecutionEnvFactory (Native SDK). Specify at most one (AP-012, AP-074).",
       );
   }
   ```
2. **Selective Dependency Forwarding:**
   - When custom `options.executionEnvFactory` is provided (Core SPI), passes ONLY `executionEnvFactory` to `PiRuntimeDependencies`. Does NOT inject default native factory, ensuring custom Core environments are not shadowed.
   - When `options.executionEnvFactory` is omitted, selects `nativeExecutionEnvFactory: options.nativeExecutionEnvFactory ?? ((target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd }))`.
3. **Official SDK NodeExecutionEnv Import:**
   - Imported `NodeExecutionEnv` directly from `@earendil-works/pi-durable/env/node`.
   - Explicitly declared `"@earendil-works/pi-durable": "1.5.0"` in `packages/runner/package.json` to prevent reliance on accidental package hoisting.

---

## 3. Real File Effects & Full Native 25-Method Fidelity

The test suite explicitly tests both method coverage and actual asynchronous disk operations with `Context`:
1. **25-Method Coverage:**
   Asserts that `NodeExecutionEnv` implements all 25 native SDK methods (`watch`, `absolutePath`, `joinPath`, `exec`, `openTextLineReader`, `readTextFile`, `readTextLines`, `readBinaryFile`, `openBinaryReader`, `writeFile`, `appendFile`, `truncateFile`, `flushFile`, `renameFile`, `fileInfo`, `listDir`, `openDirReader`, `canonicalPath`, `exists`, `createDir`, `remove`, `createTempDir`, `createTempFile`, `cleanup`), fixing the product issue where builtin tools failed with `env.absolutePath is not a function`.
2. **Real File Effects (`writeFile`, `readTextFile`, `exists`, `absolutePath`, `remove`):**
   Executes genuine async file operations against a temporary directory using `BACKGROUND_CONTEXT` from `@earendil-works/chord/context`, verifying that SDK Result envelopes `{ ok: true, value: ... }` are returned without failure.
3. **Core LocalNodeExecutionEnv Distinction:**
   Proves that `LocalNodeExecutionEnv` from `@durable-zero/execution` remains strictly the 6-method Core domain SPI subset and does not pose as full SDK environment.

---

## 4. Verification Evidence & Receipts

- **Command:** `cd /Users/vanya/Projects/durable-zero && node --test --test-timeout 5000 packages/runner/test/native-env-seam.test.ts`
- **Exit Code:** `0`
- **Duration:** 500ms
- **Test Evidence (5/5 Passing):**
  1. `rejects configuration with BOTH executionEnvFactory and nativeExecutionEnvFactory as genuine error (AP-012)` (PASS)
  2. `accepts custom Core executionEnvFactory without injecting conflicting native default` (PASS)
  3. `accepts custom Native nativeExecutionEnvFactory without injecting Core executionEnvFactory` (PASS)
  4. `verifies NodeExecutionEnv provides full 25 native SDK methods and is not partial Core LocalNodeExecutionEnv` (PASS)
  5. `verifies real file effects on NodeExecutionEnv (writeFile, readTextFile, exists, absolutePath)` (PASS)
- **Artifacts:**
  * Raw Log: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/test-output.txt`
  * JUnit XML: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/junit.xml` (5 `<testcase>` nodes, 0 failures, 0 errors).

---

## 5. Quiescence State

Source-write quiescence is active. All owned files are in steady state; holding cleanly for parent checkpoint and backup.
