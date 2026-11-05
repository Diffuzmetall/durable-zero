# Cycle 7 Task 2A: Isolated HostBridge Component Report

**Status:** DONE  
**Slice:** S7 (Task 2A — Isolated HostBridge Component)  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Checkout:** `/Users/vanya/Projects/durable-zero`  
**Date:** 2026-11-04  

---

## 1. Five-File Ownership Verification

Strict disjoint file boundary maintained. Zero edits made outside these 5 files:

1. `packages/core/src/tools/host-bridge.ts` (33 lines)
   - Pure `IHostBridge` interface with `forwardToolCall` and `requestInteraction`.
   - Imports zero I/O or SDK dependencies.
   - Provides consumer convenience types: `HostToolCallContent`, `HostToolCallResult`, `HostInteractionPayload`.

2. `packages/protocol/src/methods/host.ts` (54 lines)
   - Typed payload schemas: `jsonValueSchema`, `jsonObjectSchema`, `jsonPrimitiveSchema`.
   - Strict JSON validation rejecting functions, `BigInt`, `Symbol`, `undefined`, `NaN`, and `Infinity`.
   - `hostToolCallParamsSchema`: validates `toolName` (min 1) and JSON `arguments`.
   - `hostToolResultSchema`: validates text content array and optional boolean `isError`.
   - `hostInteractionParamsSchema`: validates `kind` (min 1), optional `title`, `message`, and JSON `data`.

3. `packages/runner/src/host/host-bridge.ts` (90 lines)
   - Isolated `HostBridge` adapter implementing `IHostBridge`.
   - Receives `{ requester, timeoutMs?: number }`. Defaults to 30,000ms. Throws `TypeError` on invalid options/requester/timeout.
   - `forwardToolCall`: calls `requester.request("host/toolCall", { toolName, arguments: args ?? {} }, timeoutMs)`, validates returned payload via `hostToolResultSchema`, preserves `isError: true/false`.
   - `requestInteraction`: calls `requester.request("host/interaction", { kind, ...payload }, timeoutMs)`, validates response via `jsonValueSchema`, propagates rejections directly without fabricating confirmations.
   - Transport owns wire IDs, correlation, timers, and pending promises. No duplicate `idSource`, timers, or global singletons.
   - Written without TypeScript parameter properties for 100% compatibility with Node strip-only mode.

4. `packages/runner/test/host-bridge.test.ts` (528 lines)
   - Unit tests for constructor, options validation, defaults, and boundary defenses.
   - Unit tests for `forwardToolCall` (method, params, non-JSON defense, `isError` preservation, malformed result rejection, transport error propagation).
   - Unit tests for `requestInteraction` (all valid JSON response shapes, non-JSON rejection, transport error propagation).
   - In-memory full-duplex integration tests with real `StdioJsonRpcServer`:
     - Tool call forwarding with wire message validation.
     - Interaction request with wire message validation.
     - Two concurrent reverse calls answered out-of-order with dynamic wire ID observation and correct correlation.
     - Configurable short timeout enforcement (~50ms).
     - Server-close rejection of outstanding requests.

5. `packages/protocol/test/host-methods.test.ts` (212 lines)
   - Unit tests for `jsonValueSchema` (primitives, arrays, objects, non-finite numbers, functions, Symbols, BigInt, undefined).
   - Unit tests for `hostToolCallParamsSchema`.
   - Unit tests for `hostToolResultSchema` (valid text blocks, empty content, `isError`, malformed content rejection).
   - Unit tests for `hostInteractionParamsSchema`.

---

## 2. TDD Execution & Behavioral Evidence

### Phase 1: Protocol Host Methods & Schemas
- **RED run:**
  - Command: `node --test packages/protocol/test/host-methods.test.ts`
  - Exit code: 1 (module missing `ERR_MODULE_NOT_FOUND`)
  - JUnit: `host-methods-red.junit.xml`
  - Log: `host-methods-red.log`
- **GREEN run:**
  - Command: `node --test packages/protocol/test/host-methods.test.ts`
  - Exit code: 0 (13 tests passing, 0 failures, 149ms)
  - JUnit: `host-methods-green.junit.xml`
  - Log: `host-methods-green.log`

