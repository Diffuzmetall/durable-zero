# Cycle 7 Task 1 (Slice 0): Independent Architecture & Spec Review

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `fc0909602e7969df080259a2e2d4a7114be450b8`  
**Base Reference:** `5b15b5e` / `f3fff38`  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076)  
**Review Skills:** `arch-improvement-review`, `arch-rules-implementation-review`, `verification-before-completion`  
**Target Subsystem:** Task 1 / Slice 0 (Acyclic Closure Relocation, Living Walking Skeleton, Native DI & Streaming Persistence)  
**Overall Verdict:** **VERDICT: FAIL** (3 P1 blockers, 4 P2 defects, 2 P3 maintainability observations)

---

## 1. Candidate Source Inventory & Checksum Provenance

The frozen candidate `fc0909602e7969df080259a2e2d4a7114be450b8` was audited. File hashes:

| File Path | SHA-256 Checksum | Role / Disposition |
| :--- | :--- | :--- |
| `packages/core/src/session/coordinator.ts` | `a21a2620af6f21af64736a3c595e0af2280af6101448ba2a5d286a05e9c244f2` | Pure domain session coordinator |
| `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` | `d803d70cd47c80fb99c4a737b9f94d9a9cf10714f94f442df2c9e27921e39f29` | Native `IAgentEngine` adapter implementation |
| `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts` | `3d4c7ac25ec063e0b4771f390ea228ef8a6aa1f2b522980a3f26c737fb359daa` | Native event to `RunnerEvent` stream projector |
| `packages/adapter-pi-durable/src/engine/bridge/watch-events-compat.ts` | `4418c5123225033869de59d9800fbfc87c4c3a86bbbc75823f30462a1b57374e` | Transactional `conversation.watch` adapter |
| `packages/runner/src/composition.ts` | `1561edb3af511dfb03821aea541f16eea32c619ff92a75a57528b705a08bd077` | `assembleDurableZero` composition root |
| `packages/runner/src/main.ts` | `95a4718aa9733f8ae558da22564966fe470bc66c93cbe6a9da0a53682232d15c` | Production CLI runner entrypoint |
| `packages/cli/bin/durable-zero.js` | `29607108a366547a95852f4313c969e46c8c8cf482d5eacef27763536f44f301` | Bin entrypoint forwarding `serve` to runner |
| `packages/runner/test/e2e-walking-skeleton.test.ts` | `80e64fb65bd9f47abf1ec2bde60d4f67f92197537b11fad0807e2bd919613996` | Two-process E2E walking skeleton test |
| `packages/runner/test/fixtures/scripted-provider-extension.ts` | `9ed02f41ab01493ce2946d513dfc09e377bd774bf52bcbe8288197a8ae24700e` | Offline deterministic extension fixture |
| `packages/protocol/src/transport/stdio-server.ts` | `094a7c5738548c7930f85b5f1a9bf82e5b2c6e5d1483ea3ae0281e659c56160f` | JSON-RPC 2.0 stdio server |
| `docs/arch-improvement/cycle-7/live/task-1/checkpoint-report.md` | `dccfddb881beea60c78ce8ce6d87078e3f081bd6991e831da3223a09e9d634b0` | Milestone report under audit |

---

## 2. Mandatory Semantic Probes

### 1. Dependency Traceability (AP-074, AP-076)
- **`IAgentEngine` in `SessionCoordinator`:** PASS. Required in constructor (`coordinator.ts:46-48`), verified called in business methods: `engine.start()` (`:58`), `engine.submit()` (`:99`), `engine.events()` (`:108`), `engine.abort()` (`:121`), `engine.getState()` (`:127`), `engine.getTranscript()` (`:131`), `engine.getStats()` (`:135`), `engine.setSubagentPolicy()` (`:139`), `engine.close()` (`:150`).
- **`modelProvider`, `executionEnv`, `resourceLoader` in `SessionCoordinator`:** **FAIL ([P1] FND-T1-03).** Accepted in `SessionCoordinatorOptions` (`coordinator.ts:28-30`), stored in private fields (`:37-39, :52-54`), but **never called or read** in any method of `SessionCoordinator`. This constitutes a decorative dependency / hollow abstraction under AP-076.
- **`dependencies` in `openDurable` / `loadHarnessEnvironment`:** PASS. `executionEnvFactory`, `settingsManager`, `resourceLoader`, and `builtins` are forwarded from `composition.ts:92-97` and consumed in `runtime-loader.ts:80-140`.

