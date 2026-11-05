# Cycle 7 Task 4A: Protocol Low-Level JSON-RPC Defects Implementation Report

- **Status:** DONE
- **Date:** 2026-11-04
- **Branch:** `cycle-7-runtime-adapter-ioc-migration`
- **Subthread ID:** `thr_45qtxkivss` (parent handoff target: `thr_9yjb93iwmn`)

---

## 1. Executive Summary

Task 4A resolves the three foundational JSON-RPC 2.0 transport and schema defects in `@durable-zero/protocol` in parallel with Slice 0, without touching any reserved runner/core/adapter/contracts/CLI files, package manifests, or public transport APIs.

All changes were implemented via strict TDD (behavioral RED recorded before implementation, GREEN verified after). All owned files conform to AP-019/AP-070 line budgets (<= 120 lines).

Following parent review finding [P2] on candidate `ad122ff`, Fix Round 1 removed the mutable name fallback and strictly enforced typed error identity (`err instanceof JsonRpcMethodNotFoundError`), with covering TDD regressions recorded.

---

## 2. Defects Remediated & Behavioral Changes

### Defect 1: Inbound Notifications
- **Problem:** `RequestDispatcher` only checked `jsonRpcRequestSchema`, requiring `id`. An incoming notification was parsed as an invalid request, emitted `-32600 Invalid Request`, and never invoked the handler.
- **Fix:** If a message contains no `"id"` field (`!("id" in raw)`), it is validated against `jsonRpcNotificationSchema`. If valid, `handler(method, params)` is called and **no response is ever emitted**, even if the handler throws or rejects.
- **Invariants preserved:** Request IDs `0` and `""` (empty string) retain their `"id"` member and are dispatched strictly as requests. Messages with `"id": null` are not classified as ID-less notifications and receive `-32600 Invalid Request`.

### Defect 2: Typed Method Not Found Error Mapping
- **Initial Fix (Candidate `ad122ff`):** Exported `JsonRpcMethodNotFoundError(method?: string)` with `code = -32601`. The initial candidate included a duck-typing fallback (`err.name === "JsonRpcMethodNotFoundError"`).
- **Finding & Remediation (Fix Round 1):** Parent's probe demonstrated that mutating `.name` on an ordinary `Error("backend fault")` caused it to be erroneously reclassified as `-32601`. The name fallback was completely removed per AP-022/AP-026. The dispatcher now recognizes strictly `err instanceof JsonRpcMethodNotFoundError` (which also correctly preserves legitimate subclasses). Renamed ordinary errors strictly produce `-32603`.

### Defect 3: Response Schema XOR, Void Handler Serialization & Correlation
- **Problem 1 (Schema):** `jsonRpcResponseSchema` had independent optional `result` and `error`, incorrectly accepting responses with both or neither.
- **Fix 1:** Added `.superRefine` enforcing exact XOR: exactly one of `result` or `error` must be present (checked via `Object.prototype.hasOwnProperty` and `!== undefined`). Valid falsy/null results (`null`, `false`, `0`, `""`) pass validation.
- **Problem 2 (Void Handlers):** Handlers returning `void`/`undefined` had `result: undefined` in the response payload, which `JSON.stringify` stripped, emitting an invalid response missing `result`.
- **Fix 2:** In `RequestDispatcher`, void/undefined handler returns serialize as explicit `result: null`.
- **Problem 3 (Unsolicited Responses & Malformed Response Correlation):** Responses to outbound requests (`host/toolCall`) missing both or containing both result/error now reject the pending promise immediately with `Malformed JSON-RPC response from client: ...` and clean up pending timers. Unsolicited responses (unknown `id` or timed-out requests) are dropped cleanly and never reflected back as invalid requests.

---

## 3. Initial Test Evidence & Artifact Paths (Candidate `ad122ff`)

### Test Commands
- **RED run:**
  ```bash
  node --test --test-reporter=junit --test-reporter-destination=/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-red.junit.xml packages/protocol/test/protocol-conformance.test.ts
  ```
- **GREEN run:**
  ```bash
  node --test --test-reporter=junit --test-reporter-destination=/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-green.junit.xml packages/protocol/test/*.test.ts
  ```

