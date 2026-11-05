# Native Candidate Shipped CLI + Runner Package (Fix-Round-2)

**Milestone Commit:** `ad99873e396f7440a6896dabaf516b6393c08a37`  
**Package Directory:** `docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/`  
**Purpose:** Self-contained, fresh frozen native CLI + runner build artifact for independent black-box product review.

---

## 1. Quick Start: Exact Run Command

To launch the daemon in JSON-RPC stdio server mode with the included scripted two-chunk provider extension:

```bash
node docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/packages/cli/bin/durable-zero.js serve \
  --session-dir /path/to/isolated/session \
  --cwd /path/to/isolated/cwd \
  --extension docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/fixtures/scripted-provider-extension.mjs \
  --provider scripted-e2e \
  --model echo \
  --no-global-extensions
```

### Environment Isolation Recommended for Reviewers:
```bash
HOME=/path/to/tmp/home \
XDG_CONFIG_HOME=/path/to/tmp/config \
PI_AGENT_DIR=/path/to/tmp/agent \
node docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/packages/cli/bin/durable-zero.js serve ...
```

---

## 2. Public CLI Flags Reference

| Flag | Argument | Description |
|---|---|---|
| `serve` | *(verb)* | Starts the multi-client socket daemon & stdio JSON-RPC 2.0 server. |
| `--session-dir` | `<dir>` | Absolute path to session directory containing SQLite WAL database. |
| `--session` | `<id\|relpath>` | Relative session subpath within `--cwd` (default: `.durable/sessions/default`). |
| `--cwd` | `<dir>` | Working directory for the agent session. |
| `--extension` | `<file>` | Path to an external extension file (`.mjs` or `.ts`) registering custom providers/models. |
| `--provider` | `<id>` | Default provider ID to select (e.g. `scripted-e2e`). |
| `--model` | `<id>` | Default model ID to select (e.g. `echo`). |
| `--thinking` | `<level>` | Thinking level (`off`, `minimal`, `low`, `medium`, `high`, `max`). |
| `--no-global-extensions` | *(none)* | Disables scanning user global extensions (`~/.pi/...`), ensuring clean isolation. |
| `--continue` | *(none)* | Continues an existing session without creating a new initial conversation record. |

*Note: Unsupported commands `doctor` and standalone `run` fail fast with exit code `1` and explicit instructions directing callers to use `durable-zero serve`.*

---

## 3. JSON-RPC 2.0 Protocol Capabilities

The server communicates via newline-delimited JSON-RPC 2.0 over `stdin` and `stdout`.

### 3.1. Readiness & State Inspection (`session/getState`)
- **Request:**
  ```json
  {"jsonrpc":"2.0","id":1,"method":"session/getState","params":{}}
  ```
