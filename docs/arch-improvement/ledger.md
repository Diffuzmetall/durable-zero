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

### S7 Fail-Fast & Anti-Fallback Doctrine Audit (2026-11-03)
- **Principle:** Fallbacks are architectural smell masking critical defects and causing silent data corruption. Fail-fast is mandatory.
- **Defects Remediated in Plan:**
  1. *Host UI Dialogs:* Eliminated `try { ... } catch { return null; }` in `setHostInteractionRequester`. Rejections and timeouts propagate explicitly.
  2. *Session Directory:* Eliminated silent fallback to `${cwd}/.durable-session`. `--session` is strictly required in RPC mode, failing fast to prevent lock collision across parallel IDE threads.
  3. *Malformed JSON-RPC Responses:* Eliminated silent fallthrough in `StdioJsonRpcServer`. If client returns invalid payload for pending request ID, the promise is rejected immediately with `MalformedJsonRpcResponseError`.
  4. *Model Availability:* Model resolution fails fast with `SubagentModelUnavailableError` rather than silently picking random `available[0]`.
- **Commit:** `0bdfc0a`. All 177 tests PASS.

### S8 Orchestrator Steer: Fallback Doctrine & Timeout Enforcement (2026-11-03)
- **Defect Detected by Review:** `ExecutionEnvs` in `harness-setup.ts` retained an infrastructure fallback: `else { env = new NodeExecutionEnv({ cwd }); }`, violating DIP (AP-012) and leaking concrete Node adapter into Core.
- **Architectural Law Enforced:** Fallbacks and defaults are permitted EXCLUSIVELY at the configuration / Control Plane / Composition Root layer (AP-020, AP-073). Inside Domain Core, all infrastructure fallbacks are strictly prohibited; dependencies/factories must be explicit and injected via DI/Strategy (AP-012, AP-072).
- **Steered to Worker Subthread @thread:thr_kjpmq736xf:**
  1. Update `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-012 / AP-073) with the Fallback Doctrine.
  2. Purge `NodeExecutionEnv` from `packages/core/src/harness-setup.ts`; require mandatory `ExecutionEnvFactory`.
  3. Run all tests with mandatory timeouts (`--test-timeout 10000`).
- **GBrain Updated:** Facts persisted to `arch-rules` and `arch-improvement-loop`.

### S9 Verify Gate: Dual-Circuit Review & Remediation Cycle 1.1 (2026-11-03)
- **Circuit 1 (Arch Reviewer @thread:thr_y8cr8sdwe2):**
  - Initial Verdict: FAIL (P1: `runtime.ts` relative import of `LocalNodeExecutionEnv` and hidden fallback; P2: `local-node-env.ts` exceeded 120 lines budget with 6 unused methods).
  - Remediation (Cycle 1.1): Assigned directly to Reviewer thread `thr_y8cr8sdwe2`.
  - Fixes Landed (commit `390bb5c`):
    1. Purged `LocalNodeExecutionEnv` import and `defaultFactory` from `packages/core/src/runtime.ts`. `openDurable` strictly requires `options.executionEnvFactory` (AP-012, AP-072, AP-073).
    2. Composition Root (`runner-server.ts`) explicitly injects `LocalNodeExecutionEnv`.
    3. Unit tests inject in-memory `mockEnv` without side-effects.
    4. Trimmed 6 unused methods from `local-node-env.ts` (115 lines, within <120 limit, AP-019/AP-070).
    5. Monorepo builder `scripts/build.mjs` updated to build `contracts`, `protocol`, `core`, `execution`.
  - Re-Review Verdict: **UNANIMOUS PASS**.
- **Circuit 2 (Product Reviewer @thread:thr_vg2fk6e6n6):**
  - Evaluated Three Golden Journeys (Happy Path, Empty State, Error Recovery) as a black box.
  - Verdict: **UNANIMOUS PASS** (185/185 tests, full-duplex correlation, fail-fast on malformed JSON-RPC).
- **Canonical Architecture Canon AP-074 Enforced:**
  - Added `AP-074` to `/Users/vanya/Projects/arch-rules/arch-rules.md`: Prohibiting global mutable state, singleton defaults, and side-effecting imports (commit `37f1723`). All dependencies must flow top-down via Pure Dependency Injection from Composition Root.
- **Verification Evidence:** All 186 tests passing with `--test-timeout 30000` (15.2s). All 4 packages successfully build to `dist/index.js`.

### S10 Cycle 2 Closure: Storage ACL & ISessionStore Port (2026-11-03)
- **Scope Implemented:**
  1. `packages/core/src/session/store.ts`: Pure domain port `ISessionStore` and `TaskRecord` (0 dependencies on SQLite, WASM, or `@earendil-works/*`).
  2. `packages/core/test/mocks/memory-session-store.ts`: Fast in-memory mock for unit tests.
  3. `packages/adapter-pi-durable`: ACL package implementing `ISessionStore` via native Pi Durable (`openNodeSqliteStorage`, `createSession`, `defineDocFamily`, `session.commit`, `session.snapshot`).
  4. Relocated `session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts` to `adapter-pi-durable` with backwards-compatible re-exports.
  5. Updated `scripts/build.mjs` to compile all 5 packages.
- **Anti-Bikeshedding Invariant Enforced:**
  - Audited code and Master Plan: eliminated bikeshed risks (no raw SQL tables, no fake prompt interpreters, native Pi adoption).
  - Cleaned up upcoming Tasks 3.1, 3.2, and 4.2 in `master-plan.md` (commit `9589e8c`).
- **S9 Dual-Circuit Verification:**
  - Circuit 1 (Arch Reviewer @thread:thr_67akw3q46t): **UNANIMOUS PASS** (100% native Pi adoption, zero singletons AP-074, all adapters < 120 lines).
  - Circuit 2 (Product Reviewer @thread:thr_4qeyrr38sj): **UNANIMOUS PASS** (All 3 Golden Journeys verified, 5/5 packages compiled, 188/188 tests passing in 16.5s).
- **Residual Risk:** Temporary re-export shims in `core` (`session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts`) to be purged in Cycle 4 when `runtime.ts` migrates to `runner`.

### S10 Cycle 3 Closure: Model & Codemode Adapters (2026-11-03)
- **Scope Implemented:**
  1. `packages/core/src/models/provider.ts`: Pure domain port `IModelProvider` and `ModelRef` (0 vendor dependencies).
  2. `packages/core/src/tools/sandbox.ts`: Pure domain port `ISandboxExtension` and `ISandbox` (0 vendor dependencies).
  3. `@durable-zero/adapter-pi-ai`: Encapsulates `ModelRuntime`, `resolveCliModel`, `SettingsManager` from `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai`.
  4. `@durable-zero/adapter-codemode`: Encapsulates native `CodemodeSandbox` from `@earendil-works/pi-codemode` and `createCodemodeExtension` from `@earendil-works/pi-durable/codemode`.
  5. Relocated `model-setup.ts` and `builtin-extensions/codemode.ts` with backwards-compatible re-exports.
  6. Updated `scripts/build.mjs` to compile all 7 packages.
- **Mandatory Skill Activation Enforced:**
  - All worker and reviewer prompts mandate explicit `read` of TDD, verification, and arch-rules skills at startup. Worker @thread:thr_5et8kc3tqz and reviewers verified compliance.
- **S9 Dual-Circuit Verification:**
  - Circuit 1 (Arch Reviewer @thread:thr_76jt3im82x): **UNANIMOUS PASS** (100% native Pi adoption, AP-074 pure DI, all files < 120 lines, DAG package graph).
  - Circuit 2 (Product Reviewer @thread:thr_vf3idxn5hc): **UNANIMOUS PASS** (Three Golden Journeys verified, clean sandbox teardown, 7/7 packages compiled, 196/196 tests passing in 14.8s).
- **Residual Risk / P3 Observation:** In `PiAiModelProvider.resolveModel`, accept `modelId` as synonym for `model` and support string references (`provider/model`). Safe for subsequent refinement.

### S10 Cycle 4 & 4.1 Closure: Sovereign Domain Coordination & Pi Resource Extension (2026-11-03)
- **Scope Implemented:**
  1. `@durable-zero/extension-pi-resource`: Declarative resource & settings extension using `defineExtension` from `@earendil-works/pi-durable` and `SettingsManager`/`DefaultResourceLoader` from `@earendil-works/pi-coding-agent`.
  2. `packages/core/src/session/coordinator.ts`: Pure domain coordinator `SessionCoordinator` operating strictly on ports (`ISessionStore`, `IModelProvider`, `IExecutionEnvironment`, `IResourceLoader`). 0 database, SQLite, or WASM dependencies. Pure constructor DI (`SessionCoordinatorOptions`).
  3. Updated `scripts/build.mjs` to compile all 8 packages (`contracts`, `protocol`, `core`, `execution`, `adapter-pi-durable`, `adapter-pi-ai`, `adapter-codemode`, `extension-pi-resource`).
- **S9 Dual-Circuit Verification & Remediation (Cycle 4.1):**
  - Initial Circuit 1 (Arch Reviewer @thread:thr_pvxxv7nnzv): **PASS** (Pure ports, zero singletons, all files < 120 lines).
  - Initial Circuit 2 (Product Reviewer @thread:thr_z274vg6dkj): **FAIL** (P1: `prompt()` accepted after `close()` without lock; P2: `prompt()` before `start()` silently auto-started; P2: `createPiResourceExtension()` threw TypeError without options).
  - Remediation Cycle 4.1 (@thread:thr_kwizs25xch): Landed commit `7f7b99a` fixing all 3 defects via strict TDD (Red -> Green).
  - Re-Review Circuit 2 (@thread:thr_m83nee7n7m): **UNANIMOUS PASS** (All P1/P2 defects confirmed fixed, 202/202 tests passing in 14.8s, 8/8 packages compiled).

### S10 Cycle 6 Closure: Pure Core Decoupling, Executable Runner & Zero Boundary Leaks (2026-11-04)
- **Scope Implemented:**
  1. `packages/protocol/src/transport/request-dispatcher.ts`: Decomposed `StdioJsonRpcServer` by extracting request/response parsing and outbound promise tracking into `RequestDispatcher` (86 lines). Reduced `stdio-server.ts` to 88 lines (< 120 limit, AP-019).
  2. `packages/runner/src/main.ts`: Implemented executable CLI entrypoint for `@durable-zero/runner` (43 lines, AP-020, AP-021) with signal trapping (`SIGINT`, `SIGTERM`), unhandled exception/rejection safety handlers, and clean session unlock. Configured `"bin": { "durable-runner": "./dist/main.js" }` and updated `scripts/build.mjs` to bundle executable with WASM assets.
  3. `packages/adapter-codemode/src/codemode.ts`: Purged module-scoped mutable singleton `export const codemodeExtension` and `export default` in compliance with AP-074. Updated tests to use factory `createCodemodeBuiltinExtension()`.
  4. `packages/core`: Eliminated all inverted cross-package boundary shims (`session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts`, `model-setup.ts`, `builtin-extensions/codemode.ts`). Replaced relative `../../adapter-*` imports with canonical `@durable-zero/adapter-*` imports via pnpm workspaces.
  5. `packages/core/package.json`: Decoupled core from all `@earendil-works/*`, `quickjs-wasi`, and `proper-lockfile` dependencies. Core now depends strictly on `@durable-zero/*` and `zod`.
  6. Aligned CLI package version to `0.8.1` in `packages/cli/bin/durable-zero.js` and `packages/cli/test/cli.test.ts`.
- **Verification Evidence:**
  - `npm run build`: All 9 packages + `runner/dist/main.js` build with code 0; `quickjs.wasm` copied to `packages/core/dist` and `packages/runner/dist`.
  - `npm test -- --test-timeout 30000`: **205/205 tests PASS (100% green)** across 13 suites in 16.0s.
  - Line budgets: All 25 files across all adapter packages are strictly under the 120 lines budget (AP-019/AP-070).
  - Singletons: Zero top-level mutable singletons in adapter packages (AP-074).

### Cycle 7 — Task 1 S7 preflight and bounded execution authorization (2026-11-04)

- User authorization: start Task 1 / Slice 0 in a separate **pi** subthread while the remaining plan is finalized. This is NOT approval of Tasks 2–6, a release, a merge, or a global S7/S9 PASS.
- Base: `5b15b5e` on `cycle-7-runtime-adapter-ioc-migration`; the plan author's existing uncommitted canonical-plan edits are preserved and excluded from code ownership.
- Frozen Task 1 brief SHA-256: `d95945724e6ce77c3c7c43754c31d2fd862ba17f93db993bc1d45c6ab85c7b67`. Parent retains orchestration; plan author owns only canonical plan; the new implementer owns Task-1 source/tests/build changes. Parent owns this preflight entry; implementer may append Task-1 execution evidence below it.

#### Shared-file/interface preflight

| Tasks | Producer → consumer / shared surface | Finding and ruling |
| --- | --- | --- |
| 1 / 2 | Optional `IHostBridge`, composition, relocated extension UI → reverse RPC | R1: Task 1 creates required pure bridge types but does not require Task-2 concrete HostBridge. |
| 1 / 3 | Engine lifecycle/main → no-session composition | Normal session first; probe branching remains Task 3 and must not acquire storage before its capability check. |
| 1 / 4 | Typed engine/RPC methods/events → full method dispatch and conformance | R2/R3: Slice 0 includes its own executable request handlers/event schemas; full protocol taxonomy remains Task 4. |
| 1 / 5 | Closure/import/export/build relocation → final boundary guard | R4: atomically repair the actual closure now; no temporary adapter↔core/adapter↔adapter cycle waiting for Task 5. |
| 1 / 6 | Fresh compiled CLI + focused E2E → final verification gate | R5: genuine RED/GREEN, model-only substitution, real native persistence and restart now; whole-cycle acceptance later. |
| 2 / 3 | Host bridge versus no-session capabilities | Host-only operations may work without a session; session operations return typed capability errors. |
| 2 / 4 | Host request/response schemas → bidirectional dispatcher | Distinct RPC hops retain distinct correlation ID spaces; no BB migration. |
| 2 / 5 | Injected bridge/extension contracts → boundary cleanup | No core imports of runner or adapter implementations. |
| 2 / 6 | Host tool/interaction E2E → final product verification | Real model-issued tool call, response consumption and continued output required. |
| 3 / 4 | Probe method registry → JSON-RPC errors | Unsupported session capabilities are domain errors, not malformed envelopes. |
| 3 / 5 | Probe composition → pure core | Catalogue use must not instantiate/acquire session storage. |
| 3 / 6 | No-session executable → probe acceptance | Later gate checks no session-directory or lock creation. |
| 4 / 5 | Method/event schemas → package boundaries | Transport DTOs stay in contracts/protocol; no SDK types leak into core. |
| 4 / 6 | Standard errors/notifications/batches → conformance suite | Existing protocol defects remain explicit Task-4 work, not a present compliance claim. |
| 5 / 6 | Boundary/typecheck/build scripts → final gates | No green result through stale dist, excluded tests, duplicate runtimes or hollow stubs. |

#### Task self-consistency scan

| Task | Test/code/file consistency |
| --- | --- |
| 1 | Executable with R1–R7 below; stale examples are superseded, not silently copied. S7 selected-slice gate passes with these binding technical rulings. |
| 2 | Scope coherent; detailed final plan acceptance remains pending. Numeric reverse-RPC test IDs must come from injected ID source, not guessed server IDs. |
| 3 | Scope coherent; validate capability gating before stateful composition in its own S7. |
| 4 | Scope coherent; must define explicit additive transcript query and terminal schemas produced by Task 1. |
| 5 | Cannot defer dependency-cycle repair required to execute Task 1; residual pure-core cleanup only remains later. |
| 6 | Final acceptance is not established by the current planning audit or author report. |

#### Binding Task-1 rulings

- **R1 — Bootstrap dependencies:** optional bridge dependency is absent until Task 2 or backed by a minimal fail-fast unsupported boundary, never a fabricated HostBridge or legacy wire singleton. Create required pure interface files/exports in Task 1. No automatic-success stub. Native extensions are assembled with actual exported factories and valid options. Remove concrete Codemode creation/import from relocated harness setup: composition supplies builtins, so the chosen one-way `adapter-codemode → adapter-pi-durable` type dependency cannot form a cycle. Define any used `ISandboxExtension` signature explicitly or retain the existing adapter-owned factory contract without inventing a new decorative port.
- **R2 — Native identity and readback:** root wire ID is `"1"`; parse wire IDs at the adapter boundary using existing validated conversion, never pass arbitrary strings to native numeric IDs. Native admission uses `Submission.id`, transcript uses `EntryRecord.id`; never conflate them. Public `session/getTranscript` returns typed entry IDs and user/assistant text. Its limit/window semantics are explicit; `entryCount` called a total must paginate all native `conversation.entries()` pages, not count only the first 50. Restart assertions compare the same native entry IDs and exact user AND assistant output.
- **R3 — Real typed events:** retain existing canonical `RunnerEvent` stream (`message_update.assistantMessageEvent.type === "text_delta"`, text in `.delta`), not the draft's invented top-level text-delta object. The additive `turn_complete` notification must be declared in contracts schemas/types/exports and implemented from native `Submission.wait()` settlement, correlated by its actual admission ID; it is never emitted merely on admission or local event counting. Extend only the necessary contracts/bridge/dispatcher consumers. Preserve existing event payloads.
- **R4 — Mechanical closure:** inventory and `baseline-import-graph.json` are evidence, not a fixed 50-file target. Move/split the actual runtime executable dependency closure, update ALL affected imports/exports/tests/package dependencies/build entries atomically, including pure CLI option types moved inward if needed. Do not make adapters import runner or concrete core. Preserve native runtime logic, policy, hooks, watcher/cancellation behavior and existing tests; no feature deletion, wholesale rewrite or dual production runner.
- **R5 — Real offline oracle:** test provider loads through public `--extension <ABSOLUTE fixture path> --provider scripted-e2e --model echo`. A public coding-agent extension registers the native provider via actual `ExtensionAPI.registerProvider(provider)`; ModelRuntime then consumes pending native provider registration. Do not assume a public `runtime.registerNativeProvider` extension method and do not import fixtures into production. Use real Harness/SQLite/CLI transport; isolate subprocess HOME/agent/settings/session paths to temporary directories, deny/observe unexpected network use, and assert a second distinct prompt gets its own generated reply after restart. Capture real RED before implementation and GREEN after; focused tests/commands bounded to 60s, tests to 30s except the explicitly justified 60s two-process E2E.
- **R6 — First-slice runnable wiring:** implement minimal `session/prompt`, `session/getState`, `session/getTranscript` handlers and canonical `session/event` delivery now; these are Task-1 prerequisites, not something deferred to Task 4 while an E2E only mocks dispatch. Broader method conformance/host registration/probe remains later. The actual CLI imports runner's callable main and builds fresh output; no production test switch. Signal cleanup must release the same engine-owned lock exactly once.
- **R7 — Acceptance and parallel ownership:** implement Task 1 only. New technical ambiguity gets a bounded source-backed ruling, not another whole-plan rewrite. No changes to canonical plan/master plan, skills, provider plugin, original session databases, live deployments or releases. No push until remote visibility/authorization is verified. Implementation is NOT accepted until parent inspects the diff and independent architecture + product circuits pass; the author must not spawn reviewers or additional workers.

- **Global design assessment:** mature native runtime retained behind sovereign contracts; one composition root, acyclic adapters and one JSON-RPC transport is the intended direction. No proven global design blocker requires postponing this bounded vertical slice. Known remaining plan work is not relabeled as completed or as permission to execute later tasks.
