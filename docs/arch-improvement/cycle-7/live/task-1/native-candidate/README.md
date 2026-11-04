# Native Candidate Shipped CLI + Runner Package

**Milestone Commit:** `fc0909602e7969df080259a2e2d4a7114be450b8`  
**Package Directory:** `docs/arch-improvement/cycle-7/live/task-1/native-candidate/`  
**Purpose:** Self-contained, frozen native CLI + runner build artifact for independent black-box product review.

---

## 1. Quick Start: Exact Run Command

To launch the daemon in JSON-RPC stdio server mode with the included scripted two-chunk provider extension:

```bash
node docs/arch-improvement/cycle-7/live/task-1/native-candidate/packages/cli/bin/durable-zero.js serve \
  --session-dir /path/to/isolated/session \
  --cwd /path/to/isolated/cwd \
  --extension docs/arch-improvement/cycle-7/live/task-1/native-candidate/fixtures/scripted-provider-extension.mjs \
  --provider scripted-e2e \
  --model echo \
  --no-global-extensions
```

### Environment Isolation Flags Recommended for Reviewers:
```bash
HOME=/path/to/tmp/home \
XDG_CONFIG_HOME=/path/to/tmp/config \
PI_AGENT_DIR=/path/to/tmp/agent \
node docs/arch-improvement/cycle-7/live/task-1/native-candidate/packages/cli/bin/durable-zero.js serve ...
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
| `--no-global-extensions` | *(none)* | Disables scanning user global extensions (`~/.pi/...`), ensuring test isolation. |
| `--continue` | *(none)* | Continues an existing session without creating a new initial conversation record. |

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

This oracle allows verifying:
- **Two distinct `text_delta` notifications** arrived on client stdout before the final assistant message and before `turn_complete`.
- **Persistence across actual process restart:** after killing the process and restarting with the same `--session-dir`, `session/getTranscript` restores entries with matching IDs (`userEntry.id`, `assistantEntry.id`).
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
2f9e7ae41e8bd4630155b5ea46cd06f30f1a87fbc5bf9b564e46c59c26e1d09a  ./build-candidate.sh
401445e2630c08c1345a27884f82bfb0a173afcbf90da2605dc1c7afd68098ae  ./build.log
c9f582ae1875d3e22577a8a05ab9460787b6b536373f0aa183a8d71fcfd87a69  ./fixtures/scripted-provider-extension.mjs
9ed02f41ab01493ce2946d513dfc09e377bd774bf52bcbe8288197a8ae24700e  ./fixtures/scripted-provider-extension.ts
29607108a366547a95852f4313c969e46c8c8cf482d5eacef27763536f44f301  ./packages/cli/bin/durable-zero.js
d4c9375f2b1ca4dc95f72c8aa2982a7a9951ac8011490d79c6582df732b4bbd9  ./packages/core/dist/quickjs.wasm
813931832b4f689713b67cafb3421f4a4fe328a7daa64259acf845f1572efff6  ./packages/runner/dist/main.js
110b7b30ef99398726ee6f9dbec3335172f9e602d424c6815e65836cd0e4bd8d  ./packages/runner/dist/main.js.map
d4c9375f2b1ca4dc95f72c8aa2982a7a9951ac8011490d79c6582df732b4bbd9  ./packages/runner/dist/quickjs.wasm
83577f78adef1f029ff9388c53aa24b457d5fec8118ba70f59522bb1e5cfe75e  ./verify-results.junit.xml
d1c8acabb7e2b0e555dcf7071ae28da50465f6445a954bdc780b8054f2e7458d  ./verify-smoke.mjs
cba1cf2abffde700eecb150b23ecefb106a9a631bf575e109cc11bf6bfc36a4d  ./verify.log
```