### Phase 2: HostBridge Component & Integration
- **RED run:**
  - Command: `node --test packages/runner/test/host-bridge.test.ts`
  - Exit code: 1 (module missing `ERR_MODULE_NOT_FOUND`)
  - JUnit: `host-bridge-red.junit.xml`
  - Log: `host-bridge-red.log`
- **GREEN run:**
  - Command: `node --test packages/runner/test/host-bridge.test.ts`
  - Exit code: 0 (22 tests passing, 0 failures, 295ms)
  - JUnit: `host-bridge-green.junit.xml`
  - Log: `host-bridge-green.log`

### Combined Verification:
- Command: `node --test packages/protocol/test/host-methods.test.ts packages/runner/test/host-bridge.test.ts`
- Result: **35 tests passing, 0 failures, 10 suites, duration: 326ms**.
- All artifacts mirrored to:
  - `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/` (parent orchestrator storage)
  - `/Users/vanya/.bb/thread-storage/thr_ynjrjkqgnx/` (current thread storage)

---

## 3. Architecture Rules Conformance (AP-010 ... AP-071)

- **AP-010 (Hexagonal Architecture / Ports & Adapters):**
  - Pure port `IHostBridge` in `packages/core/src/tools/host-bridge.ts`.
  - Concrete adapter `HostBridge` in `packages/runner/src/host/host-bridge.ts`.
  - Passed: AP-010.
- **AP-012 (Strict Layer Dependency Direction):**
  - Core has 0 dependencies on Runner or Protocol.
  - Protocol has 0 dependencies on Core or Runner.
  - Runner depends on Core port and Protocol schemas using correct source-level imports.
  - Passed: AP-012.
- **AP-020 (Explicit Dependency Injection / No Singletons):**
  - `HostBridge` receives requester via constructor options.
  - Zero mutable package-level singletons (unlike legacy `host-rpc.ts`).
  - Passed: AP-020.
- **AP-070 (Line Count Budgets):**
  - All source files strictly under 120 lines (33 lines, 54 lines, 90 lines).
  - Passed: AP-070.
- **Node Type-Stripping Compatibility:**
  - Zero TypeScript parameter properties used (`constructor(private readonly x: ...)` avoided).
  - Passed.

---

## 4. Integration Readiness & Outstanding Gates

As specified in the handoff contract, Task 2A deliverables are strictly isolated component pieces:
1. **Core Public Export:** `packages/core/src/index.ts` export of `IHostBridge` will be added by Slice-0 owner (`thr_tcbhyv8p4r`) when ready.
2. **Protocol Public Export:** `packages/protocol/src/index.ts` export of `host.ts` will be coordinated by the parent / protocol owner.
3. **Runner Composition & Dynamic Tools Wiring:** Wiring `HostBridge` into `assembleDurableZero`, dynamic tools registration (`tools/register`), extension UI, and deleting legacy `host-rpc.ts` remain downstream Task 2 gates.
4. **Model E2E Verification:** Full model-issued tool execution tests remain a downstream integration gate once composition wiring lands.

---

## 5. Risks & Residual Concerns

- **Zero regression risk to parallel workers:** No shared indexes, locks, plans, or build configs were modified.
- **Node runtime syntax sensitivity:** Parallel workers should be reminded that Node 26 type-stripping fails on TypeScript parameter properties in constructors. All Task 2A code uses explicit class property declarations.


---

## 6. Fix Round 1/5 Inspection & Remediation Report (2026-11-04)

### 6.1 Finding 1: Extra payload field overrides the explicit interaction kind (AP-022, AP-026) [P2]
- **Defect:** In `packages/runner/src/host/host-bridge.ts`, `requestInteraction` previously constructed `{ kind, ...payload }`. When callers supplied an object containing an extra `kind` property (e.g. `{ title: "Confirm operation", kind: "notify" }`), object spread semantics allowed `payload.kind` to overwrite the authoritative `kind` argument.
- **Regression Test Written & Run RED:**
  - Added test `"ensures explicit interaction kind is authoritative and cannot be overridden by payload field"` in `packages/runner/test/host-bridge.test.ts`.
  - Executed against checkpoint `8e42698`:
    - Command: `node --test packages/runner/test/host-bridge.test.ts`
    - Outcome: FAILED (1 failed test out of 23). `AssertionError: Expected 'notify' to equal 'confirm'`.
    - Artifacts: `fix-round-1-kind-override-red.junit.xml`, `fix-round-1-kind-override-red.log`.
