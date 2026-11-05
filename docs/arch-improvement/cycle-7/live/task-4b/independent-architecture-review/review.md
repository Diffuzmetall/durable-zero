# Independent Architecture Review: Task 4B (Typed Capability Preservation Dispatcher)

**Review Date:** 2026-11-05  
**Reviewer Role:** Independent Source/Spec Architecture Reviewer  
**Frozen Candidate Commit:** `49bcad1486a5101e20e8b88a616cc175a34fc3e9`  
**Adjudication Status:** Critical Parent Adjudication Completed  
**Deliverables Location:** `docs/arch-improvement/cycle-7/live/task-4b/independent-architecture-review/`  
**Artifact Hashes Verified:**
- Candidate Commit: `49bcad1486a5101e20e8b88a616cc175a34fc3e9`
- `session-dispatcher.ts` Source Blob: `b669e16663763d960c2887447b960ca64cb35af2c32dbd47a9e142507b9da33d`
- `errors.ts` Source Blob: `700892c3d942f78271eecde3a775596276b7e2205b5a187ba462a4a552072590`
- `request-dispatcher.ts` Source Blob: `8fdc6b109eb7c3dcfec25a9234110abf65603c5cde5200f917d4dca21a204e79`
- Frozen Protocol Dist Blob: `eb9a64afab9232099a9342b8e654daf6a27aa6aa9a49b44f354f3434df61e00d`

---

## 1. Executive Summary & Adjudication Summary

This independent architecture review evaluates the Task 4B candidate (`49bcad1486a5101e20e8b88a616cc175a34fc3e9`) following the `arch-rules` baseline (AP-010 through AP-076) and incorporates critical parent orchestration adjudication:

1. **Accepted as Blocking Fix-Now Defects (Routed to Author Fix Round 1/5):**
   - **[P1] Nominal Error Identity Failure:** Cross-package source-relative imports in `session-dispatcher.ts` break `instanceof` checks across Node ESM package boundaries when executed against compiled `@durable-zero/protocol` transport. Verified against frozen commit dist blob `eb9a64afab9232099a9342b8e654daf6a27aa6aa9a49b44f354f3434df61e00d`.
   - **[P2] Real JUnit Count Discrepancy:** Actual test count is 57 testcase nodes (23 protocol conformance + 34 capability dispatch), not 61 as claimed in author report.
   - **[P2] Truncated / Unlabeled RED Log:** `capability-dispatch-red.log` is a truncated 7.5KB excerpt with manual headers, whereas full command output was ~32.6KB. Parent confirmed genuine behavioral RED occurred at seq328; the saved artifact requires explicit excerpt labeling and verified bounds.
2. **Parent Boundary Ruling on Numeric Conversation IDs:**
   - Client requests with numeric `conversationId` (e.g. `{ conversationId: 1 }`) must be normalized using existing `conversationIdSchema` so that Core port receives strings (e.g. `String(id)`), without rewriting graph/event IDs.
3. **Parent Adjudication on Runner Root Export (Reclassified from P1 to Non-Blocking Observation):**
   - The frozen handoff contract explicitly required an internal `packages/runner/src/dispatch/index.ts` factory for the entrypoint owner to wire inside `packages/runner/src/composition.ts`.
   - `composition.ts` is inside `@durable-zero/runner` and can import `./dispatch/index.ts` directly; requiring root package export was not part of the frozen component scope and risks circular imports. Reclassified to an architectural observation / pending whole-Task4 composition integration gate.
4. **AP-019 Line Budget Primary Source Check:**
   - AP-019 specifies soft 150 / hard 250 LOC with an explicit P3 exception for inseparable async pipelines. Extraction of prompt input/options normalizers is permitted to reduce file size without chopping behavior.

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability (AP-074, AP-076) — PASS
- **Coordinator Method Invocations:**
  * `coordinator.prompt(input, execOptions)`: line 143 (`session/prompt`), line 149 (`session/steer`), line 155 (`session/followUp`).
  * `coordinator.abort(conversationId)`: line 167 (`session/abort`).
  * `coordinator.setSubagentPolicy(parsed.data)`: line 197 (`subagent/setPolicy` & `session/setSubagentPolicy`).
  * `coordinator.getState(conversationId)`: line 239 (`session/getState`).
  * `coordinator.getTranscript(conversationId, limit)`: line 255 (`session/getTranscript`).
  * `coordinator.getStats(conversationId)`: line 271 (`session/getStats`).