### 2. Runtime Completeness & Split-Brain Detection
- **Core Decoupling & Relocation:** PASS. `packages/core/src/` has 0 `@earendil-works/*` imports and 0 `node:fs` calls. `packages/core/package.json` contains only contracts and zod. Legacy `core/src/engine.ts` and `core/src/runner-server.ts` are deleted. All 50 runtime closure files were moved into `packages/adapter-pi-durable/src/engine/`.
- **Composition vs Dispatcher Alignment:** OBSERVATION ([P3] FND-T1-09). `assembleDurableZero` implements an inline handler for 6 methods (`composition.ts:122-153`) rather than calling `createSessionDispatcher` (from parallel Task 4B). While consistent with Task 1 ruling R6 for an independent first slice, this creates a temporary split-brain with the protocol dispatcher.
- **Process Termination / EOF Handling:** **FAIL ([P2] FND-T1-06).** `StdioJsonRpcServer` attaches only `data` listener on `stdin` (`stdio-server.ts:31-33`), never listening to `end` or `close`. Closing the stdin pipe without an explicit OS kill signal leaves background processes running indefinitely (as occurred during earlier diagnostic commands).

### 3. Entry Point Wiring (AP-020, AP-075)
- **`durable-zero serve`:** PASS. `packages/cli/bin/durable-zero.js:58-62` imports `../../runner/dist/main.js` and calls `main(argv.slice(1))`, which invokes `assembleDurableZero()`, starts the stdio server, and connects to real `PiDurableEngine`.
- **`durable-zero run` and `doctor`:** **FAIL ([P2] FND-T1-07).** `durable-zero run` prints a string and immediately calls `process.exit(0)` (`cli/bin/durable-zero.js:47-56`) without running any task. `durable-zero doctor` prints hardcoded strings (`:34-45`) asserting SQLite WAL and QuickJS WASI are operational without executing any actual health checks.

### 4. Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Elimination of Fake Receipt Path:** PASS. `coordinator.ts` eliminated `const id = rec_${Date.now()}_...`. Prompts now delegate directly to `this.engine.submit()`. Native `Submission.id` and `EntryRecord.id` are distinct real integers/digit-strings.
- **Walking Skeleton Test Assertion Integrity:** **FAIL ([P2] FND-T1-04).** `e2e-walking-skeleton.test.ts:319-335` submits second prompt `"Second turn"` after restart, waits for `turn_complete`, and asserts `entryCount >= 4`. It **never asserts the content of the assistant's second reply** (`"Echo: Second turn"`) via `session/getTranscript`. Additionally, the test fails to assert that streaming deltas arrived strictly before `turn_complete`.
- **Multi-Part Streaming Content Indices:** **FAIL ([P1] FND-T1-02).** `durable-event-adapter.ts:43, 118, 122` hardcodes `contentIndex: 0` for all text and thinking deltas, overwriting incoming `change.contentIndex`.
- **Session Lifecycle / Abort Contract:** **FAIL ([P1] FND-T1-01).** `coordinator.abort()` sets `this.isAborted = true` permanently without reset, bricking all subsequent prompts with `SESSION_ABORTED`. Passing a child conversation ID bricks the root coordinator.

---

## 3. Findings

### [P1] FND-T1-01: Sticky Abort in SessionCoordinator Bricks Subsequent Prompts and Leaks Child Abort to Root
- **Evidence:** `packages/core/src/session/coordinator.ts:70-72, 120-124`. Empirically verified in `docs/arch-improvement/cycle-7/live/task-1/independent-source-review/probe-slice0-findings.test.ts` (PROBE 1).
- **Impact:** In native agent workflows, aborting halts the in-flight turn but allows the user to submit new prompts or steering messages. The current coordinator permanently sets `isAborted = true`, causing all future calls to `prompt()` to throw `SessionError("SESSION_ABORTED")`. Furthermore, calling `abort(childConversationId)` sets `this.isAborted` on the root coordinator, terminating the root session.
- **Rule:** AP-012, AP-021
- **Fix decision:** fix-now

### [P1] FND-T1-02: Hardcoded contentIndex in DurableEventAdapter Collapses Multi-Part Streaming Blocks
- **Evidence:** `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts:43, 118, 122`. Empirically verified in `docs/arch-improvement/cycle-7/live/task-1/independent-source-review/probe-slice0-findings.test.ts` (PROBE 2).
- **Impact:** Upstream `watchEvents` correctly extracts `contentIndex: i` for each block in a generation message. `DurableEventAdapter` ignores `change.contentIndex` and emits `{ contentIndex: 0 }` for all `thinking_delta`, `text_delta`, and `thinking_end` events. When a model returns thinking at index 0 and text at index 1, both are broadcast at index 0, corrupting the stream for downstream UI/clients.
- **Rule:** AP-026, AP-076
- **Fix decision:** fix-now

