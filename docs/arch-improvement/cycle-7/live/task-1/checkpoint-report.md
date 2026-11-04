# Cycle 7 Task 1 / Slice 0 Checkpoint Report

- **Date**: 2026-11-04
- **Branch**: `cycle-7-runtime-adapter-ioc-migration`
- **State**: Bounded Milestone Checkpoint (Source writes quiescent)

---

## 1. Exact Current E2E Stage Reached

The black-box compiled CLI process (`packages/cli/bin/durable-zero.js serve`) boots, initializes the sovereign core + relocated adapter runtime, loads the public scripted provider extension (`scripted-e2e` / `echo`), and successfully processes inbound JSON-RPC 2.0 requests:

1. **Client Request**:
   `{"jsonrpc":"2.0","id":1,"method":"session/prompt","params":{"content":"Echo: hello world"}}`
2. **Engine Admission (SUCCESS)**:
   `{"jsonrpc":"2.0","id":1,"result":{"status":"accepted","id":"9","conversationId":"1"}}`
3. **Model Execution**:
   The native Pi Durable 1.5 Harness successfully calls our scripted model provider's `streamSimple` / `stream` methods with the admitted user prompt.
4. **Native Submission Settlement (SUCCESS)**:
   `Submission.wait()` resolves with `status: "done"`.
5. **Terminal Notification Emitted (SUCCESS)**:
   `{"jsonrpc":"2.0","method":"session/event","params":{"event":{"type":"turn_complete","status":"completed","requestId":"9","conversationId":1}}}`
6. **Runtime Graph Snapshot Emitted (SUCCESS)**:
   `{"jsonrpc":"2.0","method":"session/event","params":{"event":{"type":"runtime_graph_snapshot", ...}}}`

---

## 2. Last Actual Failure / Stdout / Stderr

- **Stdout observed**:
  ```json
  [CHILD STDOUT] {"jsonrpc":"2.0","id":1,"result":{"status":"accepted","id":"9","conversationId":"1"}}
  [CHILD STDOUT] {"jsonrpc":"2.0","method":"session/event","params":{"event":{"type":"turn_complete","status":"completed","requestId":"9","conversationId":1}}}
  [CHILD STDOUT] {"jsonrpc":"2.0","method":"session/event","params":{"event":{"type":"runtime_graph_snapshot","snapshot":{"version":1,"scope":{"rootConversationId":1},"observation":{"epoch":"epoch_1793824645438_o9q16","revision":1,"observedAt":1793824645704,"completeness":"complete"},"nodes":{},"conversations":{"1":{"id":1}},"receipts":[],"stats":{"liveCount":0,"terminalCount":0,"totalCount":0}}}}}
  ```
- **Stderr observed**: Clean (zero stderr).
- **Test Assertion Failure**:
  Test step 3 timed out waiting for `message_update` containing `text_delta` before step 4's `turn_complete`.

---

## 3. Source-backed Root-Cause Hypothesis

- In `packages/adapter-pi-durable/src/engine/bridge/watch-events-compat.ts`:
  The watch callback on `conversation.watch()` monitors `val.docs["pi.live"].tools`, `nestedTools`, and committed `entries`, but does not project live `generation` message chunks from `val.docs["pi.live"].generation` (or stream chunks directly from the generation task) into `message_update` events for `DurableEventAdapter`.
- As a result, the full generation runs and commits to SQLite, `Submission.wait()` settles, and `turn_complete` fires, but intermediate streaming text deltas are not bridged to the JSON-RPC event notification stream.

---

## 4. Next Single Fix / Probe

- Update `watch-events-compat.ts` (or `pi-durable-engine.ts` event stream bridge) to extract `val.docs["pi.live"]?.generation?.message?.content` text updates (or delta tracking between consecutive watch values) and emit `{ type: "message_update", usage: ..., changes: [{ type: "text_delta", contentIndex: 0, delta: textDelta }] }` into `DurableEventAdapter`.
- Run single bounded test check: `node --test packages/runner/test/e2e-walking-skeleton.test.ts` (bounded with 15s OS timeout) to verify step 3 succeeds and moves immediately to transcript readback.

---

## 5. What Remains Unproven

- E2E Step 5: `session/getTranscript` readback of user & assistant entries directly from native SQLite.
- E2E Step 6: Clean zero-code exit on `SIGTERM` within 5 seconds.
- E2E Step 7-9: Process restart with SAME `--session` path:
  - `session/getState` confirming `entryCount >= 2` read from persisted SQLite.
  - `session/getTranscript` confirming identical entry IDs and exact user/assistant text match.
- E2E Step 10: Second prompt (`Second turn`) completing with `entryCount >= 4`.

---

## 6. Checkpoint & Quiescence Notice

- All file edits are stopped and quiescent.
- Ready for parent to commit/push the current milestone commit.
