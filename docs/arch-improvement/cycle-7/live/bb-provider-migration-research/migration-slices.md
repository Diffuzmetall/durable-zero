# Migration Slices: BB Pi Durable Provider → Latest Durable Zero

## Overview

This migration plan defines the concrete, source-verified steps required to upgrade `bb-plugin-provider-pi-durable` from its legacy bundled `durable-zero` (v0.8.1 / monolithic `core`) to the refactored, dependency-injected `durable-zero` on branch `cycle-7-runtime-adapter-ioc-migration` (production pin `7e12fa59`, test tail `513d3726`, docs HEAD `1a1a3ac0ac`).

Each slice is bounded, preserves architecture boundaries (AP-010 through AP-076), and avoids creating redundant exports or leaking database logic into pure contract packages.

---

## Slice 0: Source Seams & Asset Discovery Repair

**Goal:** Correct consumer import paths and asset discovery so that both repositories build and locate runner assets cleanly, without polluting pure contracts or relying on abandoned monolithic paths.

### Changes in `durable-zero`:
1. **Runner Packaging Verification:**
   - Verify `scripts/build.mjs:42-59` outputs `packages/runner/dist/main.js` (executable CLI) and `packages/runner/dist/index.js` (library entry).
   - Root `package.json:exports` already declares `"./runner"`, `"./adapter-pi-durable"`, and `"./contracts"`.
2. **Pure Contracts Invariant (AP-010, AP-026):**
   - `@durable-zero/contracts` MUST remain pure schemas, interfaces, and DTOs.
   - Do NOT add `forkSessionDatabase` or any SQLite/database implementation to `@durable-zero/contracts`.
   - `packages/adapter-pi-durable/src/index.ts:5` ALREADY exports `forkSessionDatabase` from `./session-fork.ts`.

### Changes in `bb-plugin-provider-pi-durable`:
1. **Update `src/host/thread-fork.ts:3`:**
   - Change import source:
     ```ts
     // Replace: import { forkSessionDatabase as coreForkSessionDatabase } from "durable-zero/core";
     // With:
     import { forkSessionDatabase as coreForkSessionDatabase } from "durable-zero/adapter-pi-durable";
     ```
2. **Update `scripts/copy-runner-assets.mjs`:**
   - Change candidate search path from obsolete `packages/core/dist/runner.js` to `packages/runner/dist/main.js` (and `dist/index.js`).
3. **Update `src/host/runner-lookup.ts:32-38`:**
   - Add candidate paths for `packages/runner/dist/main.js` and `packages/runner/dist/index.js` under `node_modules/durable-zero`.

### Verification Gate:
- `node scripts/copy-runner-assets.mjs` copies `packages/runner/dist/main.js` into `dist/runner/index.js`.
- Provider contract tests pass `forkSessionDatabase` import typecheck against `durable-zero/adapter-pi-durable`.

---

## Slice 1: Runner Composition Root & Dispatcher Mounting (durable-zero)

**Goal:** Mount the existing `createSessionDispatcher` in the runner composition root, wire an owned `HostBridge` instance for reverse host tool execution, and support standard JSON-RPC readiness probing without leaking global state.