### [P1] FND-T1-03: Decorative Dependencies in SessionCoordinator (Hollow Constructor Injection)
- **Evidence:** `packages/core/src/session/coordinator.ts:28-30, 37-39, 52-54`.
- **Impact:** `SessionCoordinatorOptions` accepts `modelProvider?: IModelProvider`, `executionEnv?: IExecutionEnvironment`, and `resourceLoader?: IResourceLoader`. The constructor assigns them to private fields, but they are never called or read in any business method. Violates AP-074 and AP-076 by introducing decorative ports into domain Core.
- **Rule:** AP-074, AP-076
- **Fix decision:** fix-now

### [P2] FND-T1-04: Incomplete Assertion Integrity in Walking Skeleton Test Oracle (Second Turn Reply Unverified)
- **Evidence:** `packages/runner/test/e2e-walking-skeleton.test.ts:319-335` vs `docs/arch-improvement/cycle-7/live/task-1/checkpoint-report.md:73-77`.
- **Impact:** Step 10 of `e2e-walking-skeleton.test.ts` prompts `"Second turn"`, waits for `turn_complete`, and asserts `stateAfterSecondPrompt.entryCount >= 4`. It never reads `session/getTranscript` to verify that the assistant's generated second reply text is `"Echo: Second turn"` and attached to the restored conversation. Furthermore, the test does not assert that live streaming deltas were received strictly before `turn_complete` notification was delivered.
- **Rule:** AP-028, AP-076
- **Fix decision:** fix-now

### [P2] FND-T1-05: Double Disposal of Built-in Codemode Extension on Session Close
- **Evidence:** `packages/runner/src/composition.ts:167-170` vs `packages/adapter-pi-durable/src/engine/runtime-loader.ts:167-172`.
- **Impact:** `assembleDurableZero.close()` explicitly calls `codemodeBuiltin.teardown()`. However, `coordinator.close()` -> `PiDurableEngine.close()` -> `runtime.close()` -> `activeEnvState.cleanup()` -> `builtinRegistry.teardownAll()` already tears down all registered builtins. Calling `teardown()` twice on the same extension instance risks double-free errors or unhandled rejections during shutdown.
- **Rule:** AP-023, AP-074
- **Fix decision:** fix-now

### [P2] FND-T1-06: StdioJsonRpcServer Ignores Stdin EOF / Close Event (Process Hang Hazard)
- **Evidence:** `packages/protocol/src/transport/stdio-server.ts:31-33`.
- **Impact:** `StdioJsonRpcServer.start()` attaches a listener only for `"data"` on `stdin`, omitting `"end"` and `"close"`. When a parent runner or harness pipe terminates without sending an explicit OS signal, `durable-zero serve` processes hang indefinitely.
- **Rule:** AP-023, AP-059
- **Fix decision:** fix-now

### [P2] FND-T1-07: Hollow CLI Command Prototypes in Production Entrypoint ('run' and 'doctor')
- **Evidence:** `packages/cli/bin/durable-zero.js:34-56`.
- **Impact:** `durable-zero run "<prompt>"` prints a message and calls `process.exit(0)` without running an agent task; `durable-zero doctor` prints hardcoded strings claiming health without performing real SQLite or WASI checks. The CLI outputs fake success receipts.
- **Rule:** AP-059, AP-076
- **Fix decision:** fix-now

### [P3] FND-T1-08: Latent Dual-Lock Contention in SessionCoordinator if ISessionStore is Supplied
- **Evidence:** `packages/core/src/session/coordinator.ts:58-61, 148-150`.
- **Impact:** `SessionCoordinator.start()` calls `await this.engine.start(this.sessionDir)` (which acquires SQLite `session.lock` via `selectSession`), and then calls `if (this.store) await this.store.acquireLock()`. If `store` is provided, two independent locks are attempted on the same session directory.
- **Rule:** AP-034, AP-074
- **Fix decision:** log-only

### [P3] FND-T1-09: Residual Split-Brain Between Runner Inline Handler and SessionDispatcher Module
- **Evidence:** `packages/runner/src/composition.ts:122-153` vs `packages/runner/src/dispatch/session-dispatcher.ts:133-288`.
- **Impact:** `assembleDurableZero` implements an inline handler for 6 methods rather than delegating to `createSessionDispatcher` (from parallel Task 4B), which contains parameter normalizers and typed error mappings.
- **Rule:** AP-011, AP-020
- **Fix decision:** log-only

---

## 4. Architecture Verification

