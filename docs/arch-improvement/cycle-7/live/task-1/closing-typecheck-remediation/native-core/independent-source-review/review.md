# Cycle 7 Task 1 (Slice 0): Independent Architecture & Spec Closing Precheck

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `e855a045ba291fa5d3a505a2c2294f6be8feb5a8`  
**Prior Candidates:** `ad99873e396f7440a6896dabaf516b6393c08a37` (Round 2) / `1298b479c5a6cf9087f7e01fc56325feb54a3dbd` (Round 1) / `fc0909602e7969df080259a2e2d4a7114be450b8` (Initial)  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076), Cycle 7 Canonical Plan, Binding Rulings R1–R8  
**Artifact Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/`  
**Review Phase:** PRECHECK of Non-Env Changes while R8 Env Seam Resolution Finishes  
**Verdict:** **VERDICT: FAIL (PRECHECK - Pending R8 Env ABI Resolution)** (Non-Env architecture invariants: 100% PASS with qualified receipt attribution; 2 explicit TS typecheck errors in `runtime-loader.ts` remain active)

---

## 1. Candidate Source Inventory & Checksum Provenance

The 12 file SHA-256 hashes below represent the immutable frozen candidate `e855a045ba291fa5d3a505a2c2294f6be8feb5a8` audited at freeze time (parent audit: `parent-hash-audit.json`). Note: independent probe tests use relative path imports against the local checkout whose files matched `e855` at audit time; subsequent active R8 edits in the author working tree are not evaluated as `e855`.

| Target File | SHA-256 Checksum | Architectural Status |
| :--- | :--- | :--- |
| `packages/core/src/session/coordinator.ts` | `9adf0055a4282773c364bde2290916ff1959ee70495541b72c8c9fbe71718212` | Pure domain coordinator (clean constructor DI, abort FSM) |
| `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` | `3af701614e4fc62b19a7ac7ec4388513ac8e58916f0e811f2e560d4e53d568a2` | True `#private` fields; native `submissionHandle` correlation |
| `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts` | `417ca171a8ab0fa1645e6df74728b5d8dbeda9820ee050c051c48be9204824cb` | Event projector (reconstructs content, no stale currentText) |
| `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts` | `67af467df532f7ca82320cb8002b5f6c5c35b88550f27a3d81ec621d09573526` | Child event projector (per-block suffix catchup & turn isolation) |
| `packages/adapter-pi-durable/src/engine/bridge/assistant-message-builder.ts` | `e2f631be65eda07bdf8a6b15e587dce264e1008b8387f60d63dd628866fbffb0` | Multi-block sorted content builder |
| `packages/adapter-pi-durable/src/engine/bridge/turn-summary.ts` | `76bb80205d4f00d5e4f2979755061ce2792d1df36ffabf2fa248fb2b44a66d89` | Block-aware turn summary resolver |
| `packages/adapter-pi-durable/src/store.ts` | `96325c865c5d7f08b52c7ab3130e3e3e68af4fb928082efbe4f9d4452db3d0f6` | Recursive JSON validator (`toJsonValue`), rejects invalid types |
| `packages/execution/src/adapters/local-node-env.ts` | `dfa5453d6da8267c7c0de6a38d2e824e39824ed30d7c8dbb01469e3cceadb118` | Empty string & empty argv fail-fast guard |
| `packages/runner/src/composition.ts` | `2def6426690c37183adb393e7e46ad6cb280cabaa17729f1e1143ae519499e08` | Lazy native dependencies & safe teardown |
| `packages/runner/src/main.ts` | `df8e7ca548099cc4542dbf2b652c6562c6f8db404cf555a694710ccb22b3b0d1` | Stdin EOF/close bounded shutdown |
| `packages/cli/bin/durable-zero.js` | `dd470565bf3dc889deb7abfcba444b2b1589e5f9152349b339e9de509a0fb190` | Fail-fast run & doctor prototypes |
| `packages/runner/test/e2e-walking-skeleton.test.ts` | `8107f245ed6588aaae3e25215ec39ea50f62440010b44ec1063f3b9433b42013` | Verified transcript & order walking skeleton test |

---

## 2. Audit of Non-Env Remediation Changes & Receipt Qualifications

### 1. Genuine Native Submission Handle Correlation
- **Observation:** In `PiDurableEngine.submit` (`packages/adapter-pi-durable/src/engine/pi-durable-engine.ts:133-187`), the engine no longer parses `Number(requestId)` or queries the harness by guessed numeric ID.
- **Evidence:** `receipt.submission` from `controller.submit()` and `submission` from `conv.submit()` are directly retained as `submissionHandle`.
- **Settlement:** `submissionHandle.wait(runtimeContext)` directly drives `turn_complete` status (`completed`, `aborted`, or `error`) and cleanup. Real native handle semantics are fully preserved without synthetic fallback.

