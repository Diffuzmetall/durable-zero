# Architecture & Spec Review: durable-zero Task 2A (Isolated HostBridge Component)

**Task:** durable-zero Cycle 7 Task 2A (Slice S7 — Isolated HostBridge Component)  
**Review Type:** Independent Architecture & Spec Compliance Review  
**Reviewer:** Independent Reviewer (provider: `pi`, fresh session)  
**Base Commit:** `cb4801a0654938350eefd2f9345b4caaa857b114`  
**Candidate Head:** `efc9eab7ddfba4ba95fb754329d33f05adda2c12`  
**Manifest:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/hostbridge-fixed-manifest.json`  
**Diff Package:** `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/hostbridge-review-package-fixed.diff`  
**Date:** 2026-11-04  

---

## 1. Spec Compliance & Task Scope

### ✅ Spec Compliant

1. **Pure Port Interface (`packages/core/src/tools/host-bridge.ts:1-33`):**
   - Exact signature conformance to Canonical Design Amendment §5 and dispatch requirements:
     - `forwardToolCall(toolName: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>`
     - `requestInteraction(kind: string, payload: { title?: string; message?: string; data?: unknown }): Promise<unknown>`
   - Imports zero I/O or SDK packages (pure core port).

2. **Schema & JSON Validation (`packages/protocol/src/methods/host.ts:1-54`):**
   - Implements genuine recursive JSON validation (`jsonValueSchema`), rejecting `NaN`, `Infinity`, `undefined`, functions, symbols, and `BigInt`.
   - `hostToolCallParamsSchema` enforces non-empty `toolName` and valid JSON arguments.
   - `hostToolResultSchema` enforces text-content blocks and preserves optional boolean `isError`.
   - `hostInteractionParamsSchema` enforces non-empty `kind` and optional title, message, and JSON data.

3. **Stateless Adapter Implementation (`packages/runner/src/host/host-bridge.ts:1-100`):**
   - Implements `IHostBridge` with injected `HostRequester` receiving `request(method, params, timeoutMs)`.
   - Constructor validates options object, requester interface, and positive finite `timeoutMs` (defaults to 30,000ms).
   - Zero duplicated wire IDs, timers, or pending correlation maps: wire transport owns correlation and timeouts.
   - Preserves `isError: true` on tool results without throwing.
   - Propagates transport rejection cleanly without fabricating approval or coercing timeouts to null.
   - Avoids TypeScript constructor parameter properties for full compatibility with Node 26 type stripping.

4. **Parent Fix Round 1 Remediation (Authoritative Kind & Truthful Behavioral RED):**
   - **Authoritative Kind Defense:** `packages/runner/src/host/host-bridge.ts:85-90` extracts only declared `title`, `message`, `data` fields from `rawPayload` and explicitly binds `kind`. Untrusted runtime payload fields (such as `payload.kind`) can never override the explicit `kind` argument.
   - **Verified TDD Negative Controls:** The author conducted a bounded behavioral RED→GREEN redo with valid unimplemented boundary stubs (`redo-host-methods-behavioral-red.junit.xml` [7 failures], `redo-host-bridge-behavioral-red.junit.xml` [22 failures], and `fix-round-1-kind-override-red.junit.xml` [1 failure on kind override]). Initial missing-module errors are preserved and clearly distinguished from behavioral assertions.

5. **Strict File Ownership:**
   - Exactly five exclusive files touched (952 lines added). Zero modifications to shared index files, build configs, package locks, or concurrent writers' files.

### ⚠️ Cannot Verify from Diff Alone (Explicitly Deferred Integration Gates)

- **Public Package Exports (`packages/core/src/index.ts`, `packages/protocol/src/index.ts`):** Intentionally unexported to avoid colliding with Slice 0 (`thr_tcbhyv8p4r`) and Protocol (`thr_45qtxkivss`) writers.
- **Composition Wiring & Dynamic Tools (`assembleDurableZero`, `tools/register`):** Intentionally excluded from Task 2A scope; scheduled for subsequent full Task 2 integration.
- **Full Model-Issued Tool E2E Execution:** Component tests verify real in-memory stdio transport; full model execution loop remains a downstream integration gate.

---

## 2. Strengths

- **Defensive Boundary Hygiene:** Destructuring declared payload fields prevents prototype pollution or malicious parameter shadowing from mutating the authoritative interaction `kind`.
- **Real Schema Validation:** Unlike vacuous `z.unknown()` passes, the schemas enforce strict JSON serializability and reject IEEE-754 special values (`NaN`, `Infinity`).
- **Transport Separation of Concerns:** Perfectly abides by the ruling that the transport owns correlation IDs and timeouts. `HostBridge` simply forwards `timeoutMs` as the third parameter.
- **Node 26 Compatibility:** Strictly uses explicit property initializers instead of TS parameter properties, avoiding type-stripping runtime syntax errors.
- **Robust Out-of-Order Correlation Tests:** Component tests with real `StdioJsonRpcServer` exercise concurrent requests answered in inverted sequence with dynamic wire ID extraction, confirming zero race conditions.

---

## 3. Four Mandatory Semantic Probes

### 1. Traceability of Injected Dependencies (AP-074, AP-076)
- **Status:** **PASS**
- **Evidence:** `options.requester` is accepted in the constructor (`packages/runner/src/host/host-bridge.ts:28-49`) and assigned to `private readonly requester`. It is actively invoked in every operational method:
  - `forwardToolCall` at lines 64-68: `await this.requester.request("host/toolCall", ...)`
  - `requestInteraction` at lines 92-96: `await this.requester.request("host/interaction", ...)`
- Zero hollow abstractions or decorative dependencies.

### 2. Runtime Completeness & Split-Brain Detection
- **Status:** **PASS (Component Scope)**
- **Evidence:** Test files (`packages/protocol/test/host-methods.test.ts` and `packages/runner/test/host-bridge.test.ts`) import only new component files and `packages/protocol/src/transport/stdio-server.ts`. Zero references or imports to legacy `packages/runner/src/host-rpc.ts`. Legacy host file cleanup is explicitly scheduled for full Task 2 composition.

### 3. Entry Point Wiring (AP-020, AP-075)
- **Status:** **NOT APPLICABLE / DEFERRED (By Contract)**
- **Evidence:** Task 2A was explicitly commissioned as an isolated component without public exports or composition root integration (`assembleDurableZero`) to enable concurrent execution alongside Slice 0. Public export, composition wiring, and walking skeleton E2E are explicit downstream gates that remain pending.

### 4. Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Status:** **PASS**
- **Evidence:**
  - `packages/core/src/tools/host-bridge.ts`: 33 LOC (budget: 120)
  - `packages/protocol/src/methods/host.ts`: 54 LOC (budget: 120)
  - `packages/runner/src/host/host-bridge.ts`: 100 LOC (budget: 120)
  - Full error handling, options checking, and schema parsing are present; no logic was truncated to meet line limits. Wire IDs in tests are dynamically captured from real transport emissions rather than hardcoded fake receipts.

---

## 4. Issues & Findings

### Critical (Must Fix — P0/P1)
*None.*

### Important (Should Fix — P2)
*None. Both Fix Round 1 parent findings (kind-override and truthful behavioral RED) are completely resolved.*

### Minor (Nice to Have — P3)

- **[P3] Direct propagation of raw ZodError on malformed host responses**
  - **Evidence:** `packages/runner/src/host/host-bridge.ts:69,98` calls `.parse()` directly on raw host results.
  - **Impact:** Callers receiving an invalid host tool or interaction payload receive a raw `ZodError` rather than a wrapped, domain-specific `HostProtocolError`. For the component layer this is clean and informative, but may be normalized during full runner composition.
  - **Rule:** AP-022 (Typed errors and explicit exception handling)
  - **Fix decision:** `log-only`

- **[P3] Recursive lazy schema parsing performance on large payloads**
  - **Evidence:** `packages/protocol/src/methods/host.ts:17-23` uses `z.lazy(() => ...)` for `jsonValueSchema`.
  - **Impact:** Recursive schema checking adds minor validation overhead for deeply nested JSON objects. Completely acceptable for normal tool and interaction payloads.
  - **Rule:** AP-015 (KISS / YAGNI)
  - **Fix decision:** `log-only`

---

## 5. Architecture Verification

- **Passed Rules:**
  - `AP-010`: Ports & Adapters cleanly separated (pure port in `core`, adapter in `runner`).
  - `AP-011`: High cohesion, single responsibility in each module.
  - `AP-012`: Fail-fast error contracts (TypeErrors on constructor, ZodErrors on bad payloads, transport rejection propagation).
  - `AP-014`: SOLID principles applied to the host bridge adapter.
  - `AP-015`: YAGNI respected — no extraneous caching or state machines.
  - `AP-016`: Security boundary defended against property shadowing on interaction kind.
  - `AP-018`: Single responsibility per file.
  - `AP-019` / `AP-070`: All files strictly under 120 LOC.
  - `AP-020`: Injected requester; zero package-level singletons.
  - `AP-022`: Typed validation via Zod schemas.
  - `AP-023`: Strict async discipline; all promises awaited, zero floating promises.
  - `AP-025`: Dependency direction strictly inward (core has 0 deps, runner depends on core port).
  - `AP-026`: DTO schemas explicit and guarded.
  - `AP-028`: Deterministic in-memory unit and integration tests.
  - `AP-029`: TypeScript strictness maintained.
  - `AP-032`: Command/query separation preserved.
  - `AP-074`: Injected dependencies explicitly called; no global singletons.
  - `AP-076`: Anti-hollow verified via real behavioral RED assertions.

- **Not Applicable / Deferred Rules:**
  - `AP-021`, `AP-075`: Composition root and entry point wiring intentionally deferred to subsequent integration tasks.

- **Residual Risk:**
  - Downstream integration gates remain pending: public package exports (`core/index.ts`, `protocol/index.ts`), dynamic tools registration, runner composition wiring, and full model E2E execution.

---

## 6. Verdict

- **Task Quality:** **Approved**
- **Architecture & Spec Verdict:** **PASS (Scoped to Task 2A Isolated Component)**
- **Note on System State:** This PASS applies exclusively to the candidate component implementation at `efc9eab`. Public package exports, Harness integration, and full model E2E remain pending downstream gates.
