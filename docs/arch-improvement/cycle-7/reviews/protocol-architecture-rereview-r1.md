# Scoped Architecture Re-Review (Fix Round 1): durable-zero Cycle 7 Task 4A

- **Task:** Cycle 7 Task 4A (Protocol Low-Level JSON-RPC Defects)
- **Fix Base:** `ad122ffc9a7bf63c73a516d19fb07afcabeb7781`
- **Fix Head:** `f3fff38a84154a36f017514c234421aef5215ced`
- **Manifest:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fix-r1-manifest.json`
- **Diff:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-fix-r1-review.diff`
- **Reviewer:** Independent Architecture Reviewer (Pi Provider)
- **Date:** 2026-11-04

---

## 1. Finding Verdicts

### [P2] Generic Error Renamed JsonRpcMethodNotFoundError Must Stay -32603
- **Verdict:** **ADDRESSED**
- **Evidence:**
  - `packages/protocol/src/transport/request-dispatcher.ts:89-94`:
    ```ts
    const isNotFound = err instanceof JsonRpcMethodNotFoundError;
    this.send({
      jsonrpc: "2.0",
      id,
      error: isNotFound
        ? { code: -32601, message: err.message }
        : { code: -32603, message: err instanceof Error ? err.message : String(err) },
    });
    ```
  - Removed the fragile duck-typing fallback `err.name === "JsonRpcMethodNotFoundError"` that previously permitted an arbitrary `Error` instance with a mutated `name` property to masquerade as a method-not-found error.
  - Added negative regression test in `packages/protocol/test/protocol-conformance.test.ts:222-251` (`maps renamed ordinary Error to -32603 internal error response, not -32601`). Verified that the pre-fix code failed with `-32601 !== -32603` in `protocol-fixround1-red.junit.xml`.
  - Added positive inheritance test in `packages/protocol/test/protocol-conformance.test.ts:253-282` (`maps legitimate subclass of JsonRpcMethodNotFoundError to -32601`), verifying that genuine subclasses still map to `-32601`.
  - TypeScript now natively narrows `err` to `JsonRpcMethodNotFoundError` on the true branch, removing the previous `as Error` cast and ensuring type-safe access to `err.message`.

---

## 2. New Breakage in the Fix Diff

- **Critical:** None.
- **Important:** None.
- **Minor:** None.

The fix diff is strictly limited to 5 lines modified in `packages/protocol/src/transport/request-dispatcher.ts` and 62 lines added in `packages/protocol/test/protocol-conformance.test.ts`. All public signatures, server lifecycle contracts, and outbound request-response correlations remain completely untouched and green.

---

## 3. Out-of-Scope Observations

- **Test Receipt Scope:** As noted in the handoff brief, the RED test run command executed against `packages/protocol/test/*.test.ts` capturing 13 Host schema test cases (37 total cases / 1 failure), whereas the report section 8 listed a narrower target command. The verified artifact `protocol-fixround1-red.junit.xml` confirms that exactly one failure occurred on the targeted regression case, and `protocol-fixround1-green.junit.xml` confirms 24/24 clean passes across protocol conformance and server tests.
- **Slice 0 Integration Gate:** `packages/runner/src/composition.ts:85` continues to throw generic `new Error(`Unknown method: ${method}`)`. Slice-0 worker (`thr_tcbhyv8p4r`) owns updating this fallback to `throw new JsonRpcMethodNotFoundError(method)`.

---

## 4. Architecture Verification & AP Rules

- **AP-012 / AP-022 (Typed Errors over String/Name Heuristics): PASS**
  Classification relies purely on class prototype identity (`err instanceof JsonRpcMethodNotFoundError`), preventing both error-message string guessing and duck-typing attribute spoofing.
- **AP-019 / AP-070 (Line Budget & Complexity): PASS**
  `packages/protocol/src/transport/request-dispatcher.ts` reduced to 99 LOC, cleanly within limits.
- **AP-028 (Behavioral Assertions & TDD Evidence): PASS**
  Verified RED failure (`Renamed ordinary Error must not be reclassified as -32601: -32601 !== -32603`) and GREEN resolution (24 cases passing across protocol unit suite).
- **Mandatory Semantic Probes:**
  1. *Dependency Traceability (AP-074, AP-076):* PASS (handler, send, pendingOutbound invocations unchanged).
  2. *Runtime Completeness & Split-Brain:* PASS (single canonical dispatcher and error class).
  3. *Entry Point Wiring (AP-020, AP-075):* PASS (StdioJsonRpcServer unchanged and fully wired).
  4. *Anti-Gaming & Line Budget Reality (AP-076):* PASS (genuine error type check, no hollow stubs).

---

## 5. Round Verdict

**VERDICT: PASS (All findings addressed, zero open P0/P1/P2 findings)**

- The open P2 finding is fully ADDRESSED with rigorous TDD verification.
- Zero new breakage introduced by the fix diff.
- Ready for integration handoff to parent coordinator and Slice-0 runner worker.
