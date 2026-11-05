# Architecture & Code Quality Review: durable-zero Cycle 7 Task 4A

- **Task:** Cycle 7 Task 4A (Protocol Low-Level JSON-RPC Defects)
- **Candidate Head:** `ad122ffc9a7bf63c73a516d19fb07afcabeb7781`
- **Base:** `cdcb0cb9d94fc12d0e50afe805c21b14c2e09dc7`
- **Reviewer:** Independent Architecture Reviewer (Pi Provider)
- **Date:** 2026-11-04

---

## 1. Spec Compliance

**Verdict:** ✅ Spec compliant

The implementation precisely satisfies all binding requirements specified in the Cycle 7 Task 4A brief and S7 contract:

1. **Defect 1: Inbound Notifications**
   - **Compliant:** `RequestDispatcher.processLine` checks `!("id" in raw)` and validates against `jsonRpcNotificationSchema`.
   - **Behavior:** Valid notifications invoke `this.handler(method, params)` without generating an ID or sending any response on stdout (`packages/protocol/src/transport/request-dispatcher.ts:65-73`).
   - **Failure handling:** Notification handler rejections/errors are cleanly swallowed (`packages/protocol/src/transport/request-dispatcher.ts:69-71`), ensuring no error response is emitted over the wire per JSON-RPC 2.0 §4.1.
   - **Preserved IDs:** Numeric ID `0` and empty string ID `""` are explicitly preserved as requests because `"id" in raw` evaluates to `true` (`packages/protocol/test/protocol-conformance.test.ts:94-137`). Messages with `id: null` receive `-32600 Invalid Request` and do not trigger notification dispatch.

2. **Defect 2: Typed Method Not Found Error Mapping**
   - **Compliant:** Introduced `JsonRpcMethodNotFoundError` in `packages/protocol/src/jsonrpc/errors.ts:1-11`, setting `this.code = -32601`, `this.name = "JsonRpcMethodNotFoundError"`, and proper prototype chain via `Object.setPrototypeOf`.
   - **Additive Export:** Exported from `packages/protocol/src/index.ts:1` without breaking existing exports.
   - **Dispatcher Mapping:** In `packages/protocol/src/transport/request-dispatcher.ts:88-96`, error checking combines `err instanceof JsonRpcMethodNotFoundError` with cross-boundary duck-typing fallback `err.name === "JsonRpcMethodNotFoundError"`. Matches map to `code: -32601`. Generic exceptions default to `code: -32603`. No error-string heuristics or regex parsing are used.

3. **Defect 3: Response Schema XOR, Void Handler Serialization & Correlation**
   - **Compliant:** `jsonRpcResponseSchema` in `packages/protocol/src/jsonrpc/schema.ts:10-37` uses `.superRefine` to assert that exactly one of `result` or `error` is present via `hasOwnProperty` and `!== undefined`. Responses with both or neither are rejected.
   - **Falsy Values:** Valid falsy results (`null`, `false`, `0`, `""`) pass schema validation without regression.
   - **Void Handler Serialization:** In `packages/protocol/src/transport/request-dispatcher.ts:86`, handlers returning `void` / `undefined` serialize as explicit `result: null`, ensuring `JSON.stringify` produces a valid JSON-RPC 2.0 response with the `result` field present.
   - **Unsolicited Response Absorption:** Wire messages without a `method` and not matching any entry in `pendingOutbound` are discarded silently if they contain `result` or `error` (`packages/protocol/src/transport/request-dispatcher.ts:61`), preventing infinite reflection loops.
   - **Correlation & Timer Teardown:** Outbound request responses clear timeout timers and remove the pending record before resolving or rejecting (`packages/protocol/src/transport/request-dispatcher.ts:50-60`). Malformed responses reject immediately rather than hanging until timeout.

4. **Global Constraints & Scope Boundaries**
   - **Compliant:** Existing public signatures for `StdioJsonRpcServerOptions`, `StdioJsonRpcServer`, `ITransportStrategy`, `RequestDispatcher`, `MethodHandler`, and `PendingOutbound` are frozen and untouched.
   - **Out-of-Scope Respected:** No batches, positional parameter arrays, capability dispatch, probe mode, or runtime engine modifications were introduced.

**⚠️ Cannot verify from diff alone:**
- Runner-side fallback adoption: `packages/runner/src/composition.ts` currently throws generic `new Error(`Unknown method: ${method}`)`. Updating this fallback to throw `JsonRpcMethodNotFoundError` belongs to Slice 0 worker (`thr_tcbhyv8p4r`) per execution contract.

---

## 2. Task Quality

**Assessment:** Approved

**Reasoning:**
The implementation delivers a focused, robust, and zero-bloat remediation of the protocol envelope defects. The changes adhere strictly to the JSON-RPC 2.0 specification, demonstrate textbook TDD with documented behavioral RED/GREEN transitions, and preserve backward compatibility across all transport contracts.

---

## 3. Strengths

