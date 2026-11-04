# Task 4B Fix Round 1 Report: Public Resolution Identity & Conversation ID Normalization

**Date:** 2026-11-05  
**Worker:** `thr_4yhrgipwed` (Task 4B Scope)  
**Parent:** `@thread:thr_9yjb93iwmn`  
**Prior Candidate Checkpoint:** `49bcad1486a5101e20e8b88a616cc175a34fc3e9` (and compiled artifact `6b8e06875cc593092aad2a9f95082447a70a068b`)  
**Status:** FIX ROUND 1 COMPLETE (RED/GREEN VERIFIED) — SOURCE QUIESCED, HOLDING FOR S9 RE-REVIEW  

---

## 1. Executive Summary & Root Cause Analysis

During independent smoke testing of the compiled candidate by `thr_kbp6d8trbt`, unknown methods and invalid parameter errors unexpectedly produced `-32603` instead of `-32601` and `-32602`.

### Root Cause [P1] (Constructor Identity Split)
`packages/runner/src/dispatch/session-dispatcher.ts` imported nominal error classes (`JsonRpcMethodNotFoundError`, `JsonRpcInvalidParamsError`) via deep relative source path `../../../protocol/src/index.ts`. However, production `composition.ts`, the public runner, and client servers resolve the public package `@durable-zero/protocol` (which targets `packages/protocol/dist/index.js`).
Because Node.js ESM treats `protocol/src/index.ts` and `protocol/dist/index.js` as two independent module instances, the error objects thrown by `session-dispatcher.ts` had a different prototype from the classes imported by `RequestDispatcher`. The `err instanceof JsonRpcMethodNotFoundError` and `err instanceof JsonRpcInvalidParamsError` checks evaluated to `false`, falling through to generic internal error `-32603`.

### Remediation Applied
1. **Canonical Public Imports:** Replaced all deep relative source imports (`../../../protocol/src/...`, `../../../core/src/...`) in `packages/runner/src/dispatch/` and `packages/runner/test/` with canonical package imports `@durable-zero/protocol`, `@durable-zero/core`, and `@durable-zero/contracts`.
2. **Behavioral Regression Proven (RED $\to$ GREEN):** Captured genuine behavioral RED in `public-import-regression-red.log` where public package transport threw `AssertionError: The error is expected to be an instance of "JsonRpcInvalidParamsError". Received an error with identical name but a different prototype`, and `-32603 !== -32601` / `-32603 !== -32602`. When public package imports were wired, all 37 tests passed cleanly (GREEN).
3. **Source-Backed Conversation ID Normalization (Parent Ruling):** Integrated canonical `conversationIdSchema` from `@durable-zero/contracts`. Accepts positive integers and non-zero digit strings; normalizes numeric IDs (e.g. `1` $\to$ `"1"`, `42` $\to$ `"42"`) to string before forwarding to `SessionCoordinator` / `IAgentEngine`; preserves `undefined` root default; strictly rejects `0`, negative numbers, non-digit strings (`"abc"`, `"conv_42"`), and empty strings with `-32602`. Applied consistently across prompt, steer, followUp, abort, state, transcript, and stats.
4. **AP-019 Line Budget Decomposition:** Extracted `packages/runner/src/dispatch/normalizers.ts` (114 LOC). `session-dispatcher.ts` is now 189 LOC, strictly within the AP-019 hard limit of 250 lines without dummy wrappers or lost behavior.
5. **Accurate Test Count Reconciliation:** Reconciled historical receipts: the original test suite contained 57 testcase nodes (23 protocol conformance + 34 capability dispatch). The current Fix Round 1 suite contains 60 testcase nodes (23 protocol conformance + 37 capability dispatch, including 3 new numeric conversation ID normalization regressions).
6. **Explicit Unmet Seams Preserved:** In accordance with the parent ruling, unsupported capabilities (`binding/register`, `binding/list`, `session/fork`, `tools/register`) continue to reject with `UnsupportedCapabilityError` detailing the exact missing SPI seam. No speculative interfaces (`IBindingStore`, `ISessionAdmin`) were invented.

---

## 2. File Ownership in Fix Round 1

### Owned Source Files
- `packages/runner/src/dispatch/types.ts`: declared `SessionDispatcherOptions`, `UnsupportedCapabilityError`.
- `packages/runner/src/dispatch/normalizers.ts`: extracted normalizers (`normalizeConversationId`, `extractPromptInput`, `extractPromptOptions`).
- `packages/runner/src/dispatch/session-dispatcher.ts`: `createSessionDispatcher({ coordinator, engine })` using canonical package imports (189 LOC).
- `packages/runner/src/dispatch/index.ts`: module export barrel.