### Changes in `durable-zero`:
1. **Mount `createSessionDispatcher` in `assembleDurableZero` (`packages/runner/src/composition.ts:144-178`):**
   - Replace the inline 6-method handler with `createSessionDispatcher({ coordinator, engine })`.
   - **Supported & Implemented Methods:**
     - `session/prompt` -> `coordinator.prompt(input, execOptions)`
     - `session/steer` -> `coordinator.prompt(input, { deliverAs: "steer" })`
     - `session/followUp` -> `coordinator.prompt(input, { deliverAs: "followUp" })`
     - `session/abort` -> `coordinator.abort(conversationId)`
     - `session/abortTask` -> `engine.abortTask(taskId)`
     - `session/compact` -> `engine.compact(instructions)`
     - `session/setSubagentPolicy` / `subagent/setPolicy` -> unwraps `policyRecord ?? record ?? params` and calls `coordinator.setSubagentPolicy()`
     - `models/list` -> `engine.getState().models`
     - `models/set` -> `engine.setModel({ provider, modelId })`
     - `models/setThinking` -> `engine.setThinkingLevel(level)`
     - `session/getState` -> `coordinator.getState(conversationId)`
     - `session/getTranscript` -> `coordinator.getTranscript(conversationId, limit)`
     - `session/getStats` -> `coordinator.getStats(conversationId)`
   - **Explicitly Typed Unsupported Seams (`UnsupportedCapabilityError`):**
     - `binding/register` (singular) & `binding/list` (singular): throw `UnsupportedCapabilityError` (IAgentEngine SPI lacks binding store).
     - `session/fork`: throws `UnsupportedCapabilityError` (ISessionStore.fork() not exposed on coordinator SPI).
     - `tools/register`: throws `UnsupportedCapabilityError` (dynamic runtime tool mutation not on coordinator SPI).
2. **Wire Owned `HostBridge` (AP-074, AP-076):**
   - Do NOT restore module-level global `activeToolForwarder` or `setHostToolForwarder`.
   - In `assembleDurableZero`, instantiate `HostBridge` (`packages/runner/src/host/host-bridge.ts:33-85`) with `server.request.bind(server)`.
   - Pass the owned `HostBridge` instance to runtime extensions/dependencies.
   - Dynamic tools loaded from `PI_BB_TOOLS_FILE` register execution handlers that call `hostBridge.forwardToolCall(toolName, args)`, sending JSON-RPC request `host/toolCall` over stdio.
3. **Readiness Contract (No Invented Mandatory Frame):**
   - The runner `StdioJsonRpcServer` is active and listening immediately upon process launch.
   - Provider uses standard public `session/getState` JSON-RPC request to confirm process readiness.
   - (Optional agreed enhancement): emit `{ jsonrpc: "2.0", method: "session/ready", params: { sessionDir } }` notification on startup if negotiated.
4. **Signal Handling & Process Teardown:**
   - In `packages/runner/src/main.ts:20-35`, ensure process exit handlers await `instance.close()`, allowing SQLite WAL checkpointing to complete before `process.exit(0)`.

### Verification Gate:
- Unit tests in `packages/runner/test/composition-root.test.ts` verifying all dispatcher methods dispatch or throw `UnsupportedCapabilityError`.
- Hermetic test asserting `server.request("host/toolCall")` resolves with structured `{ content, isError }` result.

---

## Slice 2: Provider Transport Migration to JSON-RPC 2.0 (bb-plugin-provider-pi-durable)

**Goal:** Refactor `RunnerRpcChannel`, `RunnerProcess`, and `PiThreadSession` to speak standard JSON-RPC 2.0 and handle bidirectional host requests over stdio.

### Changes in `bb-plugin-provider-pi-durable`:
1. **Refactor `RunnerRpcChannel`:**
   - Send requests formatted as `{ jsonrpc: "2.0", id: "req_1", method: "...", params: { ... } }`.
   - Match incoming responses by JSON-RPC `id` and resolve/reject on `result` or `error`.
   - Listen for inbound JSON-RPC requests from the runner:
     - `host/toolCall`: forward to `toolCallTracker.forwardToolCall()` and respond `{ jsonrpc: "2.0", id, result: { content, isError } }`.
     - `host/interaction`: forward to `interactionTracker.requestInteraction()` and respond `{ jsonrpc: "2.0", id, result }`.
   - Handle notifications:
     - `session/event`: unwrap `params.event` and forward to `DeltaTranslator` and `SessionSubagentHandler`.
