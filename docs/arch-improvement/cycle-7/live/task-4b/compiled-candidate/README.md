# Task 4B Capability Preservation Dispatcher: Frozen Compiled Candidate

**Date:** 2026-11-05  
**Role:** Independent Mechanical Builder (Hand-off to Black-Box Reviewer)  
**Frozen Source Commit:** `49bcad1486a5101e20e8b88a616cc175a34fc3e9`  
**Artifact File:** `component-driver.mjs`  
**SHA-256 Checksum:** `7d8fb526e3cfcc1cefe4cf44eab67634ab38dab052a33668d3d2dd9be084db46`  
**Build Manifest:** `build-manifest.json`  

---

## 1. Black-Box Reviewer Instructions

This component is an **internal capability dispatcher component candidate**, built from frozen commit `49bcad1486a5101e20e8b88a616cc175a34fc3e9`. It is **NOT** a public package export or the production CLI.

The black-box reviewer must evaluate this runnable artifact strictly via its external standard I/O JSON-RPC 2.0 interface without reading or editing implementation sources.

### Execution Command

From repository root:
```bash
node docs/arch-improvement/cycle-7/live/task-4b/compiled-candidate/component-driver.mjs
```

Or from this directory:
```bash
node component-driver.mjs
```

### Protocol & Lifecycle
- **Transport:** Standard JSON-RPC 2.0 wire protocol over `stdin` (one request per line).
- **Responses:** Standard JSON-RPC 2.0 responses emitted to `stdout` (one response per line).
- **Shutdown:** Clean bounded shutdown upon `SIGTERM` or `SIGINT` (closes JSON-RPC server and domain coordinator; exits with code 0).

---

## 2. Explicit Scope & Boundary Limitations

1. **Test-Only Engine Port Fixture:** The driver wires the authoritative `SessionCoordinator` to an in-memory `IAgentEngine` test fixture. This is **NOT** native model, Harness, or SQLite database acceptance.
2. **Fixture IDs:** Dynamic submission IDs are formatted as `fixture_sub_<N>`. They are explicitly test fixture IDs and must never be interpreted as native execution receipts.
3. **Token Usage Estimation:** The context usage returned by `session/getStats` reflects static test fixture estimates/placeholders, not verified live session metering.
4. **Task 1 Separation:** Task 1 / native CLI runtime acceptance remains strictly separate.

---

## 3. Supported Dispatcher Capabilities & Schema Samples

All requests must follow JSON-RPC 2.0: `{"jsonrpc": "2.0", "id": "<id>", "method": "<method>", "params": { ... }}`.

### 3.1 Prompt Submission & Steer

#### `session/prompt`
Submits a prompt to coordinator and underlying engine.
- String content:
  ```json
  {"jsonrpc": "2.0", "id": "1", "method": "session/prompt", "params": {"content": "Hello sovereign agent"}}
  ```
- Image / multi-part content:
  ```json
  {"jsonrpc": "2.0", "id": "2", "method": "session/prompt", "params": {"content": [{"type": "text", "text": "Inspect this"}, {"type": "image", "data": "aW1n", "mimeType": "image/png"}]}}
  ```
- Optional routing options: `conversationId` (string), `deliverAs` ("steer" | "followUp").
- Expected Result: `{"jsonrpc": "2.0", "id": "1", "result": {"status": "accepted", "id": "fixture_sub_1", "conversationId": "1"}}`

#### `session/steer`
Forces `deliverAs: "steer"`.
```json
{"jsonrpc": "2.0", "id": "3", "method": "session/steer", "params": {"content": "Stop immediately", "conversationId": "1"}}
```

#### `session/followUp`
Forces `deliverAs: "followUp"`.
```json
{"jsonrpc": "2.0", "id": "4", "method": "session/followUp", "params": {"content": "Next step in sequence"}}
```

### 3.2 Session Control & Maintenance

#### `session/abort`
Aborts active execution. Supports optional `conversationId` for child sessions.
```json
{"jsonrpc": "2.0", "id": "5", "method": "session/abort", "params": {}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "5", "result": {"ok": true}}`

#### `session/abortTask`
Aborts a specific task by positive integer `taskId`.
```json
{"jsonrpc": "2.0", "id": "6", "method": "session/abortTask", "params": {"taskId": 42}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "6", "result": {"ok": true}}`

#### `session/compact`
Triggers history compaction with optional instructions.
```json
{"jsonrpc": "2.0", "id": "7", "method": "session/compact", "params": {"instructions": "Keep tool outputs"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "7", "result": {"ok": true}}`

### 3.3 Subagent Policy Configuration

#### `subagent/setPolicy` (or `session/setSubagentPolicy`)
Accepts a strict `SubagentPolicyRecord` matching schema:
- Inherit mode:
  ```json
  {"jsonrpc": "2.0", "id": "8", "method": "subagent/setPolicy", "params": {"policyRecord": {"version": 1, "revision": 1, "policy": {"mode": "inherit"}}}}
  ```