### 2. True `#private` Encapsulation in `PiDurableEngine`
- **Observation:** Internal engine fields were converted to ECMAScript private fields: `readonly #options`, `#instance`, `#eventAdapter`, `#watcher`, `#graphSource`, `#unsubscribeView`, `readonly #listeners`, `#sessionDir`.
- **Evidence:** Verified in `probe-closing-precheck.test.ts` (PROBE 1). `(engine as any).instance === undefined` and `Object.getOwnPropertyNames(engine)` contains only `sessionDir` getter. No internal state leaks via property enumeration or reflection.

### 3. Store JSON Validation & Rejection (Qualified)
- **Observation:** `packages/adapter-pi-durable/src/store.ts:17-40` implements `toJsonValue(val, depth)` with a recursion depth limit of 128.
- **Receipt Qualification:** Independent `probe-closing-precheck.test.ts` (PROBE 2) verifies pre-persistence validation rejection (throwing `TypeError` for functions, `NaN`, and `Infinity`) prior to `getSession()`. Independent SQLite WAL roundtrip persistence is not measured as a separate independent WAL checkpoint here; full roundtrip read/write persistence is attributed to author's test `packages/adapter-pi-durable/test/store-roundtrip.test.ts`. Note: future probe tests allocating real databases must use bounded `fs.mkdtemp` and `try ... finally` cleanup rather than static `/tmp` paths.

### 4. LocalNodeExecutionEnv Empty Guard
- **Observation:** `packages/execution/src/adapters/local-node-env.ts:51-74` inspects `argvOrCommand`.
- **Evidence:** Verified in `probe-closing-precheck.test.ts` (PROBE 3). Empty string `""` resolves with `{ ok: false, exitCode: 1, stderr: "Cannot execute empty command string" }`; empty argv `[]` resolves with `{ ok: false, exitCode: 1, stderr: "Cannot execute empty command argv" }`. No fabricated binary names are generated.

### 5. GraphScope Session Identity & Version Provenance
- **Observation:** `RuntimeGraphSource` scope is constructed as `{ sessionId: viewSnapshot.session.id, rootConversationId: "1", buildId: "pi-durable@" + getPiDurableVersion() }`.
- **Evidence:** `getPiDurableVersion()` resolves the exact `@earendil-works/pi-durable` version (`1.5.0`), truthfully identifying the underlying wrapped runtime.