2. **Readiness Handshake in `PiThreadSession.start()`:**
   - Replace blocking on legacy `{ type: "ready" }` frame.
   - Probe readiness via `session/getState` request upon process launch with a bounded timeout (e.g. 5000ms).
3. **Align Outbound Session Method Calls:**
   - `prompt()`: method `session/prompt`, params `{ content, options: { deliverAs: "followUp", conversationId } }`.
   - `steer()`: method `session/steer`, params `{ content, options: { deliverAs: "steer", conversationId } }`.
   - `compact()`: method `session/compact`, params `{ instructions }`.
   - `setModel()`: method `models/set`, params `{ provider, modelId }`.
   - `setThinkingLevel()`: method `models/setThinking`, params `{ level }`.
   - `getSessionStats()`: method `session/getStats`, params `{ conversationId }`.
   - `setSubagentPolicy()`: method `session/setSubagentPolicy`, params `{ policyRecord }`.
4. **Binding Store Realignment:**
   - Since `binding/register` throws `UnsupportedCapabilityError` in zero's dispatcher, retain provider's host-side binding tracking in `src/host/durable-binding-store.ts` without attempting runner RPC synchronization until an engine binding port is formally accepted.
5. **Event Consumption Verification:**
   - Ensure `DeltaTranslator` consumes real schema events: `message_update` (with `assistantMessageEvent.text_delta`, `assistantMessageEvent.thinking_delta`, `assistantMessageEvent.text_start`, `assistantMessageEvent.text_end`), `message_end` (with `message: assistantMessageSchema`), and tool execution events.

### Verification Gate:
- `npm test tests/runner-protocol.test.ts` passes against mocked JSON-RPC 2.0 runner.
- `npm test tests/host-tools-cleanup-and-stop.test.ts` passes reverse `host/toolCall` roundtrip.

---

## Slice 3: Boundary Purity & Storage Decoupling

**Goal:** Eliminate out-of-band disk writes across the BB boundary and clean up unused dependencies.

### Changes:
1. **Eliminate `control.jsonl` file writes in `server.ts`:**
   - Replace direct append to `control.jsonl` on disk with RPC invocation `session/abortTask` (`{ taskId }`).
2. **Decouple `session.owner.json` inspection:**
   - Rely on engine's own lock eviction (`session-lock-eviction.ts`) and `session/getState` RPC instead of raw disk inspection.
3. **Dependency Triage in Provider `package.json`:**
   - Plan removal of unreferenced dependencies: `@earendil-works/chord`, `@earendil-works/pi-codemode`, `@earendil-works/pi-schema`, `proper-lockfile`, `quickjs-wasi`.
   - Update `tests/package-integrity.test.ts` assertions accordingly.

### Verification Gate:
- `npm test tests/storage-sovereignty.test.ts` passes.
- `npm test tests/sovereign-rpc-and-db-leakage.test.ts` passes.

---

## Slice 4: Hermetic Acceptance & End-to-End Validation

**Goal:** Validate complete integrated operation under strict hermetic conditions (no live network, no external LLM API calls, no private original databases).

### Test Matrix:
1. **Cold Boot & Probe:** Runner process spawns; responds to `session/getState` readiness probe within bounded timeout.
2. **Prompt & Streaming:** Prompt with multi-part content admitted; streaming `message_update` events (`text_delta` with monotonic `contentIndex`) translated to BB thread deltas.
3. **Host Tool Continuation:** Model calls dynamic BB tool; runner sends `host/toolCall` request over stdio; host executes tool and returns JSON-RPC response; model completes turn with `message_end`.
4. **Task Abort:** Active task aborted via `session/abortTask`; engine cancels task and emits abort delta.
5. **Clean Shutdown:** SIGTERM sent; SQLite WAL checkpoint completes; process exits with code 0 within bounded timeout (≤ 2000ms).

Execution limits: unit tests ≤ 5s, suite execution ≤ 30s, outer end-to-end integration test ≤ 120s with guaranteed failure-safe cleanup.