- **Passed Rules:**
  - `AP-010` (Modular Monolith & Ports/Adapters: `@durable-zero/core` cleanly decoupled from vendor `@earendil-works/*` packages and filesystem).
  - `AP-011` (Low Coupling & High Cohesion: domain coordination isolated from transport and concrete storage).
  - `AP-019` (Size limits & structural decomposition: clean modular structure).
  - `AP-020` (Composition root: runner owns dependency assembly and entrypoint wiring).
  - `AP-025` (Import discipline: clean package boundaries verified by AST guards).
  - `AP-029` (TypeScript strictness: no `any` leaks in Core SPI definitions).
  - `AP-075` (Walking Skeleton: true compiled CLI vertical slice execution through stdio JSON-RPC, SessionCoordinator, PiDurableEngine, and SQLite WAL).
- **Violated Rules (Failing Gate):**
  - `AP-012, AP-021` (Sticky abort in coordinator bricks session; child abort leak).
  - `AP-026, AP-076` (Hardcoded contentIndex collapses streaming deltas).
  - `AP-074, AP-076` (Decorative dependencies in SessionCoordinator constructor).
  - `AP-028, AP-076` (Incomplete walking skeleton test assertion integrity).
  - `AP-023, AP-074` (Double disposal of codemodeBuiltin).
  - `AP-023, AP-059` (StdioJsonRpcServer ignores stdin EOF).
  - `AP-059, AP-076` (Hollow CLI command prototypes `run` and `doctor`).
- **Not Applicable:**
  - `AP-051–AP-055` (Frontend / React architecture).
  - `AP-060, AP-062` (Postgres OLTP guardrails; runtime uses SQLite WAL).
- **Semantic Probes:**
  - Dependency Traceability: **FAIL** (decorative dependencies in `SessionCoordinator`).
  - Runtime Completeness: **PASS** (core runtime closure successfully relocated; AST boundary tests clean).
  - Entry Point Wiring: **FAIL** (hollow `run` and `doctor` commands in CLI entrypoint).
  - Implementation Completeness: **FAIL** (sticky abort bricks session; contentIndex collapsed; walking skeleton test omits second reply text assertion).
- **Residual Integration Risks:**
  1. *Legacy Test Migration:* Approximately 50 existing test files in `packages/core/test/` still import relocated modules. These are assigned to the parallel `task-1-test-migration` leaseholder and must be resolved before global test suites pass.
  2. *Dispatcher Integration:* `assembleDurableZero` must be updated to consume `createSessionDispatcher` once Task 4B is certified.
  3. *Host Bridge Registration:* Task 2A component `HostBridge` remains unmounted in the engine pending full Task 2 wiring.

---

## 5. Conclusion & Actionable Remediation Brief for Task 1 Author

**VERDICT: FAIL**

The Task 1 walking skeleton demonstrates genuine vertical execution (compiled CLI -> JSON-RPC -> pure domain coordinator -> native engine -> SQLite WAL persistence), real SQLite IDs, and honest live delta emission. However, candidate `fc09096` cannot be certified for acceptance due to the open P1 and P2 defects listed above.

**Targeted Remediation List for Author (`thr_tcbhyv8p4r`):**
1. **Fix Sticky Abort in Coordinator (`coordinator.ts`):** Reset `this.isAborted = false` when generation concludes or a new turn begins. Ensure `abort(conversationId)` only sets abort state on the specified child conversation, not globally on the root coordinator.
2. **Preserve `contentIndex` in Event Adapter (`durable-event-adapter.ts`):** Pass `change.contentIndex` through to `assistantMessageEvent.contentIndex` and key streaming accumulators by `contentIndex`.
3. **Remove Decorative Dependencies (`coordinator.ts`):** Clean `modelProvider`, `executionEnv`, and `resourceLoader` out of `SessionCoordinatorOptions` and class fields.
4. **Harden Walking Skeleton Test (`e2e-walking-skeleton.test.ts`):** Add step 11 querying `session/getTranscript` after the second turn to assert `restoredAssistant2.text === "Echo: Second turn"`. Assert streaming delta arrival strictly precedes `turn_complete`.
5. **Eliminate Double Teardown (`composition.ts`):** Remove redundant `codemodeBuiltin.teardown()` from `assembleDurableZero.close()` since runtime cleanup already tears down all registered builtins.
6. **Handle Stdin EOF (`stdio-server.ts`):** Attach listeners for `"end"` and `"close"` on `this.stdin` in `StdioJsonRpcServer.start()` to ensure orderly process termination when the parent pipe closes.
7. **Address Hollow CLI Commands (`cli/bin/durable-zero.js`):** Fail fast with descriptive `"not implemented"` errors for `run` and `doctor` or implement genuine checks.
