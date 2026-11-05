# Migration Slices: BB Pi Durable Provider → Latest Durable Zero

## Overview

This migration plan defines the concrete, source-verified steps required to upgrade `bb-plugin-provider-pi-durable` from its legacy bundled `durable-zero` (v0.8.1 / monolithic `core`) to the refactored, dependency-injected `durable-zero` on branch `cycle-7-runtime-adapter-ioc-migration` (HEAD `1a1a3ac0ac14da6ebccf87aab58ac7c82aad6466`).

Each slice is bounded, independently testable, specifies explicit file ownership, and adheres to the architecture invariants of AP-010 through AP-076.

---

## Slice 0: Source Seams & Asset Discovery Repair

**Goal:** Repair broken public exports and asset discovery paths so that both projects can build, link, and locate runner assets without relying on legacy monolithic paths.

### Changes in `durable-zero`:
1. **Export `forkSessionDatabase` from `@durable-zero/contracts` or `@durable-zero/adapter-pi-durable`:**
   - Ensure `session-fork.ts` is re-exported from canonical public index (`packages/contracts/src/index.ts` or `packages/adapter-pi-durable/src/index.ts`).
   - Fix exports map in root `package.json`.
2. **Export `HostBridge` and `forwardHostToolCall`:**
   - Re-export `HostBridge` from `packages/runner/src/index.ts`.
   - Re-export `forwardHostToolCall` and `setHostToolForwarder` from `packages/adapter-pi-durable/src/index.ts` (or deprecate in favor of direct `HostBridge` injection).
3. **Verify Runner Packaging:**
   - Verify `scripts/build.mjs` produces `packages/runner/dist/main.js` (executable CLI) and `packages/runner/dist/index.js` (library entry).

### Changes in `bb-plugin-provider-pi-durable`:
1. **Update `scripts/copy-runner-assets.mjs`:**
   - Update asset copy search paths from `packages/core/dist/runner.js` to `packages/runner/dist/main.js` (and `dist/runner/index.js`).
2. **Update `src/host/runner-lookup.ts`:**
   - Add candidate paths for `packages/runner/dist/main.js` and `packages/runner/dist/index.js` under `node_modules/durable-zero`.
3. **Update Imports in Provider:**
   - In `src/host/thread-fork.ts`: change `import { forkSessionDatabase } from "durable-zero/core"` to import from `"durable-zero/adapter-pi-durable"` (or `"durable-zero/contracts"`).
   - In `src/extension/bb-tools-extension.ts`: update import for `forwardHostToolCall`.

### Verification Gate:
- `npm run build` in `durable-zero` passes and populates `packages/runner/dist/main.js`.
- `node scripts/copy-runner-assets.mjs` in provider successfully copies `packages/runner/dist/main.js` into `dist/runner/index.js`.
- Contract test verifying runner discovery resolves the new runner asset path.

---

## Slice 1: Protocol Alignment & Dispatcher Mounting (durable-zero)

**Goal:** Eliminate the zombie architecture in `packages/runner/src/composition.ts` by mounting the full `createSessionDispatcher`, emitting a cold-boot readiness notification, and wiring `HostBridge` for reverse tool calling.

### Changes in `durable-zero`:
1. **Mount `createSessionDispatcher` in `assembleDurableZero`:**
   - Replace the inline 6-method handler in `packages/runner/src/composition.ts:70-98` with `createSessionDispatcher({ coordinator, engine })`.
   - Ensure methods `session/steer`, `session/followUp`, `session/abort`, `session/abortTask`, `session/compact`, `session/setSubagentPolicy`, `models/list`, `models/set`, `models/setThinking`, `session/getState`, `session/getTranscript`, `session/getStats`, `bindings/register`, `bindings/list`, and `session/fork` are all active.
2. **Emit Cold-Boot Readiness Notification:**
   - Once `coordinator.start()` completes and `server.start()` begins listening, emit:
     ```json
     { "jsonrpc": "2.0", "method": "session/ready", "params": { "sessionDir": sessionDir } }
     ```
     This provides a deterministic, non-polling readiness signal to the host.
3. **Wire Bidirectional `HostBridge`:**
   - Instantiate `HostBridge` in `assembleDurableZero` using `server.request.bind(server)`.
   - Wire `HostBridge` to `PiDurableEngine` and extension loader so host tool executions send `host/toolCall` requests back over stdio.
4. **Graceful Shutdown & Signal Handling:**
   - In `packages/runner/src/main.ts`, ensure `cleanup()` awaits `instance.close()`, flushes SQLite WAL, and allows pending requests to resolve before calling `process.exit(0)`.

### Verification Gate:
- Extend `packages/runner/test/e2e-walking-skeleton.test.ts` to assert `session/ready` notification on process start.
- Unit test in `packages/runner/test/composition.test.ts` verifying all dispatcher methods resolve or throw valid typed errors.
- Reverse RPC test verifying `server.request("host/toolCall")` resolves with valid response.