### 6. Optional Field Semantics & Exact Types
- **Observation:** `runtime-graph-mapper.ts`, `runtime-graph-receipts.ts`, `durable-child-event-adapter.ts`, `durable-event-adapter.ts`.
- **Evidence:** All optional properties now use conditional object spreads (`...(field !== undefined ? { field } : {})`), ensuring 100% compliance with `exactOptionalPropertyTypes: true`. No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck` suppressions were introduced.

### 7. Child & Parent Streaming Re-Verification (Qualified)
- **Observation & Scope:**
  - Independent `probe-closing-precheck.test.ts` (PROBE 4) exercises single-turn suffix catchup at index 0, verifying that only the unstreamed suffix delta is emitted with matching `parentRef` and `conversationId`.
  - Independent `probe-closing-precheck.test.ts` (PROBE 5) exercises parent thinking(0)/text(1) content reconstruction when `entry.model[0].content` is omitted, confirming no undeclared `currentText` properties are accessed.
  - Multi-turn zero-duplicate guarantees across turns and non-zero index catchup are preserved from historical Round 2 receipts (`packages/adapter-pi-durable/test/durable-child-event-adapter-catchup.test.ts` and `fix-round-2/probe-round-2.test.ts`), not claimed as freshly covered across all indices by these 5 focused probes alone.

---

## 3. Mandatory Semantic Probes Status (Closing Precheck)

1. **Dependency Traceability (AP-074, AP-076): PASS.**
   All injected dependencies in `SessionCoordinator` are actively called across its execution methods. Dead constructor options (`modelProvider`, `executionEnv`, `resourceLoader`, `store`) are deleted. `assembleDurableZero` does not instantiate unused native dependencies when custom `options.engine` is supplied.
2. **Runtime Completeness & Split-Brain Detection: PASS (Non-Env).**
   `@durable-zero/core` is 100% free of `@earendil-works/*` packages and `node:fs` calls. AST boundary guards pass 30/30 (`packages/core/test/architecture-boundaries.test.ts`). Production runner handles `stdin` EOF and `close` events, guaranteeing clean shutdown without orphaned processes.
3. **Entry Point Wiring (AP-020, AP-075): PASS.**
   `durable-zero serve` connects cleanly to the runner composition root and executes the full vertical slice. `durable-zero doctor` and `run` fail fast truthfully with exit code 1.
4. **Anti-Gaming & Implementation Completeness (AP-019, AP-076): PASS (Non-Env).**
   Synthetic `rec_...` admission receipt path is eliminated; real native SQLite submission and entry IDs are used throughout. Parent and child event adapters accurately project streaming deltas at their real `contentIndex` without index collapse or duplicate replays.

---

## 4. Open Finding (The Last 2 TSC Diagnostics)

- [P2] FND-T1-12: Execution Environment ABI Seam Mismatch (`IExecutionEnvironment` vs SDK `ExecutionEnv`)
  - **Evidence:** `pnpm run typecheck` (`tsc -p tsconfig.src.json --pretty false`) produces exit code 2 with exactly 2 errors:
    ```
    packages/adapter-pi-durable/src/engine/runtime-loader.ts(151,3): error TS2345: Argument of type '() => IExecutionEnvironment' is not assignable to parameter of type '() => ExecutionEnv | undefined'.
      Type 'IExecutionEnvironment' is missing the following properties from type 'ExecutionEnv': absolutePath, joinPath, readTextFile, openTextLineReader, and 17 more.
    packages/adapter-pi-durable/src/engine/runtime-loader.ts(186,48): error TS2322: Type '({ cwd, conversationId }: EnvTarget) => IExecutionEnvironment' is not assignable to type '(target: EnvTarget, context: Context) => ExecutionEnv | Promise<ExecutionEnv | undefined> | undefined'.
      Type 'IExecutionEnvironment' is not assignable to type 'ExecutionEnv | Promise<ExecutionEnv | undefined> | undefined'.
        Type 'IExecutionEnvironment' is missing the following properties from type 'ExecutionEnv': absolutePath, joinPath, readTextFile, openTextLineReader, and 17 more.
    ```
  - **Impact:** Typecheck fails with 2 diagnostics. Core `IExecutionEnvironment` defines 6 methods (`readFile`, `writeFile`, `exec`, `statFile?`, `listFiles?`, `cleanup`), whereas Pi SDK harness requires `ExecutionEnv` with 21+ properties.
  - **Rule:** AP-026, AP-029
  - **Status:** In progress by Leaseholder A under canonical plan R8 Section 4 (bridging `IExecutionEnvironment` to `ExecutionEnv` and wiring `NodeExecutionEnv` in composition).

---

## 5. Architecture Verification

- **Passed Rules:**
  - `AP-010` (Modular Monolith & Ports/Adapters: clean pure domain).
  - `AP-011` (Low Coupling & High Cohesion: isolated domain coordinator).
  - `AP-012` (Fail-fast errors and proper turn abort semantics).
  - `AP-019` (File size limits observed).
  - `AP-020` (Composition root in runner).
  - `AP-021` (Thin entrypoints; child abort isolation).
  - `AP-023` (No floating promises; clean process and stream teardown on EOF/close).
  - `AP-025` (Strict import discipline verified by AST guards).
  - `AP-028` (Rigorous E2E test oracle with transcript readback and delta ordering).
  - `AP-034` (Single physical lock ownership).
  - `AP-059` (Fail-fast prototype command boundaries).
  - `AP-074` (Explicit DI without decorative constructor injection).
  - `AP-075` (Walking skeleton vertical slice connects CLI, stdio JSON-RPC, coordinator, engine, and SQLite WAL).
  - `AP-076` (Assertion integrity: second turn transcript content verified; child suffix catchup verified; true #private fields verified).
- **Violated / Pending Gate:**
  - `AP-026, AP-029` (FND-T1-12: The 2 remaining Env ABI diagnostics).
- **Not Applicable:**
  - `AP-051–AP-055` (Frontend / React architecture).
  - `AP-060, AP-062` (Postgres OLTP guardrails).

---

## 6. Precheck Conclusion

**VERDICT: FAIL (PRECHECK - Pending R8 Env ABI Resolution)**

All 23 non-Env files and remediations in frozen commit `e855a04` are verified architectural passes with qualified receipt attribution. All prior blockers (`FND-T1-01` through `FND-T1-11`) remain verified **CLOSED**. 

Once Leaseholder A delivers the final R8 Env delta resolving the 2 `runtime-loader.ts` diagnostics, this reviewer is prepared to immediately re-verify the full typecheck and package build in the same context.

All empirical receipts, JUnit reports, and probe tests are preserved in:
- [`review.md`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/review.md)
- [`findings.json`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/findings.json)
- [`probe-closing-precheck.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-closing-precheck.junit.xml)
- [`probe-closing-precheck.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/independent-source-review/probe-closing-precheck.test.ts)

Quiescing now in the same context to await the final R8 Env candidate delta from parent.