- **Fix Applied:**
  - In `packages/runner/src/host/host-bridge.ts`: destructured explicit declared fields `{ title, message, data }` from `payload ?? {}`, explicitly passing `kind` as authoritative. Extra runtime properties on `payload` (including `payload.kind`) can never override the caller's explicit `kind` argument.
- **Verification GREEN:**
  - Command: `node --test packages/runner/test/host-bridge.test.ts`
  - Outcome: PASSED (23/23 tests passing, 0 failures, 290ms).
  - Artifacts: `redo-host-bridge-behavioral-green.junit.xml`, `redo-host-bridge-behavioral-green.log`.

### 6.2 Finding 2: Behavioral Negative-Control Evidence / Truthful RED Verification (AP-028, AP-076) [P2]
- **Audit Findings:** The initial report §2 recorded `ERR_MODULE_NOT_FOUND` for original RED runs before source files were created. As noted by parent inspection, module missing errors alone do not prove runtime negative control or behavioral test assertion capability.
- **Bounded Behavioral RED→GREEN Redo Executed:**
  1. **Protocol Methods (`packages/protocol/src/methods/host.ts`):**
     - Substituted minimal valid unimplemented boundary stubs (`z.any()`, missing property and non-finite validators).
     - Ran `node --test packages/protocol/test/host-methods.test.ts`:
       - Outcome: 7 failed behavioral assertions out of 13 tests (0 module-load or syntax errors).
       - Failing assertions: rejection of non-finite numbers, non-JSON values, missing/empty `toolName`, non-JSON arguments, malformed payloads, missing/empty `kind`, non-JSON data.
       - Artifacts: `redo-host-methods-behavioral-red.junit.xml`, `redo-host-methods-behavioral-red.log`.
     - Restored complete validated schemas:
       - Ran `node --test packages/protocol/test/host-methods.test.ts`:
       - Outcome: 13/13 passing tests (0 failures, 144ms).
       - Artifacts: `redo-host-methods-behavioral-green.junit.xml`, `redo-host-methods-behavioral-green.log`.
  2. **Runner HostBridge Component (`packages/runner/src/host/host-bridge.ts`):**
     - Substituted minimal valid unimplemented boundary stubs (stub class implementing `IHostBridge` returning dummy results with no constructor defense, parameter validation, timeout tracking, or wire correlation).
     - Ran `node --test packages/runner/test/host-bridge.test.ts`:
       - Outcome: 22 failed behavioral assertions out of 23 tests (0 module-load or syntax errors).
       - Failing assertions: options validation, requester verification, timeout bounds, tool dispatch & parameter formatting, error result preservation, malformed result rejection, non-JSON input defense, interaction dispatch & opaque JSON validation, out-of-order response correlation with actual IDs, timeout rejection, server-close rejection.
       - Artifacts: `redo-host-bridge-behavioral-red.junit.xml`, `redo-host-bridge-behavioral-red.log`.
     - Restored complete `HostBridge` implementation with the `kind`-override fix:
       - Ran `node --test packages/runner/test/host-bridge.test.ts`:
       - Outcome: 23/23 passing tests (0 failures, 290ms).
       - Artifacts: `redo-host-bridge-behavioral-green.junit.xml`, `redo-host-bridge-behavioral-green.log`.

### 6.3 Combined Suite & File Boundary Status
- **Combined Test Command:** `node --test packages/protocol/test/host-methods.test.ts packages/runner/test/host-bridge.test.ts`
- **Result:** 36 passing tests, 0 failures, 10 suites, total duration: 293ms.
- **Git Worktree Status:** Exactly the five owned files exist; zero edits outside them. Worktree remains uncommitted for parent's mechanical checkpointing.
- **Integration Status:** Component-only; public package exports (`core/index.ts`, `protocol/index.ts`), runner composition wiring (`assembleDurableZero`), dynamic tools registration, and full model E2E remain pending integration gates owned by other slices / parent.
