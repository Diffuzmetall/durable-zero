# Task 4B Capability Preservation Dispatcher: Frozen Compiled Candidate (Fix Round 1)

**Date:** 2026-11-05  
**Role:** Independent Mechanical Builder (Hand-off to Black-Box Reviewer)  
**Frozen Source Commit:** `ea21bf5a645d148c0767716b099d387bb0bce822`  
**Artifact File:** `component-driver.mjs`  
**SHA-256 Checksum:** `ce718a070112c626bd03e568c634adce90e2ca2d303006885c63df93875b8e76`  
**Build Manifest:** `build-manifest.json`  
**Immutable Prior Candidate:** `../compiled-candidate/component-driver.mjs` (`SHA-256: 7d8fb526e3cfcc1cefe4cf44eab67634ab38dab052a33668d3d2dd9be084db46`)

---

## 1. Black-Box Reviewer Instructions

This component is an **internal capability dispatcher component candidate (Fix Round 1)**, built from frozen commit `ea21bf5a645d148c0767716b099d387bb0bce822`. It is **NOT** a public package export or the production CLI.

The black-box reviewer evaluates this runnable artifact strictly via its external standard I/O JSON-RPC 2.0 interface without reading or editing implementation sources.

### Execution Command

From repository root:
```bash
node docs/arch-improvement/cycle-7/live/task-4b/compiled-fix-round-1/component-driver.mjs
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

## 3. Canonical Conversation Identifier Rules

In accordance with `@durable-zero/contracts` specification:
- **Valid Format:** Accepts positive integers (e.g. `42`) or non-zero digit strings (e.g. `"42"`).
- **Normalization:** Valid numeric identifiers are strictly normalized to digit strings (e.g. `42` -> `"42"`).
- **Root Default:** When omitted or undefined, session methods operate on canonical root conversation (`"1"`).
- **Rejection:** Invented non-digit strings (e.g. `"c-target"`, `"conv_42"`, negative numbers, zero, or booleans) are strictly rejected with standard JSON-RPC `-32602` (`Invalid params`).

---

## 4. Standard Error Codes Specification

- **`-32601` (`Method not found`):** Thrown when calling unmapped methods. Returns message `Method not found: <method>`.
- **`-32602` (`Invalid params`):** Thrown on schema / parameter validation failures (e.g. empty prompt, invalid conversationId format, malformed policy record, non-positive integer `taskId`, invalid thinking level, non-integer or negative `limit`).
- **`-32603` (`Internal error`):** Thrown for unhandled errors, generic error objects without nominal prototype identity, and unsupported capabilities documenting missing seams.

---

## 5. Supported Dispatcher Capabilities & Schema Samples

All requests must follow JSON-RPC 2.0: `{"jsonrpc": "2.0", "id": "<id>", "method": "<method>", "params": { ... }}`.

### 5.1 Prompt Submission & Steer

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
- Optional routing options: `conversationId` (e.g. `42` or `"42"`), `deliverAs` ("steer" | "followUp").
- Child conversation prompt sample:
  ```json
  {"jsonrpc": "2.0", "id": "3", "method": "session/prompt", "params": {"content": "Child execution step", "conversationId": 42, "deliverAs": "steer"}}
  ```
- Expected Result: `{"jsonrpc": "2.0", "id": "3", "result": {"status": "accepted", "id": "fixture_sub_2", "conversationId": "42"}}`

#### `session/steer`
Forces `deliverAs: "steer"`.
```json
{"jsonrpc": "2.0", "id": "4", "method": "session/steer", "params": {"content": "Stop immediately", "conversationId": 42}}
```

#### `session/followUp`
Forces `deliverAs: "followUp"`.
```json
{"jsonrpc": "2.0", "id": "5", "method": "session/followUp", "params": {"content": "Next step in sequence"}}
```

### 5.2 Session Control & Maintenance

#### `session/abort`
Aborts active execution. Supports optional `conversationId` (`42` or `"42"`) for child sessions.
```json
{"jsonrpc": "2.0", "id": "6", "method": "session/abort", "params": {"conversationId": 42}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "6", "result": {"ok": true}}`

#### `session/abortTask`
Aborts a specific task by positive integer `taskId`.
```json
{"jsonrpc": "2.0", "id": "7", "method": "session/abortTask", "params": {"taskId": 42}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "7", "result": {"ok": true}}`

#### `session/compact`
Triggers history compaction with optional instructions string.
```json
{"jsonrpc": "2.0", "id": "8", "method": "session/compact", "params": {"instructions": "Keep tool outputs"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "8", "result": {"ok": true}}`

### 5.3 Subagent Policy Configuration

#### `subagent/setPolicy` (or `session/setSubagentPolicy`)
Accepts a strict `SubagentPolicyRecord` matching schema:
- Inherit mode:
  ```json
  {"jsonrpc": "2.0", "id": "9", "method": "subagent/setPolicy", "params": {"policyRecord": {"version": 1, "revision": 1, "policy": {"mode": "inherit"}}}}
  ```
- Configured mode:
  ```json
  {"jsonrpc": "2.0", "id": "10", "method": "subagent/setPolicy", "params": {"policyRecord": {"version": 1, "revision": 2, "policy": {"mode": "configured", "configuredProfile": {"model": {"provider": "anthropic", "modelId": "claude-3-5-sonnet"}, "thinkingLevel": "high"}}}}}
  ```
Expected Result: `{"jsonrpc": "2.0", "id": "9", "result": {"ok": true}}`

### 5.4 Model Management

#### `models/list`
Lists models available in the engine state.
```json
{"jsonrpc": "2.0", "id": "11", "method": "models/list", "params": {}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "11", "result": {"models": [{"provider": "fixture-provider", "modelId": "fixture-model-v1", "name": "Fixture Model V1", "contextWindow": 64000}]}}`

#### `models/set`
Selects provider and modelId.
```json
{"jsonrpc": "2.0", "id": "12", "method": "models/set", "params": {"provider": "fixture-provider", "modelId": "fixture-model-v1"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "12", "result": {"ok": true}}`

#### `models/setThinking`
Sets thinking level ("off", "minimal", "low", "medium", "high", "xhigh").
```json
{"jsonrpc": "2.0", "id": "13", "method": "models/setThinking", "params": {"level": "high"}}
```
Expected Result: `{"jsonrpc": "2.0", "id": "13", "result": {"ok": true}}`

### 5.5 State, Transcript & Stats Inspection

#### `session/getState`
Returns session state DTO (supports optional `conversationId: 42`).
```json
{"jsonrpc": "2.0", "id": "14", "method": "session/getState", "params": {"conversationId": 42}}
```

#### `session/getTranscript`
Returns transcript entries (supports optional `conversationId: 42`, optional positive integer `limit`).
```json
{"jsonrpc": "2.0", "id": "15", "method": "session/getTranscript", "params": {"conversationId": 42, "limit": 10}}
```

#### `session/getStats`
Returns session stats DTO (contextUsage with tokens & contextWindow; optional `conversationId: 42`).
```json
{"jsonrpc": "2.0", "id": "16", "method": "session/getStats", "params": {"conversationId": 42}}
```

---

## 6. Unsupported Capabilities (Anti-Fake / Missing Seams)

In compliance with AP-076 (Anti-Hollow / Anti-Fake), the following capabilities lack SPI seams on `SessionCoordinator` / `IAgentEngine` and **MUST NOT** return fake success:
- `binding/register`
- `binding/list`
- `session/fork`
- `tools/register`

Sample probe:
```json
{"jsonrpc": "2.0", "id": "17", "method": "binding/register", "params": {"threadId": "thr_123", "conversationId": 1}}
```
Expected Response:
Returns a JSON-RPC error with code `-32603` documenting the missing seam (e.g. `Capability 'binding/register' is unsupported by the current SessionCoordinator / IAgentEngine SPI. Missing seam: ...`). Result is omitted / undefined.

---

## 7. Diagnostic Fixture Observation API

For black-box test validation of actual underlying calls:

#### `fixture/getCalls`
Returns the array of calls received by the underlying `IAgentEngine` fixture.
```json
{"jsonrpc": "2.0", "id": "obs-1", "method": "fixture/getCalls", "params": {}}
```
Response:
```json
{"jsonrpc": "2.0", "id": "obs-1", "result": {"calls": [{"method": "start", "args": ["/tmp/fixture-session-dir"], "timestamp": 1793831363876}, ...]}}
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