- Configured mode:
  ```json
  {"jsonrpc": "2.0", "id": "9", "method": "subagent/setPolicy", "params": {"policyRecord": {"version": 1, "revision": 2, "policy": {"mode": "configured", "configuredProfile": {"model": {"provider": "anthropic", "modelId": "claude-3-5-sonnet"}, "thinkingLevel": "high"}}}}}
  ```
Expected Result: `{"jsonrpc": "2.0", "id": "8", "result": {"ok": true}}`

### 3.4 Model Management

#### `models/list`
Lists models available in the engine state.
```json
{"jsonrpc": "2.0", "id": "10", "method": "models/list", "params": {}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "10", "result": {"models": [{"provider": "fixture-provider", "modelId": "fixture-model-v1", "name": "Fixture Model V1", "contextWindow": 64000}]}}`

#### `models/set`
Selects provider and modelId.
```json
{"jsonrpc": "2.0", "id": "11", "method": "models/set", "params": {"provider": "fixture-provider", "modelId": "fixture-model-v1"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "11", "result": {"ok": true}}`

#### `models/setThinking`
Sets thinking level ("off", "minimal", "low", "medium", "high", "xhigh").
```json
{"jsonrpc": "2.0", "id": "12", "method": "models/setThinking", "params": {"level": "high"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "12", "result": {"ok": true}}`

### 3.5 State, Transcript & Stats Inspection

#### `session/getState`
Returns session state DTO (optional `conversationId`).
```json
{"jsonrpc": "2.0", "id": "13", "method": "session/getState", "params": {}}
```

#### `session/getTranscript`
Returns transcript entries (optional `conversationId`, optional integer `limit`).
```json
{"jsonrpc": "2.0", "id": "14", "method": "session/getTranscript", "params": {"limit": 10}}
```

#### `session/getStats`
Returns session stats DTO (contextUsage with tokens & contextWindow).
```json
{"jsonrpc": "2.0", "id": "15", "method": "session/getStats", "params": {}}
```

---

## 4. Unsupported Capabilities (Anti-Fake / Missing Seams)

In compliance with AP-076 (Anti-Hollow / Anti-Fake), the following capabilities lack SPI seams on `SessionCoordinator` / `IAgentEngine` and **MUST NOT** return fake success:
- `binding/register`
- `binding/list`
- `session/fork`
- `tools/register`

Sample probe:
```json
{"jsonrpc": "2.0", "id": "16", "method": "binding/register", "params": {"threadId": "thr_123", "conversationId": 1}}
```
Expected Response:
Returns a JSON-RPC error documenting the missing seam (e.g. `Capability 'binding/register' is unsupported by the current SessionCoordinator / IAgentEngine SPI. Missing seam: ...`). Result is `undefined` / omitted.

---

## 5. Diagnostic Fixture Observation API

For black-box test validation of actual underlying calls:

#### `fixture/getCalls`
Returns the array of calls received by the underlying `IAgentEngine` fixture.
```json
{"jsonrpc": "2.0", "id": "obs-1", "method": "fixture/getCalls", "params": {}}
```
Response:
```json
{"jsonrpc": "2.0", "id": "obs-1", "result": {"calls": [{"method": "start", "args": ["/tmp/fixture-session-dir"], "timestamp": 1793827290208}, ...]}}
```

#### `fixture/reset`
Clears recorded fixture calls and resets submission counters.
```json
{"jsonrpc": "2.0", "id": "obs-2", "method": "fixture/reset", "params": {}}
```
Response:
```json
{"jsonrpc": "2.0", "id": "obs-2", "result": {"ok": true}}
```

---

## 6. Architecture & Seam Finding (Revealed by Clean Composition)

The build mirrors real composition resolution:
- The consumer imports `StdioJsonRpcServer` and nominal error types via the public `@durable-zero/protocol` export.
- The consumer imports `createSessionDispatcher` from `packages/runner/src/dispatch/index.ts`.

### Finding: [P1] Relative Cross-Package Import Bypasses Public Export, Causing Constructor Identity Split (AP-010, AP-022, AP-025)
- **Evidence:** `packages/runner/src/dispatch/session-dispatcher.ts:9-12`:
  ```typescript
  import {
  	JsonRpcMethodNotFoundError,
  	JsonRpcInvalidParamsError,
  } from "../../../protocol/src/index.ts";
  ```
  while `StdioJsonRpcServer` and `RequestDispatcher` are resolved via public `@durable-zero/protocol`.
- **Impact:** When `session-dispatcher.ts` throws `new JsonRpcMethodNotFoundError` or `new JsonRpcInvalidParamsError`, `RequestDispatcher.processLine()` tests `err instanceof JsonRpcMethodNotFoundError` using the public package constructor. Because the instances originate from different module definitions, `instanceof` fails (`false`). The server degrades the error to code `-32603` (Internal Error) rather than `-32601` (Method Not Found) or `-32602` (Invalid Params).
- **Rule:** AP-010 (Modular Monolith Boundaries), AP-022 (Typed Errors), AP-025 (Import Discipline: no traversing package boundaries via relative paths).
- **Fix decision:** `log-only` for this builder worker (Worker is forbidden from altering production source). To be repaired in production source by restoring public package import `import { ... } from "@durable-zero/protocol"` in `session-dispatcher.ts`.
