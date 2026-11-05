# Cycle 7 Task 1 (Slice 0): Independent Architecture & Spec Final Review — Candidate `7e12fa5`

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `7e12fa592a7de537ade6424f1b1a8a9aa4e6b648` (Remote Verified)  
**Production Code Base Commit:** `08c6fd172bc90061a3e265745f183c1725c1d010` (Verified 100% bit-for-bit identical across all 11 production native files; diff `08c6 -> 7e12` is runner seam test and docs only)  
**Prior Historical Candidates:**  
- `2cc724f3c73a544d161015ae4fdcf8539d76e6a5` (R8 Semantic Draft — 18 tests, 1 PASS / 17 FAIL RED preserved)  
- `e855a045ba291fa5d3a505a2c2294f6be8feb5a8` (Non-Env Precheck — 5 tests, 5 PASS; 2 TSC seam diagnostics)  
- `ad99873e396f7440a6896dabaf516b6393c08a37` (Round 2 — 4 tests, 4 PASS)  
- `1298b479c5a6cf9087f7e01fc56325feb54a3dbd` (Round 1) / `fc0909602e7969df080259a2e2d4a7114be450b8` (Initial)  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076), Cycle 7 Canonical Plan, Binding Rulings R1–R8  
**Artifact Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/`  
**Verdict:** **VERDICT: PASS (HOLD FOR RUNNER INTEGRATION / PRODUCT VERIFICATION)**

---

## 1. Executive Summary & Gates Status

1. **Compiler Gate (`tsc -p tsconfig.src.json`):** **PASS (0 Diagnostics).**
   - Official workspace compilation succeeds with exit code 0.
   - Previous compiler blocker `FND-T1-12` is confirmed **CLOSED**.
2. **Empirical Replay Gate (`probe-r8-fixed.test.ts`):** **PASS (18/18 PASS in 141ms).**
   - Replayed the identical 18 expected correct probe cases against isolated `frozen-08c6-source/` files.
   - 100% of probe cases passed cleanly with zero failures.
   - Measured JUnit XML saved to [`probe-r8-fixed.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-fixed.junit.xml).