- **Response:**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
      "sessionId": "default",
      "cwd": "/path/to/cwd",
      "activeConversationId": "1",
      "activeModel": { "provider": "scripted-e2e", "modelId": "echo" },
      "thinkingLevel": "off",
      "models": [ ... ],
      "entryCount": 0
    }
  }
  ```

### 3.2. Admitting a Prompt (`session/prompt`)
- **Request:**
  ```json
  {"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"content":"Echo: hello world"}}
  ```
- **Response (Admission Receipt):**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 2,
    "result": {
      "id": "1",
      "status": "accepted",
      "conversationId": "1"
    }
  }
  ```

### 3.3. Streaming Event Notification (`session/event`)
While generation is underway, notifications arrive on `stdout`:
- **Text Delta (Incremental Chunks):**
  ```json
  {
    "jsonrpc": "2.0",
    "method": "session/event",
    "params": {
      "event": {
        "type": "message_update",
        "assistantMessageEvent": {
          "type": "text_delta",
          "contentIndex": 0,
          "delta": "Echo: he"
        }
      }
    }
  }
  ```
- **Terminal Completion (`turn_complete`):**
  ```json
  {
    "jsonrpc": "2.0",
    "method": "session/event",
    "params": {
      "event": {
        "type": "turn_complete",
        "requestId": "1",
        "status": "completed"
      }
    }
  }
  ```

### 3.4. Transcript Retrieval (`session/getTranscript`)
- **Request:**
  ```json
  {"jsonrpc":"2.0","id":3,"method":"session/getTranscript","params":{}}
  ```
- **Response:**
  ```json
  {
    "jsonrpc": "2.0",
    "id": 3,
    "result": {
      "entries": [
        { "id": "8", "role": "user", "text": "Echo: hello world", "timestamp": 1730768160000 },
        { "id": "12", "role": "assistant", "text": "Echo: hello world", "timestamp": 1730768160260 }
      ]
    }
  }
  ```

### 3.5. Clean Shutdown
The server gracefully flushes storage and cleans up resources on:
- `stdin` closure (`EOF` / `stdin.end()`) -> exits `0`
- `SIGTERM` / `SIGINT` -> exits `0`

---

## 4. Independent Reviewer Model Extension Oracle

For black-box testing without real model calls or network access, two fixtures are included:
- `fixtures/scripted-provider-extension.mjs` (Standard Node ESM)
- `fixtures/scripted-provider-extension.ts` (TypeScript / Node type-strip)

### Behavior:
1. Registers provider `scripted-e2e` with model `echo`.
2. Emits Chunk 1 (`text.slice(0, mid)`), sleeps 120ms (exceeding the Pi-Durable 100ms throttle interval).
3. Emits Chunk 2 (`text.slice(mid)`), sleeps 140ms.
4. Emits `stopReason: "stop"` and ends the stream.

This oracle enables independent verification of:
- **Two distinct `text_delta` notifications** arrived on client stdout before final assistant message and before `turn_complete`.
- **Persistence across actual process restart:** after terminating the process and restarting with the same `--session-dir`, `session/getTranscript` restores entries with matching IDs (`userEntry.id`, `assistantEntry.id`).
- **Sequential multi-turn continuation:** sending a second prompt increments `entryCount` correctly.

---

## 5. Provenance & Checksums

### Pinned External Dependencies (Lockfile Provenance)
- `@earendil-works/chord`: `1.5.0`
- `@earendil-works/pi-ai`: `1.5.0`
- `@earendil-works/pi-codemode`: `1.5.0`
- `@earendil-works/pi-coding-agent`: `1.5.0`
- `@earendil-works/pi-durable`: `1.5.0`
- `@earendil-works/pi-schema`: `1.5.0`
- `@sinclair/typebox`: `0.34.52`
- `proper-lockfile`: `4.1.2`
- `quickjs-wasi`: `3.6.2`
- `zod`: `4.6.7`
- `esbuild`: `0.28.2`

### Physical File Hashes (`SHA256SUMS`)
```text
84f5029f20c0174b853b7b180c81f61482285f75baeb7f3a53415ef23644c81a  ./build-candidate.sh
44daf43683124677fd67bfbc2c6aebaf57f32487da3f7b2406585e4059f224e7  ./build.log
c9f582ae1875d3e22577a8a05ab9460787b6b536373f0aa183a8d71fcfd87a69  ./fixtures/scripted-provider-extension.mjs
9ed02f41ab01493ce2946d513dfc09e377bd774bf52bcbe8288197a8ae24700e  ./fixtures/scripted-provider-extension.ts
dd470565bf3dc889deb7abfcba444b2b1589e5f9152349b339e9de509a0fb190  ./packages/cli/bin/durable-zero.js
d4c9375f2b1ca4dc95f72c8aa2982a7a9951ac8011490d79c6582df732b4bbd9  ./packages/core/dist/quickjs.wasm
76ec126543cc131986cdc12246f8fdd0a35a596d62c6a7a235ff9c0857f1b05c  ./packages/runner/dist/main.js
23e66d4bd914a55ba0f1ec5c8ec437562c504ca08bc6cc910f75429d40cf2ddb  ./packages/runner/dist/main.js.map
d4c9375f2b1ca4dc95f72c8aa2982a7a9951ac8011490d79c6582df732b4bbd9  ./packages/runner/dist/quickjs.wasm
1b67ed19ac091fb125725de73d6a3e443827cc9936da55dccfc209e32b506164  ./verify-results.junit.xml
48ba7032529034b517598688290ce1a0689843b21f40fc13d89ce3777ea51ad5  ./verify-smoke.mjs
d0df27bc66dde5a2e8b32a898a17e8cb345ca304086e52fbfe4c5d5001380d3f  ./verify.log
```