- **Engine Method Invocations:**
  * `engine.abortTask(taskId)`: line 176 (`session/abortTask`).
  * `engine.compact(instructions)`: line 187 (`session/compact`).
  * `engine.getState()`: line 202 (`models/list`).
  * `engine.setModel(...)`: line 217 (`models/set`).
  * `engine.setThinkingLevel(...)`: line 229 (`models/setThinking`).
- **Verdict:** **PASS**. Zero decorative dependencies. Every accepted port method is actively called in real request execution paths.

### Probe 2: Runtime Completeness & Split-Brain Detection (AP-010, AP-025) — FAIL (P1)
- `packages/runner/src/dispatch/session-dispatcher.ts:8-12` imports from `"../../../core/src/index.ts"` and `"../../../protocol/src/index.ts"`.
- When executed against compiled `@durable-zero/protocol` transport, `instanceof JsonRpcInvalidParamsError` and `instanceof JsonRpcMethodNotFoundError` fail, serializing `-32603` instead of `-32602` and `-32601`.
- **Verdict:** **FAIL (P1)** (Accepted by parent; routed to fix round 1/5).

### Probe 3: Entry Point Wiring (AP-020, AP-075) — PASS (Component Handoff Scope)
- Factory `createSessionDispatcher({ coordinator, engine })` matches the frozen handoff interface and is ready for integration into `packages/runner/src/composition.ts`.
- Wiring into `composition.ts` is explicitly reserved to the entrypoint owner as part of whole Task 4.
- **Verdict:** **PASS (Scoped Handoff)**.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076) — PASS with P3 Observation
- File length: `session-dispatcher.ts` is 300 LOC (exceeds 250 LOC hard limit; maintainability smell, separable normalizer helpers).
- Anti-Hollow: Unsupported capabilities (`binding/*`, `session/fork`, `tools/register`) throw `UnsupportedCapabilityError`, refusing to fabricate `{ ok: true }` receipts.
- **Verdict:** **PASS with P3 Observation**.

---

## 3. Findings & Adjudication Ledger

| ID | Sev | Title & Rule | Status / Fix Decision |
|---|---|---|---|
| F-01 | **P1** | Cross-package source-relative imports break nominal error identity over compiled transport (AP-010, AP-022, AP-025, AP-026) | **Accepted Blocker** · Fix-now in author fix round 1/5 |
| F-02 | **P2** | Test suite count discrepancy: claimed 61 tests, actual test runner executed 57 tests (AP-028, AP-076) | **Accepted Blocker** · Fix-now in author fix round 1/5 |
| F-03 | **P2** | Dispatcher RED artifact `capability-dispatch-red.log` is an unlabeled truncated excerpt (AP-028, AP-076) | **Accepted Blocker** · Fix-now in author fix round 1/5 |
| F-04 | **Obs** | `createSessionDispatcher` omitted from runner root export (AP-020, AP-075) | **Adjudicated Non-Blocking** · composition.ts imports `./dispatch/index.ts` directly |
| F-05 | **P3** | File line budget exceeded: 300 LOC > 250 LOC hard limit (AP-019) | **Log-only** · Maintainability smell; normalizer helper extraction allowed |
| F-06 | **P3** | Numeric conversationId rejected with `-32602` (AP-026) | **Boundary Ruling Applied** · Normalize via `conversationIdSchema` to string for Core |

---

## 4. Detailed Finding Specifications

### [P1] Cross-package source-relative imports break nominal error identity and map to -32603 in compiled distribution
- **Evidence:** `packages/runner/src/dispatch/session-dispatcher.ts:11-12` imports `JsonRpcMethodNotFoundError` and `JsonRpcInvalidParamsError` from `"../../../protocol/src/index.ts"` instead of `@durable-zero/protocol`. When executed against compiled `@durable-zero/protocol` transport (tested against frozen commit dist blob `eb9a64afab9232099a9342b8e654daf6a27aa6aa9a49b44f354f3434df61e00d`), `err instanceof JsonRpcInvalidParamsError` evaluates to `false` due to dual module instances in Node ESM. Executable counterexample in `probe-nominal-identity.mjs` proved that `session/prompt` with invalid content returns `-32603` instead of `-32602`, and unmapped method returns `-32603` instead of `-32601`.
- **Impact:** Public protocol contract regression in production runtime; all dispatcher validation errors and method-not-found errors are misclassified over the wire as internal errors (`-32603`).
- **Rule:** AP-010, AP-022, AP-025, AP-026.
- **Fix decision:** `fix-now` (replace source-relative imports with workspace package specifiers `@durable-zero/core` and `@durable-zero/protocol`).

