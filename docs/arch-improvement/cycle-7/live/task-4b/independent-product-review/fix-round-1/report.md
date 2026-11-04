# Продуктовое ревью [S9b: Product Verify Gate] — Task 4B Capability Dispatcher (Fix Round 1)

**Дата:** 2026-11-05  
**Роль:** Independent Black-Box Product Reviewer (Consumer Persona)  
**Проверенный артефакт:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/compiled-fix-round-1/component-driver.mjs`  
**SHA-256 Checksum:** `ce718a070112c626bd03e568c634adce90e2ca2d303006885c63df93875b8e76` (MATCH)  
**Source Provenance:** Commit `ea21bf5`  
**Исполняемый тестовый набор:** `docs/arch-improvement/cycle-7/live/task-4b/independent-product-review/fix-round-1/consumer-blackbox.test.mjs`  
**Отчёты выполнения:** `junit.xml` (JUnit reporter, 46/46 passed), `test-run.log` (Spec reporter), `journey-results.json`, `findings.json`  

---

## 1. Executed User Journeys

### 1. Cold Fresh Process & Clean Lifecycle
- **J1.1 (Protocol Cleanliness):** Fresh process startup emits 0 stdout bytes before receiving requests -> **PASS**
- **J1.2 (Initial State & Startup):** Initial state contains only coordinator `start(["/tmp/fixture-session-dir"])` without user mutations -> **PASS**
- **J1.3 (SIGTERM Termination):** Clean bounded shutdown on SIGTERM (exit code 0, no lingering or orphan processes) -> **PASS**
- **J1.4 (SIGINT Termination):** Clean bounded shutdown on SIGINT (exit code 0, no lingering or orphan processes) -> **PASS**
- **J1.5 (EOF Termination):** Clean bounded shutdown on stdin stream closure (exit code 0) -> **PASS**

### 2. Happy Path (Primary Capability Dispatch & Fixture Traces)
- **J2.1 (String Prompt):** `session/prompt` with plain string -> Accepted (`status: "accepted"`, ID `fixture_sub_1`, conversationId `1`), verified `submit("Hello sovereign agent", {deliverAs: "followUp"})` in `fixture/getCalls` -> **PASS**
- **J2.2 (Multi-part Prompt):** `session/prompt` with text + image content parts -> Accepted, verified full array forwarding in `fixture/getCalls` -> **PASS**
- **J2.3 (Image-only Prompt):** `session/prompt` with image part only -> Accepted, verified in `fixture/getCalls` -> **PASS**
- **J2.4 (Canonical Child Session Routing):** `session/prompt` with canonical `conversationId: 42` and `"42"` -> Normalized to string `"42"`, verified child routing in `fixture/getCalls` -> **PASS**
- **J2.5 (Prompt Steer):** `session/prompt` with `deliverAs: "steer"` -> Verified `{deliverAs: "steer"}` in `fixture/getCalls` -> **PASS**
- **J2.6 (Explicit Steer):** `session/steer` forces `deliverAs: "steer"` and accepts canonical child routing (`conversationId: 42`) -> Verified in `fixture/getCalls` -> **PASS**
- **J2.7 (Explicit FollowUp):** `session/followUp` forces `deliverAs: "followUp"` -> Verified in `fixture/getCalls` -> **PASS**
- **J2.8 (Model Listing):** `models/list` returns model catalog DTO with `contextWindow: 64000` -> **PASS**
- **J2.9 (Model Selection):** `models/set` updates model -> Returned `{ok: true}`, verified `setModel({provider: "fixture-provider", modelId: "fixture-model-v1"})` in `fixture/getCalls` -> **PASS**
- **J2.10 (Thinking Levels):** `models/setThinking` accepts all 6 levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`) -> Verified `setThinkingLevel` in `fixture/getCalls` -> **PASS**
- **J2.11 (Policy Inherit):** `subagent/setPolicy` in `inherit` mode -> Returned `{ok: true}`, verified `setSubagentPolicy` in `fixture/getCalls` -> **PASS**
- **J2.12 (Policy Configured):** `subagent/setPolicy` in `configured` mode with nested model and thinking level -> Returned `{ok: true}`, verified `setSubagentPolicy` in `fixture/getCalls` -> **PASS**
- **J2.13 (Policy Alias):** `session/setSubagentPolicy` alias behaves identically to `subagent/setPolicy` -> **PASS**
- **J2.14 (Session Abort Root):** `session/abort` without conversationId -> Returned `{ok: true}`, verified `abort(null)` in `fixture/getCalls` -> **PASS**
- **J2.15 (Session Abort Child):** `session/abort` with canonical `conversationId: 42` -> Returned `{ok: true}`, verified `abort("42")` in `fixture/getCalls` -> **PASS**
- **J2.16 (Task Abort):** `session/abortTask` with positive integer `taskId: 42` -> Returned `{ok: true}`, verified `abortTask(42)` in `fixture/getCalls` -> **PASS**
- **J2.17 (History Compaction):** `session/compact` with instructions -> Returned `{ok: true}`, verified `compact("Summarize earlier context")` in `fixture/getCalls` -> **PASS**
- **J2.18 (State Inspection):** `session/getState` returns session DTO for root and canonical child `42` -> **PASS**
- **J2.19 (Transcript Inspection):** `session/getTranscript` with `limit: 5` returns transcript DTO for root and child `42` -> Verified `getTranscript("42", 10)` in `fixture/getCalls` -> **PASS**
- **J2.20 (Stats Inspection):** `session/getStats` returns context usage DTO (`tokens: 100`, `contextWindow: 128000`) -> **PASS**
- **J2.21 (Fixture Reset):** `fixture/reset` clears recorded calls and resets dynamic counters -> Returned `{ok: true}`, calls reset to `[]`, subsequent prompt ID resets to `fixture_sub_1` -> **PASS**
- **J2.22 (Pipelining):** Rapid sequential request pipelining preserves message order and delivery to underlying engine fixture -> **PASS**

