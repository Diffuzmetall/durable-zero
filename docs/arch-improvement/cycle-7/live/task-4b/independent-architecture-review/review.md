# Independent Architecture Review: Task 4B (Typed Capability Preservation Dispatcher)

**Review Date:** 2026-11-05  
**Reviewer Role:** Independent Source/Spec Architecture Reviewer  
**Frozen Candidate Commit:** `49bcad1486a5101e20e8b88a616cc175a34fc3e9`  
**Candidate Scope Paths:**
- `packages/runner/src/dispatch/{session-dispatcher.ts,types.ts,index.ts}`
- `packages/runner/test/capability-dispatch.test.ts`
- `packages/protocol/src/jsonrpc/errors.ts`
- `packages/protocol/src/transport/request-dispatcher.ts`
- `packages/protocol/test/protocol-conformance.test.ts`
- `docs/arch-improvement/cycle-7/live/task-4b/*`

---

## 1. Executive Summary & Scope

This independent architecture review evaluates the Task 4B implementation candidate (`49bcad1486a5101e20e8b88a616cc175a34fc3e9`) according to the `arch-rules` baseline (AP-010 through AP-076), `arch-improvement-review`, and `arch-rules-implementation-review` protocols.

### Scope Boundaries
- **Task 4B Component Scope:** Typed capability dispatcher factory `createSessionDispatcher({ coordinator, engine })` returning a `MethodHandler`, nominal protocol error classes (`JsonRpcMethodNotFoundError`, `JsonRpcInvalidParamsError`), request dispatcher error mapping, and capability tests.
- **Excluded from Scope:** Native CLI / Task 1 walking skeleton integration, HostBridge reverse RPC execution (Task 2A/2), and whole Task 4 admin seams (`binding/register`, `binding/list`, `session/fork`, `tools/register`) which lack underlying SPI ports in Core/Engine.

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability (AP-074, AP-076)
- **Coordinator Calls:**
  * `coordinator.prompt(input, execOptions)`: invoked in `session/prompt` (line 143), `session/steer` (line 149), `session/followUp` (line 155).
  * `coordinator.abort(conversationId)`: invoked in `session/abort` (line 167).
  * `coordinator.setSubagentPolicy(parsed.data)`: invoked in `subagent/setPolicy` / `session/setSubagentPolicy` (line 197).
  * `coordinator.getState(conversationId)`: invoked in `session/getState` (line 239).
  * `coordinator.getTranscript(conversationId, limit)`: invoked in `session/getTranscript` (line 255).
  * `coordinator.getStats(conversationId)`: invoked in `session/getStats` (line 271).
- **Engine Calls:**
  * `engine.abortTask(taskId)`: invoked in `session/abortTask` (line 176).
  * `engine.compact(instructions)`: invoked in `session/compact` (line 187).
  * `engine.getState()`: invoked in `models/list` (line 202).
  * `engine.setModel(...)`: invoked in `models/set` (line 217).
  * `engine.setThinkingLevel(...)`: invoked in `models/setThinking` (line 229).
- **Evaluation:** **PASS**. Zero decorative dependencies. Every accepted port method is actively called in real execution paths.

### Probe 2: Runtime Completeness & Split-Brain Detection (AP-010, AP-025)
- **Evaluation:** **FAIL (P1)**.
  While no competing dispatcher was introduced in `packages/runner/src/dispatch/`, `packages/runner/src/dispatch/session-dispatcher.ts` imports types and classes across package boundaries using source-relative paths (`../../../core/src/index.ts` and `../../../protocol/src/index.ts`) instead of workspace package specifiers (`@durable-zero/core` and `@durable-zero/protocol`).
  In Node.js ESM runtime, importing from `../../../protocol/src/index.ts` produces a separate module instance from `@durable-zero/protocol/dist/index.js`, breaking nominal `instanceof` checks.

### Probe 3: Entry Point Wiring (AP-020, AP-075)
- **Evaluation:** **FAIL (P1)**.
  The factory `createSessionDispatcher` is defined in `packages/runner/src/dispatch/session-dispatcher.ts` and re-exported in `packages/runner/src/dispatch/index.ts`, but it is **not exported** from the public package entrypoint `packages/runner/src/index.ts`, nor is a `./dispatch` subpath declared in `packages/runner/package.json`. Sibling packages and external composition roots cannot import `createSessionDispatcher` via package exports.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Evaluation:** **PASS with P3 Observation**.
  * File length: `packages/runner/src/dispatch/session-dispatcher.ts` is 300 LOC (exceeds 250 LOC baseline; classified as P3 maintainability smell, does not block functionality).
  * Anti-Hollow: Unsupported capabilities (`binding/*`, `session/fork`, `tools/register`) explicitly throw `UnsupportedCapabilityError`, refusing to synthesize fake `{ ok: true }` receipts.

---

## 3. Findings