### [P2] Test suite count discrepancy in author report (claimed 61 tests, actual test runner executed 57 tests)
- **Evidence:** Author report claimed 27 protocol conformance tests, 34 capability dispatch tests, and 61 combined tests (repeated in `report.json`). However, `packages/protocol/test/protocol-conformance.test.ts` contains exactly 23 test cases (5 in Defect 1, 6 in Defect 2, 9 in Defect 3, 3 in Defect 4). Running both test files via `node --test packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-dispatch.test.ts` outputs `tests 57, pass 57`, matching `junit.xml` (`tests 57`) and parent testcase node count.
- **Impact:** Inaccurate test inventory metrics undermine audit receipts and verification integrity.
- **Rule:** AP-028, AP-076.
- **Fix decision:** `fix-now` (correct test inventory metrics to 23 protocol + 34 capability = 57 tests).

### [P2] Dispatcher RED artifact capability-dispatch-red.log is an unlabeled truncated excerpt with manual headers
- **Evidence:** `docs/arch-improvement/cycle-7/live/task-4b/capability-dispatch-red.log` has manually prepended comment headers and is 7,554 bytes, truncating abruptly after the 4th failure instead of the full ~32,611 byte output for all 34 assertion failures. It lacks an explicit label designating it as an excerpt. While parent verification confirmed a genuine behavioral RED occurred at seq328, the saved log is incomplete without an excerpt disclaimer.
- **Impact:** Incomplete RED log creates ambiguity for independent auditors regarding whether execution completed or terminated prematurely.
- **Rule:** AP-028, AP-076.
- **Fix decision:** `fix-now` (archive full command output or explicitly label the artifact as a bounded excerpt with verified seq328 provenance).

---

## 5. Architecture Verification

- **Passed Rules:**
  * **AP-011 (Low Coupling, High Cohesion):** Handler isolates wire protocol adaptation from domain logic.
  * **AP-012 (Fail-Fast):** Invalid parameters and types fail immediately with explicit errors.
  * **AP-014 (SOLID & Clean Code):** Discrete responsibility for dispatch logic.
  * **AP-016 (Security Boundaries):** Clean extraction guards against prototype tampering.
  * **AP-018 (Clarity):** Explicit method handlers and typed options.
  * **AP-020 (Composition Root):** Clean factory contract `createSessionDispatcher({ coordinator, engine })`.
  * **AP-021 (Thin Entry Points):** Dispatcher executes zero inline domain business logic; delegates entirely to coordinator/engine.
  * **AP-023 (Async Discipline):** All async method handlers are properly awaited.
  * **AP-072 (Domain Specifications vs Switch):** Real domain DTOs used for responses.
  * **AP-074 (Explicit DI):** `coordinator` and `engine` injected via `SessionDispatcherOptions`; no hidden globals or singletons.
  * **AP-076 (Implementation Completeness & Anti-Hollow):** Real dependency method invocations verified across all 13 supported capabilities; zero dummy receipt fabrication.
- **Failed Rules:**
  * **AP-010 (Modular Monolith & Package Boundaries):** Violated by source-relative cross-package imports (`../../../core/src/index.ts` and `../../../protocol/src/index.ts`).
  * **AP-022 (Typed Errors):** Violated in compiled distribution because split module instances cause `instanceof` to fail, turning typed protocol errors into `-32603`.
  * **AP-025 (Import Discipline):** Violated by cross-package file-relative path imports.
  * **AP-026 (API Contracts & DTO Boundaries):** Violated by protocol error code misclassification (`-32603` instead of `-32602`/`-32601`) over compiled transport.
  * **AP-028 (Testing Strategy & Receipt Integrity):** Violated by test count discrepancy (61 claimed vs 57 actual) and unlabeled truncated RED log.
- **Residual Risk:**
  * Author fix round 1/5 must verify `instanceof` against built distribution package specifiers.
  * Full Task 4 binding, fork, and tools/register capabilities require subsequent SPI design; throwing explicit errors satisfies anti-fake requirements but does not constitute whole-cycle parity.
  * `session/getStats` returns the engine's token estimate / placeholder and is certified as unmetered.

---

## 6. Final Verdict

**VERDICT: FAIL**

Acceptance of frozen candidate `49bcad1486a5101e20e8b88a616cc175a34fc3e9` is blocked by accepted **P1** defect F-01 (cross-package relative imports causing nominal error `instanceof` failure over compiled transport) and accepted **P2** defects F-02 (test count discrepancy) and F-03 (unlabeled truncated RED log).

Holding for parent orchestration and author fix round 1/5 candidate. All review deliverables, probe results, and SHA256 receipts are preserved under `docs/arch-improvement/cycle-7/live/task-4b/independent-architecture-review/`.
