# Продуктовое ревью [S9b: Product Verify Gate] — Task 4B Capability Preservation Dispatcher

**Дата:** 2026-11-05  
**Роль:** Independent Black-Box Product Reviewer (Consumer Persona)  
**Проверенный артефакт:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/compiled-candidate/component-driver.mjs`  
**SHA-256 Checksum:** `7d8fb526e3cfcc1cefe4cf44eab67634ab38dab052a33668d3d2dd9be084db46` (MATCH)  
**Source Provenance:** Commit `49bcad1486a5101e20e8b88a616cc175a34fc3e9`  
**Исполняемый тестовый набор:** `docs/arch-improvement/cycle-7/live/task-4b/independent-product-review/consumer-blackbox.test.mjs`  
**Отчёты выполнения:** `junit.xml` (JUnit reporter), `test-run.log` (Spec reporter), `journey-results.json`, `findings.json`  

---

## 1. Executed User Journeys

### 1. Cold Fresh Process & Clean Lifecycle
- **J1.1 (Protocol Cleanliness):** Fresh process startup emits 0 stdout bytes before receiving requests -> **PASS**
- **J1.2 (Initial State & Startup):** Initial state contains only coordinator `start(["/tmp/fixture-session-dir"])` without user mutations -> **PASS**
- **J1.3 (SIGTERM Termination):** Clean bounded shutdown on SIGTERM (exit code 0, no orphan child processes) -> **PASS**
- **J1.4 (SIGINT Termination):** Clean bounded shutdown on SIGINT (exit code 0, no orphan child processes) -> **PASS**
- **J1.5 (EOF Termination):** Clean bounded shutdown on stdin stream closure (exit code 0) -> **PASS**

### 2. Happy Path (Primary Capability Dispatch & Fixture Traces)
- **J2.1 (String Prompt):** `session/prompt` with plain string -> Accepted (`status: "accepted"`, ID `fixture_sub_1`, conversationId `1`), verified `submit("Hello sovereign agent", {deliverAs: "followUp"})` in `fixture/getCalls` -> **PASS**
- **J2.2 (Multi-part Prompt):** `session/prompt` with text + image content parts -> Accepted, verified full array forwarding in `fixture/getCalls` -> **PASS**
- **J2.3 (Image-only Prompt):** `session/prompt` with image part only -> Accepted, verified in `fixture/getCalls` -> **PASS**
- **J2.4 (Child Session Routing):** `session/prompt` with `conversationId: "child-42"` -> Accepted with `conversationId: "child-42"`, verified child routing in `fixture/getCalls` -> **PASS**
- **J2.5 (Prompt Steer):** `session/prompt` with `deliverAs: "steer"` -> Verified `{deliverAs: "steer"}` in `fixture/getCalls` -> **PASS**
- **J2.6 (Explicit Steer):** `session/steer` forces `deliverAs: "steer"` and routes to child session -> Verified in `fixture/getCalls` -> **PASS**
- **J2.7 (Explicit FollowUp):** `session/followUp` forces `deliverAs: "followUp"` -> Verified in `fixture/getCalls` -> **PASS**
- **J2.8 (Model Listing):** `models/list` returns model catalog DTO with `contextWindow: 64000` -> **PASS**
- **J2.9 (Model Selection):** `models/set` updates model -> Returned `{ok: true}`, verified `setModel({provider: "fixture-provider", modelId: "fixture-model-v1"})` in `fixture/getCalls` -> **PASS**
- **J2.10 (Thinking Levels):** `models/setThinking` accepts all 6 levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) -> Verified `setThinkingLevel` in `fixture/getCalls` -> **PASS**
- **J2.11 (Policy Inherit):** `subagent/setPolicy` in `inherit` mode -> Returned `{ok: true}`, verified `setSubagentPolicy` in `fixture/getCalls` -> **PASS**
- **J2.12 (Policy Configured):** `subagent/setPolicy` in `configured` mode with nested model and thinking level -> Returned `{ok: true}`, verified `setSubagentPolicy` in `fixture/getCalls` -> **PASS**
- **J2.13 (Policy Alias):** `session/setSubagentPolicy` alias behaves identically to `subagent/setPolicy` -> **PASS**
- **J2.14 (Session Abort Root):** `session/abort` without conversationId -> Returned `{ok: true}`, verified `abort(null)` in `fixture/getCalls` -> **PASS**
- **J2.15 (Session Abort Child):** `session/abort` with `conversationId: "c-target"` -> Returned `{ok: true}`, verified `abort("c-target")` in `fixture/getCalls` -> **PASS**
- **J2.16 (Task Abort):** `session/abortTask` with positive integer `taskId: 42` -> Returned `{ok: true}`, verified `abortTask(42)` in `fixture/getCalls` -> **PASS**
- **J2.17 (History Compaction):** `session/compact` with instructions -> Returned `{ok: true}`, verified `compact("Summarize earlier context")` in `fixture/getCalls` -> **PASS**
- **J2.18 (State Inspection):** `session/getState` returns session DTO for root and child conversations -> **PASS**
- **J2.19 (Transcript Inspection):** `session/getTranscript` with `limit: 5` returns transcript DTO -> Verified `getTranscript(null, 5)` in `fixture/getCalls` -> **PASS**
- **J2.20 (Stats Inspection):** `session/getStats` returns context usage DTO (`tokens: 100`, `contextWindow: 128000`) -> **PASS**
- **J2.21 (Fixture Reset):** `fixture/reset` clears recorded calls and resets submission counters -> Returned `{ok: true}`, calls reset to `[]`, subsequent prompt ID resets to `fixture_sub_1` -> **PASS**
- **J2.22 (Pipelining):** Rapid sequential request pipelining preserves message order and delivery to underlying engine fixture -> **PASS**

### 3. Error Recovery & Protocol Edge Cases
- **J3.1a (Unknown Method Message):** Returns informative error message `Method not found: nonexistent/method` -> **PASS**
- **J3.1b (Unknown Method Protocol Code):** Unknown method returned `code: -32603` instead of standard JSON-RPC 2.0 `code: -32601` -> **FAIL** (See FND-4B-001)
- **J3.2a (Missing Prompt Parameter Message):** Returns informative error message for missing prompt content -> **PASS**
- **J3.2b (Missing Prompt Parameter Code):** Missing parameter returned `code: -32603` instead of standard JSON-RPC 2.0 `code: -32602` -> **FAIL** (See FND-4B-001)
- **J3.3a (Invalid TaskId Message):** Returns informative error message for non-positive taskId -> **PASS**
- **J3.3b (Invalid TaskId Code):** Invalid taskId returned `code: -32603` instead of standard JSON-RPC 2.0 `code: -32602` -> **FAIL** (See FND-4B-001)
- **J3.4a (Invalid Thinking Level Message):** Returns informative error message for unrecognized thinking level -> **PASS**
- **J3.4b (Invalid Thinking Level Code):** Invalid thinking level returned `code: -32603` instead of standard JSON-RPC 2.0 `code: -32602` -> **FAIL** (See FND-4B-001)
- **J3.5a (Invalid DeliverAs Message):** Returns informative error message for unrecognized deliverAs mode -> **PASS**
- **J3.5b (Invalid DeliverAs Code):** Invalid deliverAs returned `code: -32603` instead of standard JSON-RPC 2.0 `code: -32602` -> **FAIL** (See FND-4B-001)
- **J3.6 (JSON Parse Error):** Malformed JSON input returns standard JSON-RPC 2.0 `code: -32700` (`Parse error`) -> **PASS**
- **J3.7 (Invalid JSON-RPC Request):** Malformed JSON-RPC envelope (missing/wrong version) returns standard `code: -32600` (`Invalid Request`) -> **PASS**
- **J3.8 (ID 0 Preservation):** Numeric ID `0` preserved identically in response (`id: 0`, not null or string) -> **PASS**
- **J3.9 (Empty String ID Preservation):** String ID `""` preserved identically in response (`id: ""`) -> **PASS**
- **J3.10 (Valid Notification Execution):** JSON-RPC notification (no ID) executes state mutation without emitting stdout response line -> **PASS**
- **J3.11 (Erroneous Notification - Method):** Notification targeting unknown method produces 0 stdout output -> **PASS**
- **J3.12 (Erroneous Notification - Params):** Notification with invalid parameters produces 0 stdout output -> **PASS**
- **J3.13 (State Recovery After Error):** Process and domain coordinator recover immediately after error; subsequent valid request succeeds cleanly -> **PASS**
- **J3.14 (Anti-Fake binding/register):** Unsupported `binding/register` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.15 (Anti-Fake binding/list):** Unsupported `binding/list` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.16 (Anti-Fake session/fork):** Unsupported `session/fork` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.17 (Anti-Fake tools/register):** Unsupported `tools/register` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)

---

## 2. Findings

### [P2] FND-4B-001: JSON-RPC 2.0 Error Code Collapse to -32603 for Unknown Methods (-32601) and Invalid Parameters (-32602)
- **Journey:** Error Recovery & Edge Cases (J3.1b, J3.2b, J3.3b, J3.4b, J3.5b)
- **Rule:** AP-012 (Fail-fast и явные контракты ошибок), AP-022 (Typed errors и явная обработка исключений), AP-026 (API-контракты и DTO границы)
- **Evidence:**
  ```json
  // Action 1: Unknown RPC method
  --> {"jsonrpc": "2.0", "id": 1, "method": "nonexistent/method", "params": {}}
  <-- {"jsonrpc": "2.0", "id": 1, "error": {"code": -32603, "message": "Method not found: nonexistent/method"}}
  // Expected code: -32601 (Method not found)
  // Actual code:   -32603 (Internal error)

  // Action 2: Missing required prompt content parameter
  --> {"jsonrpc": "2.0", "id": 2, "method": "session/prompt", "params": {}}
  <-- {"jsonrpc": "2.0", "id": 2, "error": {"code": -32603, "message": "Missing required prompt content, message, or images"}}
  // Expected code: -32602 (Invalid params)
  // Actual code:   -32603 (Internal error)

  // Action 3: Non-positive taskId in session/abortTask
  --> {"jsonrpc": "2.0", "id": 3, "method": "session/abortTask", "params": {"taskId": -1}}
  <-- {"jsonrpc": "2.0", "id": 3, "error": {"code": -32603, "message": "Missing or invalid taskId: must be a positive integer"}}
  // Expected code: -32602 (Invalid params)
  // Actual code:   -32603 (Internal error)

  // Action 4: Invalid thinking level
  --> {"jsonrpc": "2.0", "id": 4, "method": "models/setThinking", "params": {"level": "extreme"}}
  <-- {"jsonrpc": "2.0", "id": 4, "error": {"code": -32603, "message": "Missing or invalid thinking level: must be one of off, minimal, low, medium, high, xhigh"}}
  // Expected code: -32602 (Invalid params)
  // Actual code:   -32603 (Internal error)
  ```
- **Expectation:** As defined by Section 5.1 of the JSON-RPC 2.0 specification and Section 5 of `api.md`:
  - Unknown method requests must return JSON-RPC error code `-32601` (`Method not found`).
  - Invalid or missing parameters must return JSON-RPC error code `-32602` (`Invalid params`).
  - Ordinary internal execution errors must return JSON-RPC error code `-32603` (`Internal error`).
- **Reality:** All dispatcher errors (method routing misses, parameter validations, Zod schema failures) are collapsed into `-32603` (Internal Error).
- **Impact:** Standard JSON-RPC 2.0 client libraries, automated agents, and API gateways inspect `error.code`. Collapsing client validation errors into `-32603` misrepresents client errors (equivalent to HTTP 400/404) as internal unhandled server crashes (equivalent to HTTP 500). Callers cannot programmatically distinguish an invalid argument from a fatal service failure.
- **Fix decision:** `fix-now` (P2 defect blocks acceptance).

---

## 3. Product Verification

- **Primary Journey Complete:** YES (All 22 happy path capabilities execute, accept typed payloads, and verifiably trigger underlying `IAgentEngine` fixture methods with correct arguments).
- **Feedback & Error Clarity:** NO (Informative text messages are emitted, but JSON-RPC 2.0 protocol error codes `-32601` and `-32602` are collapsed into `-32603`).
- **Clean State & Clean Exit:** YES (0 pre-request stdout noise, bounded clean exit 0 on SIGTERM, SIGINT, and EOF without orphan processes).
- **Anti-Fake Adherence (AP-076):** YES (Unsupported capabilities `binding/register`, `binding/list`, `session/fork`, and `tools/register` explicitly reject with missing seam diagnostics, never faking `{ok: true}`).

---

## 4. Architecture Verification & AP Map

- **Passed:**
  - `AP-010`: Ports & Adapters wiring verified via `fixture/getCalls` observation port.
  - `AP-013`: Data integrity of messages, content parts, and IDs maintained across dispatch.
  - `AP-016`: Security and parameter boundaries strictly guarded by Zod/type validation before execution.
  - `AP-020`: Composition root wires authoritative `SessionCoordinator` to `IAgentEngine` port cleanly.
  - `AP-021`: Thin entry point: standard I/O JSON-RPC interface delegates directly to domain coordinator.
  - `AP-023`: Async discipline: no unhandled promise rejections; clean shutdown on POSIX signals.
  - `AP-032`: Command/Query Separation: query methods (`getState`, `getTranscript`, `getStats`) do not mutate session state; commands (`submit`, `abort`, `compact`) explicitly route.
  - `AP-075`: Walking vertical skeleton: end-to-end stdin/stdout JSON-RPC capability dispatch runs deterministically.
  - `AP-076`: Anti-Hollow / Anti-Fake: missing seams (`binding/*`, `session/fork`, `tools/register`) explicitly error out rather than returning fake success tokens.
- **Violations:**
  - `AP-012` / `AP-022` / `AP-026`: Collapsed error codes (`-32603` instead of `-32601` and `-32602`) violate typed error contracts and public JSON-RPC protocol specification.

---

## 5. Scope Boundary & What Remains Untested

1. **Test-Only Engine Port Fixture:** The driver wires `SessionCoordinator` to an in-memory `IAgentEngine` fixture. Dynamic IDs `fixture_sub_<N>` and static token stats (`100` tokens / `128000` window) are fixture artifacts and **DO NOT** verify real LLM provider connectivity, Pi harness execution, or SQLite persistence.
2. **Task 1 Separation:** Native CLI runtime acceptance (`bin/durable-zero`, process daemonization, Slice 0 storage) remains strictly separate and is NOT accepted by this review.
3. **Declared Unsupported Limitations:** Runtime binding persistence (`binding/register`, `binding/list`), session database forking (`session/fork`), and dynamic tool registration (`tools/register`) are missing from SPI seams and are confirmed unsupported.

---

## 6. Residual User Risk

1. **Client Middleware Incompatibility:** Upstream agent clients expecting standard JSON-RPC 2.0 error classification will misclassify parameter typos and missing methods as internal component bugs.
2. **Postgres / SQLite Out-of-Scope:** Actual durability across process restarts requires Task 1 / storage acceptance, which was not under test in this component fixture.

---

## Итоговый вердикт

```
VERDICT: FAIL
```

**Reason for Verdict:**  
Per `arch-improvement-product-review` and `arch-rules` gate rules, P0, P1, and P2 findings are all blocking defects. Finding **[P2] FND-4B-001** (JSON-RPC error code collapse to `-32603` for unknown methods and parameter validation errors) breaks the public JSON-RPC 2.0 protocol contract. Once the builder maps unknown methods to `-32601` and parameter validation failures to `-32602`, this component candidate will be eligible for a clean `PASS`.