- [P1] Cross-package source-relative imports break nominal error identity and map to -32603 in compiled distribution
  - Evidence: `packages/runner/src/dispatch/session-dispatcher.ts:11-12` imports `JsonRpcMethodNotFoundError` and `JsonRpcInvalidParamsError` from `"../../../protocol/src/index.ts"` instead of package export `@durable-zero/protocol`. When executed against compiled `@durable-zero/protocol` transport, `err instanceof JsonRpcInvalidParamsError` evaluates to `false` due to dual module instances in Node ESM. Executable counterexample in `probe-nominal-identity.mjs` proved that `session/prompt` with invalid content returns `-32603` instead of `-32602`, and unmapped method returns `-32603` instead of `-32601`.
  - Impact: Severe public protocol contract regression in production runtime and compiled bundles; all dispatcher validation errors and method-not-found errors are misclassified over the wire as internal errors (`-32603`).
  - Rule: AP-010, AP-022, AP-025, AP-026.
  - Fix decision: fix-now (replace source-relative imports with workspace package specifiers `@durable-zero/core` and `@durable-zero/protocol`).

- [P1] createSessionDispatcher factory is omitted from @durable-zero/runner public package export entrypoint
  - Evidence: `packages/runner/src/index.ts` exports only `cli-args`, `composition`, and `main`; it does not export `./dispatch/index.ts`. Furthermore, `packages/runner/package.json` does not declare a `./dispatch` subpath in its `exports` field. Attempting `import { createSessionDispatcher } from "@durable-zero/runner"` fails with `SyntaxError: The requested module '@durable-zero/runner' does not provide an export named 'createSessionDispatcher'`. Verified by `probe-nominal-identity.mjs`.
  - Impact: Sibling packages and composition root cannot consume `createSessionDispatcher` via standard package imports, breaking package encapsulation and blocking clean integration into `composition.ts`.
  - Rule: AP-010, AP-020, AP-026.
  - Fix decision: fix-now (export `./dispatch/index.ts` from `packages/runner/src/index.ts`).

- [P2] Test suite count discrepancy in author report (claimed 61 tests, actual test runner executed 57 tests)
  - Evidence: Author report claimed 27 protocol conformance tests, 34 capability dispatch tests, and 61 combined tests (repeated in `report.json`). However, `packages/protocol/test/protocol-conformance.test.ts` contains exactly 23 test cases (5 in Defect 1, 6 in Defect 2, 9 in Defect 3, 3 in Defect 4). Running both test files via `node --test packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-dispatch.test.ts` outputs `tests 57, pass 57`, matching `junit.xml` (`tests 57`).
  - Impact: Inaccurate test inventory metrics undermine audit receipts and verification integrity.
  - Rule: AP-028, AP-076.
  - Fix decision: fix-now (correct test inventory metrics to 23 protocol + 34 capability = 57 tests).

- [P2] Dispatcher RED artifact capability-dispatch-red.log is an unlabeled truncated excerpt with manual headers
  - Evidence: `docs/arch-improvement/cycle-7/live/task-4b/capability-dispatch-red.log` has manually prepended comment headers and is 7,554 bytes, truncating abruptly after the 4th failure instead of the full ~32,611 byte output for all 34 assertion failures. It lacks an explicit label designating it as an excerpt. While BB command receipt at seq328 confirms a genuine behavioral RED occurred, the saved log is incomplete without an excerpt disclaimer.
  - Impact: Incomplete RED log creates ambiguity for independent auditors regarding whether execution completed or terminated prematurely.
  - Rule: AP-028, AP-076.
  - Fix decision: fix-now (archive full command output or explicitly label the artifact as a bounded excerpt with verified seq328 provenance).

- [P3] File line budget exceeded in packages/runner/src/dispatch/session-dispatcher.ts (300 LOC > 250 LOC Baseline)
  - Evidence: `packages/runner/src/dispatch/session-dispatcher.ts` contains 300 lines of code, exceeding the AP-019 baseline of 250 LOC.
  - Impact: Maintainability smell; mixes prompt extraction helpers with method routing switch.
  - Rule: AP-019.
  - Fix decision: log-only (acceptable for an unfragmentable async capability switch in the current cycle; schedule extraction of input/options normalization helpers in next cleanup).

- [P3] Numeric conversationId rejected with JsonRpcInvalidParamsError, narrowing contracts schema
  - Evidence: `session-dispatcher.ts:83` strictly enforces `typeof params.conversationId === "string"`, rejecting numeric values like `{ conversationId: 1 }` with code `-32602`. In contrast, `conversationIdSchema` in `@durable-zero/contracts/src/wire-context.ts:3` defines `z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])`.
  - Impact: Clients or tests passing numeric conversation IDs (native representation in `@earendil-works/pi-durable`) receive `-32602 Invalid params` rather than being coerced to string `"1"`.
  - Rule: AP-026.
  - Fix decision: log-only (can be normalized via `String(id)` in next cycle or left as strict string policy if documented).

---

## 4. Capability Dispatch & Contract Verification