### Artifact Paths
- **RED JUnit:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-red.junit.xml`
- **RED Log:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-red.log`
- **GREEN JUnit:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-green.junit.xml`
- **GREEN Log:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-conformance-green.log`

---

## 4. Exact Owned Files for Mechanical Checkpoint

1. `packages/protocol/src/jsonrpc/schema.ts` (43 lines) — added response XOR refinement
2. `packages/protocol/src/jsonrpc/errors.ts` (11 lines, new file) — exported `JsonRpcMethodNotFoundError`
3. `packages/protocol/src/transport/request-dispatcher.ts` (99 lines) — notifications, strict typed error mapping, response correlation
4. `packages/protocol/src/index.ts` (6 lines) — additive export of errors
5. `packages/protocol/test/protocol-conformance.test.ts` (498 lines) — 20 conformance tests
6. `packages/protocol/test/protocol.test.ts` (114 lines) — verified intact, 4 existing tests passing

All production files strictly adhere to AP-019/AP-070 line budget (<= 120 lines). Code is left uncommitted in working tree for parent mechanical packaging.

---

## 5. Public API Preservation

- `StdioJsonRpcServerOptions`, constructor, `start()`, `stop()`, `close()`, `send()`, `sendNotification()`, `request()` signatures and behaviors are completely preserved.
- `MethodHandler` signature `(method: string, params: Record<string, unknown>) => Promise<unknown>` is unchanged.
- `ITransportStrategy` interface is unchanged.
- Reverse request/response routing and outbound promise tracking remain fully operational.

---

## 6. Runner Typed-Error Integration Requirement

- Slice 0 / Runner fallback: when an unhandled method arrives at the runtime method registry or runner, throw `new JsonRpcMethodNotFoundError(method)` imported from `@durable-zero/protocol`.
- The dispatcher catches this typed error and emits `-32601 Method not found`.
- All other unexpected errors continue to map safely to `-32603`.

---

## 7. Residual Risks & Excluded Scope

- **Batch Requests (`[...]`):** Full batch array parsing remains part of the broader Task 4 specification and is not included in this bounded defect slice.
- **Positional Parameters (`params: [...]`):** Inbound params remain structured records per existing schemas.
- **Late Client Responses:** Out-of-band client responses that arrive after the request timeout (or for expired IDs) are dropped silently by design to prevent ping-pong reflection loops.

---

## 8. Fix Round 1 Remediation (P2 Typed Error Identity Enforcement)

### Defect
- Mutable `.name` check `err.name === "JsonRpcMethodNotFoundError"` allowed renamed ordinary `Error` instances to map to `-32601`.

### TDD Execution
1. **RED:** Added regression tests in `packages/protocol/test/protocol-conformance.test.ts`:
   - `maps renamed ordinary Error to -32603 internal error response, not -32601`
   - `maps legitimate subclass of JsonRpcMethodNotFoundError to -32601`
   Observed failure:
   `AssertionError [ERR_ASSERTION]: Renamed ordinary Error must not be reclassified as -32601: -32601 !== -32603`.
2. **Fix:** Replaced catch check in `packages/protocol/src/transport/request-dispatcher.ts` with `const isNotFound = err instanceof JsonRpcMethodNotFoundError;`.
3. **GREEN:** All 24 tests passed across `protocol-conformance.test.ts` (20/20) and `protocol.test.ts` (4/4).

### Fix Round 1 Artifacts
- **RED Test Command:**
  ```bash
  node --test --test-reporter=junit --test-reporter-destination=/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-red.junit.xml packages/protocol/test/protocol.test.ts packages/protocol/test/protocol-conformance.test.ts
  ```
- **RED JUnit:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-red.junit.xml`
- **RED Log:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-red.log`
- **GREEN Test Command:**
  ```bash
  node --test --test-reporter=junit --test-reporter-destination=/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-green.junit.xml packages/protocol/test/protocol.test.ts packages/protocol/test/protocol-conformance.test.ts
  ```
- **GREEN JUnit:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-green.junit.xml`
- **GREEN Log:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fixround1-green.log`

### Test Summary (Fix Round 1)
- `protocol-conformance.test.ts`: 20/20 PASS
- `protocol.test.ts`: 4/4 PASS
- **Total:** 24/24 PASS in 1005ms.