### 3. Error Recovery & Protocol Edge Cases
- **J3.1 (Unknown Method Protocol Code):** Unknown method returns standard JSON-RPC 2.0 `code: -32601` (`Method not found`) and descriptive message -> **PASS** (Resolved)
- **J3.2 (Missing Prompt Parameter):** Missing required prompt content returns standard JSON-RPC 2.0 `code: -32602` (`Invalid params`) -> **PASS** (Resolved)
- **J3.3 (Invalid TaskId):** Negative taskId returns standard JSON-RPC 2.0 `code: -32602` (`Invalid params`) -> **PASS** (Resolved)
- **J3.4 (Invalid Thinking Level):** Unrecognized thinking level returns standard JSON-RPC 2.0 `code: -32602` (`Invalid params`) -> **PASS** (Resolved)
- **J3.5 (Invalid DeliverAs):** Unrecognized deliverAs returns standard JSON-RPC 2.0 `code: -32602` (`Invalid params`) -> **PASS** (Resolved)
- **J3.6 (Non-Canonical ConversationId Rejection):** Non-canonical conversationId (`"c-target"`, `"invalid_id"`, `0`, `"0"`, `-5`) rejected with standard `code: -32602` -> **PASS**
- **J3.7 (Invalid Policy Schema):** Invalid subagent policy record schema returns standard `code: -32602` with detailed validation diagnostics -> **PASS** (Resolved)
- **J3.8 (JSON Parse Error):** Malformed JSON input returns standard JSON-RPC 2.0 `code: -32700` (`Parse error`) -> **PASS**
- **J3.9 (Invalid JSON-RPC Request):** Malformed JSON-RPC envelope returns standard `code: -32600` (`Invalid Request`) -> **PASS**
- **J3.10 (ID 0 Preservation):** Numeric ID `0` preserved identically in response (`id: 0`) -> **PASS**
- **J3.11 (Empty String ID Preservation):** String ID `""` preserved identically in response (`id: ""`) -> **PASS**
- **J3.12 (Valid Notification Execution):** JSON-RPC notification (no ID) executes state mutation without emitting stdout response line -> **PASS**
- **J3.13 (Erroneous Notification - Method):** Notification targeting unknown method produces 0 stdout output -> **PASS**
- **J3.14 (Erroneous Notification - Params):** Notification with invalid parameters produces 0 stdout output -> **PASS**
- **J3.15 (State Recovery After Error):** Process and domain coordinator recover immediately after error; subsequent valid request succeeds cleanly -> **PASS**
- **J3.16 (Anti-Fake binding/register):** Unsupported `binding/register` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.17 (Anti-Fake binding/list):** Unsupported `binding/list` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.18 (Anti-Fake session/fork):** Unsupported `session/fork` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)
- **J3.19 (Anti-Fake tools/register):** Unsupported `tools/register` rejects with explicit missing seam error documentation; no fake success -> **PASS** (AP-076 compliant)

