# Arch Improvement Ledger — durable-zero

## Cycle 0 - 2026-11-03 - Sovereign Core, Strategy Patterns & DIP Master Roadmap

### Context
- Repository: `/Users/vanya/Projects/durable-zero`
- Branch: `main`
- Stage: `active` / `infra_harness`
- Architecture baseline: `~/Projects/arch-rules/arch-rules.md` (AP-010 – AP-073)
- Governing standard: `arch-improvement-loop` & `superpowers`
- Core directive: Sovereign Headless Runtime. Ports & Adapters (Hexagonal). Strategy Pattern (AP-072). Separation of Declaration from Configuration (AP-073). Zero backwards-compatibility shims.

### Baseline Findings
- [P1] Tightly coupled execution environment: `harness-setup.ts` hardcodes `new NodeExecutionEnv()`, preventing pluggable sandboxing (Docker, `pi-env`, remote SSH).
- [P1] Leaky transport & custom RPC: `RunnerRpcChannel` and `HostRpcManager` implement ad-hoc framing over stdout with string splitting, risking protocol corruption on unhandled logs.
- [P1] Heavy CLI coupling: 18 files import `@earendil-works/pi-coding-agent` (pulling terminal themes, interactive prompts, and `~/.pi/agent`), violating headless isolation.
- [P1] Redundant subsystem bikes: `subagent-courier`/`watcher` (~500 lines) and `runtime-graph-*` (~400 lines) duplicate native Pi Durable task ownership and `watchTaskGraph()`.
- [P2] Non-deterministic codemode execution: `sandbox.execute()` lacks replay journaling and session-backed `store`/`load` persistence.

### Architectural Roadmap Established
- Master plan created: `docs/superpowers/plans/2026-11-03-durable-zero-sovereign-core-master-plan.md`
- Master knowledge page committed to GBrain: `architecture/durable-zero-dip-and-improvement-roadmap`
- Strict Hexagonal Architecture (Zero Vendor Invasions in Core):
  * `@durable-zero/core` (PURE DOMAIN: ZERO `@earendil-works/*` dependencies! Declares `ISessionStore`, `IModelProvider`, `ICodemodeRunner`, `IToolRegistry`).
  * `@durable-zero/protocol` (JSON-RPC 2.0 schemas, types, Full-Duplex `StdioJsonRpcServer` with bidirectional `request()`).
  * `@durable-zero/execution` (LocalNodeExecutionEnv & MockExecutionEnv).
  * `@durable-zero/adapter-pi-durable` (ACL: SQLite, PID safety, session forks, task graphs).
  * `@durable-zero/adapter-pi-ai` (ACL: models catalog, streaming, agent loop).
  * `@durable-zero/adapter-codemode` (ACL: QuickJS WASM sandbox, deterministic replay).
  * `@durable-zero/extension-pi-resource` (ACL: `~/.pi/agent/settings.json`, skills).
  * `@durable-zero/runner` (TRUE COMPOSITION ROOT: wires all adapters into core, assembles binary).
- Separation of Tests:
  * Pure unit tests in `packages/core/test/` run against In-Memory mocks in < 50ms.
  * Integration tests with real SQLite, locks, and WASM live in `packages/adapter-*/test/`.
- Migration Inventory Matrix defined (Preservation of 177 tests, Upstream Pi 1.5 adoption, Safe bike deletion):
  * 🟢 Preserve in Core: `policy/*`, `subagent-policy-ack.ts`, `task-tokens`, `task-labels`, pure `SessionCoordinator`.
  * 🟢 Preserve in Storage Adapter: `session-storage`, `session-fork`, `session-lock-eviction`, `bridge/durable-event-adapter` (with tool delta translation).
  * 🔵 Upstream Adoption: `@earendil-works/pi-agent-core` (agent loop), `@earendil-works/pi-ai` (models), `@earendil-works/pi-durable` (`watchTaskGraph`, `ownership: { kind: "task" }`), `@earendil-works/pi-codemode` (`sandbox.start()`), `@earendil-works/pi-schema`.
  * 🔴 Eliminate Bikes: `subagent-courier`, `subagent-watcher`, `host-rpc`, `stdout-guard`.
- Inbound Transport Factcheck: `@earendil-works/pi-mcp` is an outbound tool client spawning child processes; client IDE transport uses a pure, independent Full-Duplex `StdioJsonRpcServer` in `@durable-zero/protocol`.
- 5 Sequential Arch Loop Cycles defined:
  1. Cycle 1: Leaf Packages: Full-Duplex `@durable-zero/protocol` & Pluggable `@durable-zero/execution`.
  2. Cycle 2: Storage Anti-Corruption Layer (`@durable-zero/adapter-pi-durable`) & Core `ISessionStore` Port.
  3. Cycle 3: Model & Codemode Adapters (`@durable-zero/adapter-pi-ai` & `@durable-zero/adapter-codemode`).
  4. Cycle 4: Pi Resource Extension (`@durable-zero/extension-pi-resource`) & Sovereign Core Purification (Zero Pi in Core).
  5. Cycle 5: True Composition Root (`@durable-zero/runner`) & Build Pipeline.