1. **Spec-Exact Notification Semantics:** The distinction between ID-less messages and messages with falsy IDs (`0`, `""`, `null`) is handled correctly using `"id" in raw`, preventing misclassification.
2. **Resilient Typed Error Discrimination:** Combining `instanceof JsonRpcMethodNotFoundError` with `err.name === "JsonRpcMethodNotFoundError"` prevents prototype mismatch issues across bundling or ESM/CJS boundaries while avoiding fragile message string matching.
3. **Rigorous XOR Validation:** Schema refinement cleanly validates presence vs `undefined` while allowing valid JSON values like `false`, `0`, `null`, and `""`.
4. **Leak-Free Outbound Correlation:** Timeout timers are synchronously cleared and pending entries deleted prior to resolving or rejecting, preventing timer leaks or stale promise references.
5. **High-Quality Behavioral Test Suite:** 18 comprehensive test cases in `packages/protocol/test/protocol-conformance.test.ts` exercise real Node.js readable/writable streams and end-to-end server dispatch, avoiding vacuous mocks.
6. **Exemplary Line Budget Discipline:** Every changed file remains compact and single-purpose: `errors.ts` (11 LOC), `schema.ts` (43 LOC), `request-dispatcher.ts` (100 LOC), well within AP-019/AP-070 guidelines.

---

## 4. Issues & Findings

### Critical (Must Fix)
*None.*

### Important (Should Fix)
*None.*

### Minor (Nice to Have)

- [P3] Observability: Silent Swallow of Notification Handler Errors
  - Evidence: `packages/protocol/src/transport/request-dispatcher.ts:69-71`
    ```ts
    try {
      await this.handler(notifVal.data.method, notifVal.data.params ?? {});
    } catch {
      // Notifications MUST NOT be responded to, even on failure
    }
    ```
  - Impact: While JSON-RPC 2.0 §4.1 mandates that no response be returned for notifications, errors thrown by notification handlers are discarded without logging. In debugging or production diagnostics, caller handler errors might be silent unless logged inside the handler itself.
  - Rule: AP-023
  - Fix decision: log-only (Acceptable at transport layer since `RequestDispatcher` has no logger port; caller `MethodHandler` can log internally).

- [P3] Code Cleanliness: Minor ID Extraction Duplication
  - Evidence: `packages/protocol/src/transport/request-dispatcher.ts:48` and `:78`
    ```ts
    const id = "id" in raw && (typeof raw.id === "string" || typeof raw.id === "number") ? raw.id : null;
    ```
  - Impact: Minor logic duplication across response correlation and request validation.
  - Rule: AP-019
  - Fix decision: log-only (100-line file; inline logic is legible and bounded).

---

## 5. Architecture Verification

### Mandatory Semantic Probes

1. **Traceability of Injected Dependencies (AP-074, AP-076): PASS**
   - `this.handler`: Invoked on notification path at `packages/protocol/src/transport/request-dispatcher.ts:68` and on request path at `line 85`.
   - `this.send`: Invoked on parse error (`line 43`), invalid request (`line 38, 79`), request success (`line 86`), and request error (`line 90`).
   - `this.pendingOutbound`: Checked at `line 49`, retrieved at `line 50`, deleted at `line 52`.
   - *Result:* No decorative dependencies or hollow abstractions.

2. **Runtime Completeness & Split-Brain Detection: PASS**
   - Clean file hierarchy under `packages/protocol/src/`. No legacy duplicate dispatchers, shadow error classes, or unmigrated parallel files.
   - Re-exports in `packages/protocol/src/index.ts` cleanly unify all public symbols.

3. **Entry Point Wiring (AP-020, AP-075): PASS**
   - The production composition root in `packages/runner/src/composition.ts:3, 78` imports `StdioJsonRpcServer` directly from `@durable-zero/protocol`.
   - `StdioJsonRpcServer` instantiates and runs the updated `RequestDispatcher` on incoming stdio streams.
   - Verified that the production entry point executes the concrete implementation.

4. **Anti-Gaming & Line Budget Reality (AP-019, AP-076): PASS**
   - No truncated logic, no fake ID generation, no bypassed error handlers.
   - Line counts: `errors.ts` (11 LOC), `schema.ts` (43 LOC), `request-dispatcher.ts` (100 LOC), `index.ts` (7 LOC).
   - Strict functional completeness achieved within line budgets.

### AP Rules Compliance Baseline

- **Passed:**
  - AP-010: Strict layer boundaries; protocol remains pure contract/transport without infrastructure leaks.
  - AP-012: Fail-fast typed errors; `JsonRpcMethodNotFoundError` created as an explicit Error subclass.
  - AP-019 / AP-070: Modularity and line budget compliance (all files <= 100 LOC).
  - AP-020 / AP-075: Single composition root wiring through `StdioJsonRpcServer` and runner composition.
  - AP-021: Thin dispatch layer separating stream reading from method execution.
  - AP-022: Typed errors and status mapping over string guessing.
  - AP-023: Explicit async/await handling on handler promises.
  - AP-026: Explicit schemas and DTOs using Zod with strict XOR refinement.
  - AP-028: Thorough behavioral unit test suite with verified red/green JUnit artifacts.
  - AP-074 / AP-076: Genuine dependency invocation and non-hollow implementation.
- **Not Applicable:**
  - AP-027 (No secrets or environment variables involved in protocol envelope).
  - AP-032 (Database-level CQRS not applicable to wire transport protocol).

### Residual Risk

- **Low:** Slice-0 implementer (`thr_tcbhyv8p4r`) must update the fallback in `packages/runner/src/composition.ts` to throw `JsonRpcMethodNotFoundError` so unknown runner methods return `-32601`. This cross-task dependency is documented and anticipated by contract.

---

## 6. Verdict

**VERDICT: PASS**

- Zero P0, P1, or P2 blocking findings.
- All 4 Mandatory Semantic Probes PASS with concrete source citations.
- 100% spec compliant against JSON-RPC 2.0 §4.1/§5 and S7 Task 4A brief.
- Clean TDD verification with 22 passing tests in JUnit evidence.