---

## 2. Findings

- **Findings:** None
  - Prior finding `FND-4B-001` (JSON-RPC error code collapse to `-32603`) has been completely resolved: unknown methods map to `-32601`, and parameter validation errors (including Zod schema errors, missing fields, negative integers, and non-canonical conversationIds) map to `-32602`.
  - No new defects observed across 46 executed test journeys.

---

## 3. Product Verification

- **Primary Journey Complete:** YES (All 22 happy path capabilities execute, accept typed payloads, and verifiably trigger underlying `IAgentEngine` fixture methods with exact arguments).
- **Feedback & Error Clarity:** YES (Standard JSON-RPC 2.0 protocol error codes `-32601`, `-32602`, `-32700`, and `-32600` returned with informative diagnostics).
- **Clean State & Clean Exit:** YES (0 pre-request stdout noise, bounded clean exit 0 on SIGTERM, SIGINT, and EOF without orphan processes).
- **Anti-Fake Adherence (AP-076):** YES (Unsupported capabilities `binding/register`, `binding/list`, `session/fork`, and `tools/register` explicitly reject with missing seam diagnostics, never returning fake success).

---

## 4. Architecture Verification & AP Map

- **Passed:**
  - `AP-010`: Ports & Adapters wiring verified via `fixture/getCalls` observation port.
  - `AP-012`: Fail-fast and typed JSON-RPC error codes (`-32601` Method Not Found, `-32602` Invalid Params, `-32700` Parse Error, `-32600` Invalid Request).
  - `AP-013`: Data integrity of messages, content parts, conversationIds, and IDs preserved.
  - `AP-016`: Security and parameter boundaries strictly guarded by validation before execution.
  - `AP-020`: Composition root wires authoritative `SessionCoordinator` to `IAgentEngine` port cleanly.
  - `AP-021`: Thin entry point: standard I/O JSON-RPC interface delegates directly to domain coordinator.
  - `AP-022`: Typed errors and standard protocol codes strictly separated from internal failures.
  - `AP-023`: Async discipline: no unhandled promise rejections; clean shutdown on POSIX signals.
  - `AP-026`: API contracts and DTO boundaries fully conform to JSON-RPC 2.0 specification.
  - `AP-032`: Command/Query Separation: query methods (`getState`, `getTranscript`, `getStats`) do not mutate state; commands (`submit`, `abort`, `compact`) explicitly route.
  - `AP-075`: Walking vertical skeleton: end-to-end stdin/stdout JSON-RPC capability dispatch runs deterministically.
  - `AP-076`: Anti-Hollow / Anti-Fake: missing seams (`binding/*`, `session/fork`, `tools/register`) explicitly error out rather than returning fake success tokens.

---

## 5. Scope Boundary & What Remains Untested

1. **Test-Only Engine Port Fixture:** The driver wires `SessionCoordinator` to an in-memory `IAgentEngine` fixture. Dynamic IDs `fixture_sub_<N>` and static token metrics (`100` / `128000`) are fixture artifacts and **DO NOT** verify real LLM provider connectivity, Pi harness execution, or SQLite persistence.
2. **Task 1 Separation:** Native CLI runtime acceptance (`bin/durable-zero`, process daemonization, Slice 0 storage) remains strictly separate and is NOT accepted by this review.
3. **Declared Unsupported Limitations:** Runtime binding persistence (`binding/register`, `binding/list`), session database forking (`session/fork`), and dynamic tool registration (`tools/register`) are missing from SPI seams and are confirmed unsupported.

---

## 6. Residual User Risk

1. **Native Storage Integration:** Actual session durability across engine process restarts requires Task 1 / storage acceptance, which was not under test in this component fixture.
2. **Declared Unsupported Features:** Consumers attempting to use `binding/register`, `session/fork`, or `tools/register` will encounter declared limitation errors until respective SPI seams are implemented in future cycles.

---

## Итоговый вердикт

```
VERDICT: PASS
```

**Reason for Verdict:**  
All 46 independent black-box test journeys across Cold-Start/Lifecycle, Primary Happy Path, and Error Recovery passed deterministically. Finding `FND-4B-001` is verified resolved with strict JSON-RPC 2.0 protocol code compliance (`-32601` for unknown methods, `-32602` for invalid parameters, `-32603` for declared unsupported seams, `-32700` for parse errors, and `-32600` for invalid requests). Zero blocking findings remain.