### Verification Circuit Protocol
- In S9 of every cycle: Two parallel independent subagents on Gemini 3.8 Flash High (`--provider pi-durable --model antigravity/gemini-3.8-flash --reasoning-level high`).
  - Circuit 1: Semantic Architecture Review (boundaries, leak-free, failure isolation).
  - Circuit 2: Black-Box Product Review (Three Golden Journeys: Happy Path, Empty State, Error Recovery without reading code).
- Gate rule: Unanimous PASS required to proceed.

### Lessons For Memory
- Headless runtimes must never depend on interactive CLI applications (`pi-coding-agent`); pure library cores (`pi-agent-core`) ensure complete isolation.
- Upstream Pi Durable provides battle-tested primitives (`ownership: { kind: "task" }`, `ConversationTranscript`, `watchTaskGraph`) that make custom couriers and watchers obsolete.

### S7 Plan Review Update — Source Code Cross-Validation & Critical Findings (2026-11-03)
- **Review Trigger:** Deep cross-audit with real source code in `durable-zero`, `bb-plugin-provider-pi-durable`, and `@thread:thr_p7w657innr`.
- **Finding 1 (Streaming Event Pipe):** `SessionCoordinator.prompt()` returns an admission receipt; real-time streaming deltas (`item/agentMessage/delta`, `tool_execution_*`) require explicit pipe from `coordinator.events(...)` to `transport.sendNotification("session/event", event)` in `assembleDurableZero()`. Integrated into Task 5.1.
- **Finding 2 (Host Tool Delegation Bridge):** Full-duplex `request("host/toolCall")` requires dynamic tool definition proxying for client-hosted tools (`AskUserQuestion`, IDE tools). `setupHostToolBridge()` and `forwardHostToolCall` re-exports integrated into Task 5.1.
- **Finding 3 (Process Topology & CLI Arguments):** BB IDE launches 1 process per thread with `--session <path> --cwd <dir> --provider <p> --model <m> --thinking <t>`. `parseCliArgs()` relocated to `@durable-zero/runner` to ensure 1 Process = 1 Thread = 1 DB Lock invariant. Integrated into Task 5.1.
- **Finding 4 (Crash & Lock Cleanup Lifecycle):** SQLite WAL and `.lock` files must not dangle on unhandled rejections/exceptions. `main.ts` wires `SIGTERM`, `SIGINT`, `uncaughtException`, and `unhandledRejection` to `await runner.close()`. Integrated into Task 5.1.
- **Plan Updated & Committed:** `dcb9a0d`. All 177 tests PASS.

### S7 Global Architecture Alignment Audit (2026-11-03)
- **Review Question Framework:**
  1. *Core Identity vs Inner Platform:* Verified that `@earendil-works/pi-durable` is the domain runtime engine, while `@earendil-works/pi-coding-agent` is the toxic CLI dependency being eliminated.
  2. *DIP & Package DAG:* Verified strict acyclic flow: protocol & execution -> core (pure domain) -> adapter-* -> runner (composition root).
  3. *Downstream Invariants:* Verified subpath exports (`durable-zero/runner`, `./core`, `./contracts`), `forwardHostToolCall` bridge, and CLI arg parsing.
  4. *End-to-End Streaming:* Verified `coordinator.events(...) -> transport.sendNotification("session/event")`.
  5. *Process Topology & AP-013:* Verified 1:1:1 invariant (1 process = 1 thread = 1 DB lock) and graceful shutdown on crashes.
  6. *No Placeholders Invariant:* Replaced Step 2 in Task 4.2 with concrete, compilable `SessionCoordinator` class.
- **Commit:** `304d4b3`. All 177 tests PASS.

### S7 Abstraction Leak Audit & Elimination (2026-11-03)
- **Defect Found:** `piResourceExtension?: unknown;` in `SessionCoordinatorOptions` directly leaked vendor extension identity into domain Core. Additionally, `codemodeRunner` and `executionEnv` were loosely typed as `unknown` instead of their declared domain ports.
- **Fix Applied:**
  1. Replaced `piResourceExtension` with pure domain port `resourceLoader?: IResourceLoader`.
  2. Strongly typed all `SessionCoordinator` dependencies using Core domain interfaces: `ISessionStore`, `IModelProvider`, `ICodemodeRunner`, `IExecutionEnvironment`, `IResourceLoader`.
  3. Eliminated circular adapter re-export in Task 2.2 (`forkSessionDatabase` re-exported exclusively in `packages/contracts` and root subpath exports, keeping `@durable-zero/core` 100% pure).
- **Commit:** `ad72d63`. All 177 tests PASS.