---

## Slice 2: Provider Transport Migration to JSON-RPC 2.0 (bb-plugin-provider-pi-durable)

**Goal:** Refactor the BB provider's host runner communication layer (`RunnerRpcChannel`, `RunnerProcess`, `PiThreadSession`) to speak standard JSON-RPC 2.0.

### Changes in `bb-plugin-provider-pi-durable`:
1. **Refactor `RunnerRpcChannel`:**
   - Format outbound requests as:
     ```json
     { "jsonrpc": "2.0", "id": "req_1", "method": "session/prompt", "params": { ... } }
     ```
   - Match incoming responses using standard JSON-RPC 2.0 response format (`id`, `result`, `error`).
   - Listen for inbound JSON-RPC requests from the runner:
     - `host/toolCall`: invoke `context.toolCallTracker.forwardToolCall()` and send back JSON-RPC response `{ jsonrpc: "2.0", id, result: { content, isError } }`.
     - `host/interaction`: invoke `context.interactionTracker.requestInteraction()` and send back JSON-RPC response `{ jsonrpc: "2.0", id, result }`.
   - Handle inbound notifications:
     - `session/ready`: resolve `readyPromise`.
     - `session/event`: unwrap `params.event` and pass to `DeltaTranslator` and `SessionSubagentHandler`.
2. **Update `PiThreadSession` Method Calls:**
   - `prompt()`: call method `session/prompt` with `{ content, options: { deliverAs: "followUp", conversationId } }`.
   - `steer()`: call method `session/steer` with `{ content, options: { deliverAs: "steer", conversationId } }`.
   - `compact()`: call method `session/compact` with `{ instructions }`.
   - `setModel()`: call method `models/set` with `{ provider, modelId }`.
   - `setThinkingLevel()`: call method `models/setThinking` with `{ level }`.
   - `getSessionStats()`: call method `session/getStats`.
   - `setSubagentPolicy()`: call method `session/setSubagentPolicy` with `{ policyRecord }`.
   - `start()`: wait for `session/ready` notification.
3. **Update CLI Invocation Flags in `buildRunnerArgs`:**
   - Ensure arguments match `durable-zero/packages/contracts/src/cli-args.ts` (`--session`, `--cwd`, `--provider`, `--model`, `--thinking`, `--extension`, `--skills`, `--no-global-extensions`).

### Verification Gate:
- `npm test tests/runner-protocol.test.ts` passes with mocked JSON-RPC 2.0 server.
- `npm test tests/prompt-request.test.ts` passes.
- `npm test tests/contracts-bb-tools.test.ts` passes with reverse `host/toolCall` roundtrip.

---

## Slice 3: Boundary Purity & Storage Decoupling

**Goal:** Eliminate out-of-band disk leaks across the BB boundary, separate host state from engine state, and clean up dead dependencies.

### Changes:
1. **Eliminate `control.jsonl` file writes in `server.ts`:**
   - In `server.ts:task_abort`, instead of directly appending to `control.jsonl` on disk, call `session/abortTask` via the running session's RPC channel or dedicated daemon socket.
2. **Decouple `session.owner.json` inspection:**
   - Rely on engine's own lock eviction (`session-lock-eviction.ts`) and session state RPC rather than having host code read raw JSON files from the session directory.
3. **Dependency Cleanup in `package.json`:**
   - Triage `@earendil-works/chord`, `@earendil-works/pi-codemode`, `@earendil-works/pi-schema`, `proper-lockfile`, and `quickjs-wasi`.
   - Update `tests/package-integrity.test.ts` to reflect the clean decoupled dependency graph.

### Verification Gate:
- `npm test tests/storage-sovereignty.test.ts` passes.
- `npm test tests/sovereign-rpc-and-db-leakage.test.ts` passes.
- `npm test tests/package-integrity.test.ts` passes.

---

## Slice 4: Hermetic Acceptance & End-to-End Verification

**Goal:** Validate complete integrated operation with a hermetic test suite (no network, no live LLM, no external databases).

### Verification Journey:
1. **Cold Boot & Readiness:** Runner process spawns and emits `session/ready` within 500ms.
2. **Prompt & Streaming:** Prompt with text and images admitted; events (`message_start`, `message_delta`, `turn_complete`) translated to BB thread deltas.
3. **Host Tool Execution:** LLM issues tool call for dynamic BB tool; runner issues `host/toolCall`; provider executes tracker and returns result; LLM receives result and finishes turn.
4. **Subagent Delegation:** Subagent spawned; policy verified; events mirrored to parent session and discrete child thread.
5. **Abort & Interruption:** Long-running turn aborted cleanly; `session/aborted` emitted; process remains healthy for subsequent prompt.
6. **Clean Shutdown:** SIGTERM sent; SQLite checkpointed; process exits code 0 within 2000ms.

Execution bounds: Commands ≤ 60s, test suites ≤ 30s, outer end-to-end integration test ≤ 120s with failure-safe teardown.