### Owned Test Files & Evidence
- `packages/runner/test/capability-dispatch.test.ts`: 37 behavioral tests using `@durable-zero/protocol`, `@durable-zero/core`, and `@durable-zero/contracts`.
- `packages/protocol/test/protocol-conformance.test.ts`: 23 protocol conformance tests.
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/public-import-regression-red.log`: immutable RED receipt of prototype split failure.
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/test-output.txt`: console output of 60 passing tests.
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/junit.xml`: structured JUnit XML with 60 testcase nodes.
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/report.md`: this milestone report.
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/report.json`: machine-readable summary.

*(No files outside owned scope were touched: Core, native adapter, composition, main, CLI, shared build scripts, and package manifests remain untouched).*

---

## 3. Test & Verification Receipts

| Test Suite | File | Tests | Pass | Fail | Exit Code | Time |
|---|---|---|---|---|---|---|
| Protocol Conformance | `packages/protocol/test/protocol-conformance.test.ts` | 23 | 23 | 0 | 0 | 1005ms |
| Capability Dispatch | `packages/runner/test/capability-dispatch.test.ts` | 37 | 37 | 0 | 0 | 129ms |
| **Combined Fix Round 1** | *(both files)* | **60** | **60** | **0** | **0** | **1156ms** |

### Provenance of Test Receipts
- **RED Evidence:** `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/public-import-regression-red.log` (captured `2026-11-05T00:15:30+03:00`, exit code `1`).
- **GREEN Output:** `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/test-output.txt` (captured `2026-11-05T00:23:45+03:00`, exit code `0`).
- **GREEN JUnit:** `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/junit.xml` (captured `2026-11-05T00:23:48+03:00`, 60 `<testcase>` tags, 0 failures, 0 errors).

---

## 4. Semantic Probes & Architecture Rules

1. **Dependency Traceability (AP-074, AP-076):**
   - `coordinator.prompt`: `packages/runner/src/dispatch/session-dispatcher.ts:33`, `:39`, `:45`
   - `coordinator.abort`: `packages/runner/src/dispatch/session-dispatcher.ts:50`
   - `engine.abortTask`: `packages/runner/src/dispatch/session-dispatcher.ts:59`
   - `engine.compact`: `packages/runner/src/dispatch/session-dispatcher.ts:70`
   - `coordinator.setSubagentPolicy`: `packages/runner/src/dispatch/session-dispatcher.ts:80`
   - `engine.getState`: `packages/runner/src/dispatch/session-dispatcher.ts:85`
   - `engine.setModel`: `packages/runner/src/dispatch/session-dispatcher.ts:100`
   - `engine.setThinkingLevel`: `packages/runner/src/dispatch/session-dispatcher.ts:112`
   - `coordinator.getState`: `packages/runner/src/dispatch/session-dispatcher.ts:118`
   - `coordinator.getTranscript`: `packages/runner/src/dispatch/session-dispatcher.ts:131`
   - `coordinator.getStats`: `packages/runner/src/dispatch/session-dispatcher.ts:140`
   All methods invoke genuine public contracts. Zero decorative ports.

2. **Runtime Completeness & Split-Brain Elimination (AP-010, AP-025):**
   By eliminating `../../../protocol/src/...` and using `@durable-zero/protocol`, module identity is unified across source tests, compiled bundles, and public servers.

3. **Entry Point Wiring (AP-020, AP-075):**
   `createSessionDispatcher` handoff contract remains frozen and ready for composition root integration.

4. **Anti-Gaming & Line Budget Reality (AP-019, AP-076):**
   - `session-dispatcher.ts`: 189 LOC.
   - `normalizers.ts`: 114 LOC.
   - `types.ts`: 21 LOC.
   - All files well within AP-019 hard limit (250 LOC).
   - Error classification tested via nominal `instanceof` with public package resolution.

---

## 5. Architectural Scoping & Residual Risk

- **Passed Rules:** AP-010, AP-011, AP-012, AP-014, AP-016, AP-018, AP-019, AP-020, AP-021, AP-022, AP-025, AP-026, AP-028, AP-029, AP-072, AP-074, AP-076.
- **Residual Risk:**
  - `binding/register`, `binding/list`, `session/fork`, and `tools/register` remain unsupported in this component scope, as ruled by parent. A separate source-backed integration scope will address these after native walking skeleton acceptance.
  - Final composition wiring into `composition.ts` is owned by the composition owner.

**VERDICT (Fix Round 1 Component Scope): PASS**  
Source-write quiescence active. Holding for parent checkpoint and fresh compiled-component build/review.