### A. Input Normalization & Prompt Execution
- **Images-Only Support:** Validated. Arrays containing only `{ type: "image", data: string, mimeType: string }` are accepted without requiring dummy text strings, conforming to canonical plan requirements.
- **Mixed Content:** Supported. Arrays with both `{ type: "text", text: string }` and `{ type: "image", ... }` are validated and passed as `PromptContentPart[]`.
- **Legacy Shape Normalization:** `{ message?: string, images?: ImageContent[] }` is correctly normalized into a string or content parts array.
- **Steer & FollowUp Routing:**
  * `session/steer` forces `deliverAs: "steer"`.
  * `session/followUp` forces `deliverAs: "followUp"`.
  * `session/prompt` accepts `deliverAs` or legacy `streamingBehavior`, defaulting to `"followUp"`.
- **Root vs Child Targeting:**
  * `session/abort` without `conversationId` aborts root; with `conversationId` forwards to child.
  * `session/getState`, `session/getTranscript`, `session/getStats` correctly forward optional child `conversationId`.

### B. Anti-Fake Policy on Unsupported Capabilities
- `binding/register`, `binding/list`, `session/fork`, `tools/register`:
  All four throw `UnsupportedCapabilityError` with an explicit description of the missing Core/Engine SPI seam.
  In protocol transport, these map to `-32603` (Internal error) containing the missing seam explanation.
  **Critical Architectural Boundary:** Throwing an explicit error satisfies anti-fake requirements (AP-076), but does **NOT** constitute full Task 4 completion. The administrative and binding seams remain open architecture items.

### C. Context Usage Metrics Verification
- `session/getStats` delegates to `coordinator.getStats(conversationId)`, which returns `contextUsage: { tokens, contextWindow }`.
- In accordance with review rules, this is certified as an **estimated/placeholder metric**, NOT a verified real-time measurement.

---

## 5. Architecture Verification

- **Passed Rules:**
  * **AP-011 (Low Coupling, High Cohesion):** Handler isolates wire protocol adaptation from domain logic.
  * **AP-012 (Fail-Fast):** Invalid parameters and types fail immediately with explicit errors.
  * **AP-014 (SOLID & Clean Code):** Discrete responsibility for dispatch logic.
  * **AP-016 (Security Boundaries):** Clean extraction guards against prototype tampering.
  * **AP-018 (Clarity):** Explicit method handlers and typed options.
  * **AP-021 (Thin Entry Points):** Dispatcher executes zero inline domain business logic; delegates entirely to coordinator/engine.
  * **AP-023 (Async Discipline):** All async method handlers are properly awaited.
  * **AP-072 (Domain Specifications vs Switch):** Real domain DTOs used for responses.
  * **AP-074 (Explicit DI):** `coordinator` and `engine` injected via `SessionDispatcherOptions`; no hidden globals or singletons.
  * **AP-076 (Implementation Completeness & Anti-Hollow):** Real dependency method invocations verified across all 13 supported capabilities; zero dummy receipt fabrication.
- **Failed Rules:**
  * **AP-010 (Modular Monolith & Package Boundaries):** Violated by source-relative imports across packages (`../../../core/src/index.ts` and `../../../protocol/src/index.ts`) and missing public export from `@durable-zero/runner`.
  * **AP-022 (Typed Errors):** Violated in compiled distribution because split module instances cause `instanceof` to fail, turning typed protocol errors into `-32603`.
  * **AP-025 (Import Discipline):** Violated by cross-package file-relative path imports.
  * **AP-026 (API Contracts & DTO Boundaries):** Violated by protocol error code misclassification (`-32603` instead of `-32602`/`-32601`) over compiled transport.
  * **AP-028 (Testing Strategy & Receipt Integrity):** Violated by test count discrepancy (61 claimed vs 57 actual) and unlabeled truncated RED log.
- **Residual Risk:**
  * Package export and import repairs must be validated across built distribution before entrypoint wiring into `composition.ts`.
  * Full Task 4 binding and fork capabilities require subsequent SPI design.

---

## 6. Final Verdict

**VERDICT: FAIL**

The candidate implementation demonstrates excellent behavioral coverage and genuine dependency calls in local source-only tests. However, acceptance is blocked by two **P1** defects (cross-package relative imports causing dual-instance `instanceof` failure over compiled transport, and missing public package export in `@durable-zero/runner`) and two **P2** defects (test count inventory discrepancy and unlabeled truncated RED log).

**Required Bounded Remediation:**
1. Replace `../../../core/src/index.ts` and `../../../protocol/src/index.ts` in `session-dispatcher.ts` and `capability-dispatch.test.ts` with package specifiers `@durable-zero/core` and `@durable-zero/protocol`.
2. Add `export * from "./dispatch/index.ts";` to `packages/runner/src/index.ts`.
3. Correct test count assertions in `report.md` and `report.json` to 23 protocol + 34 capability = 57 tests.
4. Archive the complete RED test output or explicitly label `capability-dispatch-red.log` as a bounded excerpt with verified seq328 provenance.
