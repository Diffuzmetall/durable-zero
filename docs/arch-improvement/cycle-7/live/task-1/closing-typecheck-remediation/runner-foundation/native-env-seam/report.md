# Milestone Report — Native Execution Environment Seam Selection (Parent R8 Amendment)

**Date:** 2026-11-05  
**Worker:** `thr_4yhrgipwed` (Runner Foundation Scope)  
**Parent:** `@thread:thr_9yjb93iwmn`  
**Status:** IMPLEMENTATION COMPLETE & REAL NATIVE ROOT STARTUP VERIFIED (EXIT 0, 6/6 PASS IN 607ms) — QUIESCED FOR IMMEDIATE BACKUP  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/`

---

## 1. Executive Summary & Test Evolution

### Test Suite Evolution & Historical Audit
- **Historical Run 1 (4 tests):** Tested contract rejection, MockAgentEngine fast path, and SDK method existence. (Superseded).
- **Historical Run 2 (5 tests):** Added direct file effect test, but `absolutePath` expectation did not await SDK `Promise<Result<string, FileError>>`. (Superseded).
- **Final Run (6 tests, 607ms, Exit 0):**
  1. Removed the MockAgentEngine bypass for seam selection; executed **actual production native Root startup** under an isolated filesystem sandbox (`HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `PI_AGENT_DIR`), with `noGlobalExtensions: true` and bounded in-memory streams.
  2. Verified that `customCoreCalled` and `customNativeCalled` flags are genuinely asserted as `true`.
  3. Verified real file effects on both Core (`writeFile`, `readFile`, `statFile`) and Native SDK (`writeFile`, `exists`, `readTextFile`, `absolutePath`, `remove` with `BACKGROUND_CONTEXT` and `Result<T, FileError>` unwrapping).
  4. Verified that the default Root wiring starts production native runtime using `NodeExecutionEnv` containing all 24 required native SDK methods.

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
2. **Selective Dependency Forwarding Without Conflicting Defaults:**
   - When custom `options.executionEnvFactory` (Core SPI) is provided: forwards ONLY `executionEnvFactory` to `PiRuntimeDependencies`. Does NOT inject default native factory, ensuring custom Core environments are not shadowed.
   - When `options.executionEnvFactory` is omitted: defaults to `nativeExecutionEnvFactory: options.nativeExecutionEnvFactory ?? ((target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd }))`.
3. **Official SDK NodeExecutionEnv Direct Import:**
   - Imported `NodeExecutionEnv` directly from `@earendil-works/pi-durable/env/node`.
   - Explicitly declared `"@earendil-works/pi-durable": "1.5.0"` in `packages/runner/package.json` to prevent reliance on accidental package hoisting.

---

## 3. Real Production Native Root Startup & File Effects

The test suite validates genuine production startup and real filesystem effects:
1. **Custom Core SPI Startup:**
   - Starts real native root via `assembleDurableZero({ executionEnvFactory: ... })`.
   - Asserts `customCoreCalled === true`.
   - Performs real file operations via Core SPI (`writeFile`, `readFile`, `statFile`).
2. **Custom Native SDK Startup:**
   - Starts real native root via `assembleDurableZero({ nativeExecutionEnvFactory: ... })`.
   - Asserts `customNativeCalled === true`.
   - Performs real file operations via Native SDK with `BACKGROUND_CONTEXT` from `@earendil-works/chord/context`, asserting SDK Result envelopes (`{ ok: true, value: ... }`).
3. **Default Wiring (24 Required Native Methods):**
   - Starts real native root with default configuration (neither factory provided).
   - Verifies `instance.coordinator.isStarted === true`.
   - Verifies that `NodeExecutionEnv` provides the 24 required native methods:
     `watch`, `absolutePath`, `joinPath`, `exec`, `openTextLineReader`, `readTextFile`, `readTextLines`, `readBinaryFile`, `openBinaryReader`, `writeFile`, `appendFile`, `truncateFile`, `flushFile`, `renameFile`, `fileInfo`, `listDir`, `openDirReader`, `canonicalPath`, `exists`, `createDir`, `remove`, `createTempDir`, `createTempFile`, `cleanup`.
   - Verifies that Core `LocalNodeExecutionEnv` provides only the 6-method domain subset and does not pose as full native SDK environment.
4. **Product Defect Resolution Qualification:**
   - While unit and composition tests prove that `NodeExecutionEnv` provides the missing 24 native methods (including `absolutePath`), final product resolution is subject to end-to-end confirmation when the compiled R3 harness journeys run.

---

## 4. Verification Evidence & Receipts

- **Command:** `node --test --test-timeout 5000 packages/runner/test/native-env-seam.test.ts`
- **Exit Code:** `0`
- **Duration:** 607ms
- **Test Evidence (6/6 Passing):**
  1. `rejects configuration with BOTH executionEnvFactory and nativeExecutionEnvFactory as genuine error (AP-012)` (PASS, 1.88ms)
  2. `actual native Root startup with custom Core executionEnvFactory invokes factory and creates owned file effect` (PASS, 38.67ms)
  3. `actual native Root startup with custom Native nativeExecutionEnvFactory invokes factory and creates owned file effect` (PASS, 14.91ms)
  4. `actual native Root startup with DEFAULT wiring uses NodeExecutionEnv with 24 required native SDK methods` (PASS, 13.88ms)
  5. `verifies real file effects on NodeExecutionEnv with Context and Result envelope` (PASS, 1.67ms)
  6. `preserves MockAgentEngine fast path for unit testing (lazy infra test)` (PASS, 0.84ms)
- **Artifacts:**
  * Raw Log: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/test-output.txt`
  * JUnit XML: `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/junit.xml` (6 `<testcase>` nodes, 0 failures, 0 errors).

---

## 5. Quiescence State

Source-write quiescence is active. All owned files (`packages/runner/src/composition.ts`, `packages/runner/package.json`, `packages/runner/test/native-env-seam.test.ts`, and evidence files) are in steady state; holding cleanly for parent checkpoint and backup.
