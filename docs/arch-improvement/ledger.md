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
- Architectural package structure established:
  * `@durable-zero/protocol` (independent wire package, JSON-RPC 2.0 schemas & stdio server)
  * `@durable-zero/execution` (independent execution sandbox package, LocalNodeExecutionEnv)
  * `@durable-zero/core` (pure sovereign domain engine, session lifecycle, policy store)
  * `@durable-zero/extension-pi-resource` (native Pi Durable defineExtension wrapping settings & skills)
  * `@durable-zero/runner` (TRUE COMPOSITION ROOT: wires all packages into the executable process)
- Migration Inventory Matrix defined (Preservation of 177 tests, Upstream Pi 1.5 adoption, Safe bike deletion):
  * 🟢 Preserve & Refactor: `session-storage`, `session-fork`, `policy/*`, `session-commands`, `bridge/durable-event-adapter` (with tool delta translation).
  * 🔵 Upstream Adoption: `@earendil-works/pi-agent-core` (agent loop), `@earendil-works/pi-ai` (models), `@earendil-works/pi-durable` (`watchTaskGraph`, `ownership: { kind: "task" }`), `@earendil-works/pi-codemode` (`sandbox.start()`), `@earendil-works/pi-schema`.
  * 🔴 Eliminate Bikes: `subagent-courier`, `subagent-watcher`, `host-rpc`, `stdout-guard`.
- Inbound Transport Factcheck: `@earendil-works/pi-mcp` is an outbound tool client spawning child processes; client IDE transport uses a pure, independent `StdioJsonRpcServer` in `@durable-zero/protocol`.
- 5 Sequential Arch Loop Cycles defined:
  1. Cycle 1: Package extraction (`@durable-zero/protocol` & `@durable-zero/execution`) & `ExecutionEnvFactory` strategy.
  2. Cycle 2: Dedicated Pi resource extension package (`@durable-zero/extension-pi-resource`) for `~/.pi/agent` isolation.
  3. Cycle 3: Elimination of custom task graph mappers in favor of native `harness.watchTaskGraph()` & `Bind-before-Resume`.
  4. Cycle 4: True Composition Root in `@durable-zero/runner` & unified `StdioJsonRpcServer`.
  5. Cycle 5: Deterministic Codemode Replay (`sandbox.start()`) & SQLite session document store.

### Verification Circuit Protocol
- In S9 of every cycle: Two parallel independent subagents on Gemini 3.8 Flash High (`--provider pi-durable --model antigravity/gemini-3.8-flash --reasoning-level high`).
  - Circuit 1: Semantic Architecture Review (boundaries, leak-free, failure isolation).
  - Circuit 2: Black-Box Product Review (Three Golden Journeys: Happy Path, Empty State, Error Recovery without reading code).
- Gate rule: Unanimous PASS required to proceed.

### Lessons For Memory
- Headless runtimes must never depend on interactive CLI applications (`pi-coding-agent`); pure library cores (`pi-agent-core`) ensure complete isolation.
- Upstream Pi Durable provides battle-tested primitives (`ownership: { kind: "task" }`, `ConversationTranscript`, `watchTaskGraph`) that make custom couriers and watchers obsolete.