3. **Preservation of Historical RED (`probe-r8-frozen.test.ts`):**
   - The authentic failing RED run on frozen `2cc724f` (1 PASS / 17 FAIL) is permanently preserved in [`probe-r8-frozen.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.junit.xml).

---

## 2. Checksum Provenance (`7e12fa592a7de537ade6424f1b1a8a9aa4e6b648` / `08c6fd1`)

| Target Component | Source File Path | SHA-256 Checksum | Match Status |
| :--- | :--- | :--- | :--- |
| Core Execution Env Adapter | `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts` | `f71cc85a58dede705b4b75f612d7ab950d13485aed2074638cf7d8bb045d0f08` | IDENTICAL |
| Harness Setup (ExecutionEnvs) | `packages/adapter-pi-durable/src/engine/harness-setup.ts` | `cd7262079effbb328dbff007faeead1d003169531b577dacf71959c89db7b790` | IDENTICAL |
| Pure Coordinator (DI / FSM) | `packages/core/src/session/coordinator.ts` | `9adf0055a4282773c364bde2290916ff1959ee70495541b72c8c9fbe71718212` | IDENTICAL |
| PiDurableEngine Facade | `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` | `1670e0ab7d0fb925181ca54202d55694a530ebc23b2b0051c50e21976a16c7a3` | IDENTICAL |
| Child Streaming Event Adapter | `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts` | `67af467df532f7ca82320cb8002b5f6c5c35b88550f27a3d81ec621d09573526` | IDENTICAL |
| Parent Event Adapter | `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts` | `417ca171a8ab0fa1645e6df74728b5d8dbeda9820ee050c051c48be9204824cb` | IDENTICAL |
| SQLite Session Store | `packages/adapter-pi-durable/src/store.ts` | `96325c865c5d7f08b52c7ab3130e3e3e68af4fb928082efbe4f9d4452db3d0f6` | IDENTICAL |
| Local Node Execution Env | `packages/execution/src/adapters/local-node-env.ts` | `dfa5453d6da8267c7c0de6a38d2e824e39824ed30d7c8dbb01469e3cceadb118` | IDENTICAL |
| Runner Composition Root | `packages/runner/src/composition.ts` | `2e97adca02a0a2df335889bc0f601f782352ae07559aa3cf5475a363717df3e2` | IDENTICAL |
| Runner Production Main | `packages/runner/src/main.ts` | `df8e7ca548099cc4542dbf2b652c6562c6f8db404cf555a694710ccb22b3b0d1` | IDENTICAL |
| CLI Bin Entry Point | `packages/cli/bin/durable-zero.js` | `dd470565bf3dc889deb7abfcba444b2b1589e5f9152349b339e9de509a0fb190` | IDENTICAL |

---

## 3. Adjudication of Consolidated Semantic Findings

### [P1] R8-01: Unsupported Operations and Metadata Reported as Success — CLOSED (PASS)
- **Remediation Evidence:**
  - `flushFile` explicitly returns `err(new FileError("not_supported", "flushFile not supported by pure IExecutionEnvironment", path))`.
  - `listFiles` explicitly returns `err(new FileError("not_supported", "listFiles with full FileListing metadata not supported by pure IExecutionEnvironment", path))`.
  - Constructor sets `this.id = coreEnv.id`, preserving the underlying filesystem namespace identity without random hashes.
  - `fileInfo` inspects both `stat.isDirectory` and `stat.isFile`; if neither is true (e.g. socket/pipe/device), it returns `err(new FileError("not_supported", ...))` rather than forcing `kind: "file"`.
- **Empirical Proof:** Probes 1.1, 1.2, 1.3, and 1.4 pass 100%.

### [P2] R8-02: Permission, Cancellation and Unknown Errors Masquerade as Missing Files — CLOSED (PASS)
- **Remediation Evidence:**
  - `toFileError` inspects structured error properties (`code === "ENOENT"` vs `code === "EACCES" || code === "EPERM"` vs `code === "ENOTDIR"` vs `code === "EISDIR"` vs `code === "ABORT_ERR" || name === "AbortError"`) without string guessing.
  - `readTextFile` checks `context.abortSignal?.aborted` up front, returning `err(new FileError("aborted", ...))` without invoking Core `readFile`.
  - `exists` returns `err(new FileError("not_supported", ...))` when `statFile` is absent, preventing full-file reads; when `statFile` fails, it only returns `ok(false)` if `toFileError.code === "not_found"`. Any permission or abort error returns typed `err(fileErr)`.
- **Empirical Proof:** Probes 2.1, 2.2, 2.3, and 2.4 pass 100%.

### [P2] R8-03: Async Environment Cache and Cleanup Do Not Ensure Single Ownership — CLOSED (PASS)
- **Remediation Evidence:**
  - `getOrCreate` tracks in-flight factory promises in `#inFlight = new Map<string, Promise<ExecutionEnv | undefined>>()`. Concurrent calls for the same key share the identical promise, guaranteeing a single instance is minted.
  - `#coreAdapters = new Map<IExecutionEnvironment, CoreExecutionEnvAdapter>()` tracks Core envs. Mapping the same Core env across 2 keys reuses the same wrapper and registers `coreEnv` only once in `#ownedCoreEnvs`, guaranteeing `cleanup` is called exactly once.
  - `cleanup` sets `#isClosing = true`, awaits `Promise.allSettled(Array.from(this.#inFlight.values()))` to drain any in-flight factory promises, cleans up any late-arriving environment, sets `#isClosed = true`, and catches errors across all environments before throwing `AggregateError`.
  - Legacy string constructor `new ExecutionEnvs("/app")` checks `typeof legacyFactory !== "function"` and throws fail-fast `ExecutionEnvFactory is required`.
- **Empirical Proof:** Probes 3.1, 3.2, 3.3, 3.4, and 3.5 pass 100%.

### [P2] R8-04: Core Exec Pretends to Implement Unsupported Native Shell Semantics — CLOSED (PASS)
- **Remediation Evidence:**
  - `exec` explicitly inspects `context.abortSignal !== undefined` up front; since pure Core port lacks a cancellation signal contract, it refuses cancellable execution with `err(new ExecutionError("shell_unavailable", "...use NativeExecutionEnvFactory for full shell cancellation"))`.
  - `exec` rejects advanced `ShellExecOptions` (`spill`, `window`, `inheritEnv`) and real-time streaming (`onOutput`) with `err(new ExecutionError("shell_unavailable", ...))`.
  - For uncancellable contexts without streaming options, basic argv command execution proceeds cleanly, preserving non-zero exit code semantics.
- **Empirical Proof:** Probes 4.1, 4.2, 4.3, and 4.4 pass 100%.

---

## 4. Four Semantic Probes Audit (AP-010 ... AP-076)

1. **Dependency Traceability (AP-074, AP-076): PASS.**
   All constructor options in `SessionCoordinator` (`engine`, `sessionStore`, `runtimeContext`) and `ExecutionEnvs` (`defaultCwd`, `nativeFactory`, `coreFactory`) are actively exercised. No dead or decorative constructor dependencies exist.
2. **Runtime Completeness & Split-Brain Detection (AP-011, AP-023, AP-025): PASS.**
   AST boundary test suite verifies `@durable-zero/core` is 100% free of `@earendil-works/*` dependencies and raw `node:fs` calls. In `runner`, production `main.ts` traps `stdin` EOF and `close` streams, shutting down child processes safely. In `ExecutionEnvs`, in-flight promise deduplication and explicit single Core cleanup ownership eliminate double-cleanup and lifecycle leaks.
3. **Entry Point Wiring (AP-020, AP-075): PASS.**
   `packages/cli/bin/durable-zero.js` wires cleanly to the runner composition root for `serve`. Incomplete prototype commands (`run`, `doctor`) fail fast truthfully with exit code 1.
4. **Anti-Gaming & Implementation Completeness (AP-019, AP-026, AP-076): PASS.**
   Real native SQLite submission handles and event correlation are used throughout. Child and parent event adapters correctly project streaming deltas without duplicate replay or index collapse. Unrepresentable Core operations return typed `not_supported` / `shell_unavailable` errors rather than faking success.

---

## 5. Architecture Verification

- **Passed Rules:**
  - `AP-010` (Modular Monolith & Ports/Adapters: clean pure domain in core; adapters strictly isolated in adapter packages).
  - `AP-011` (Low Coupling & High Cohesion: single responsibility per module).
  - `AP-012` (Fail-fast errors: missing factories and illegal options throw or return typed errors up front).
  - `AP-019` (File size limits observed: all modified source files remain well within bounds).
  - `AP-020` (Composition root in runner).
  - `AP-021` (Thin entrypoints; child abort isolation).
  - `AP-022` (Explicit domain error modeling: typed `FileError` and `ExecutionError` codes).
  - `AP-023` (Lifecycle & single-ownership: in-flight creation barriers, safe draining, deduplicated disposal).
  - `AP-025` (Strict import discipline verified by AST boundary tests).
  - `AP-026` (Interface contracts strictly adhered to without guessing).
  - `AP-028` (Rigorous E2E test oracle with transcript readback and delta ordering).
  - `AP-034` (Single physical lock ownership).
  - `AP-059` (Fail-fast prototype command boundaries).
  - `AP-074` (Explicit DI without decorative constructor injection).
  - `AP-075` (Walking skeleton vertical slice connects CLI, stdio JSON-RPC, coordinator, engine, and SQLite WAL).
  - `AP-076` (Assertion integrity: second turn transcript content verified; child suffix catchup verified; true #private fields verified; replay of 18 empirical probes verified).
- **Residual Risk & Staging Boundaries:**
  - `FND-T1-09`: Staging boundary between runner inline handler in `packages/runner/src/composition.ts` and Task 4B's `createSessionDispatcher` module. Full composition root integration is scheduled for the runner composition step.
- **Not Applicable:**
  - `AP-051–AP-055` (Frontend / React architecture).
  - `AP-060, AP-062` (Postgres OLTP guardrails).

---

## 6. Final Review Verdict

**VERDICT: PASS (HOLD FOR RUNNER INTEGRATION / PRODUCT VERIFICATION)**

All P0, P1, and P2 blockers (`FND-T1-01` through `FND-T1-08`, `FND-T1-10` through `FND-T1-12`, and `R8-01` through `R8-04`) are empirically verified **CLOSED**. 

Candidate commit `7e12fa592a7de537ade6424f1b1a8a9aa4e6b648` (with verified bitwise production code equivalence to `08c6fd1`) satisfies all architectural and specification requirements of Task 1 (Slice 0) under Closing Amendment R8.

All deliverables and empirical JUnit evidence are preserved in:
- [`final-r8-review.md`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/final-r8-review.md)
- [`findings.json`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/findings.json)
- [`probe-r8-fixed.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-fixed.test.ts)
- [`probe-r8-fixed.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-fixed.junit.xml)
- [`probe-r8-frozen.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.test.ts)
- [`probe-r8-frozen.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-r8-frozen.junit.xml)

On **HOLD** awaiting the separate product verification circuit and runner integration.
