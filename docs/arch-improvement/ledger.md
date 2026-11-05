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

### Cycle 7 — Parallel protocol defect slice (Task 4A) S7 / execution handoff (2026-11-04)

- Latest user authorization: execute only the three JSON-RPC defects in a separate **pi** subthread concurrently with Slice 0. This supersedes the earlier Task-1-only authorization for this bounded subset, NOT for all of Tasks 2–6.
- Owner split: protocol worker owns `packages/protocol/src/jsonrpc/schema.ts`, new `jsonrpc/errors.ts`, `transport/request-dispatcher.ts`, additive export in `protocol/src/index.ts`, `protocol/test/protocol-conformance.test.ts` and only necessary adjustments in `protocol/test/protocol.test.ts`. Slice-0 worker owns runner/core/adapter/contracts/CLI/build and must not edit these reserved paths. The plan author owns only canonical plan. Parent is sole ledger writer; workers supply handoff reports/logs, not concurrent ledger edits.
- Review evidence: existing source and earlier in-process probes confirm notification rejection with a response instead of execution/silence, method-not-found classified as internal error, and response schemas accepting both result and error.
- Architecture: stateless protocol-envelope repair; no model/session/storage/host-tool orchestration, no SDK dependency and no new transport. Public server/options/MethodHandler/request lifecycle signatures remain unchanged.

#### Preflight and rulings

| Shared surface | Producer → consumer | Ruling |
| --- | --- | --- |
| Stdio server + MethodHandler | Existing protocol API → Slice-0 composition | Freeze all existing public signatures and transport lifecycle behavior. Notification executes the same handler without creating a response or fake ID. |
| Method-not-found error | New protocol error → runner fallback | Add `JsonRpcMethodNotFoundError(method?: string)` with code `-32601`; dispatcher recognizes it by type. Slice-0 worker updates its own runner fallback. Generic exceptions remain `-32603`; no guessing from error strings. |
| Response schema → outbound tracker | Zod validation → pending promise settlement | Enforce exactly one of result/error by field presence, not truthiness. Preserve valid null/false/zero/empty-string results and existing pending cleanup/correlation. |
| Shared tests/build output | Two source writers → final acceptance | Protocol runs focused source-level node:test only, no build/dist/package/lock edits. Parent coordinates final whole-repo verification after both writers reach checkpoints. Temporary other-slice RED is not evidence of a regression in this slice. |
| Task 4A → full Task 4 | Three fixes → remaining conformance/dispatch work | Full batches/positional params/capability preservation/host/probe are not added to this slice or claimed complete. |

- **Selected S7 verdict:** bounded Task 4A is executable with the above fixed ownership/contracts. No acceptance of the implementation is claimed.

#### Written execution plan — Task 4A

- [ ] Add focused behavioral tests in `packages/protocol/test/protocol-conformance.test.ts`; record genuine RED with existing imports before production fixes (not a missing-module/compile failure).
- [ ] Notifications: assert handler is actually called and no response is emitted, including when the handler rejects; preserve request IDs `0` and `""` as requests, and do not classify an object with an `id` field as an ID-less notification.
- [ ] Responses: reject neither/both result/error; preserve valid falsy results and native pending-outbound resolution/rejection/timeout cleanup. Ensure a void handler serializes a valid success result (`null`), not an envelope missing result on JSON serialization.
- [ ] Add typed method-not-found error/export and a behavioral failing test for its current erroneous mapping before changing that catch path. Map only this explicit condition to `-32601`, other handler errors to `-32603`; preserve `-32700` for malformed JSON and `-32600` for invalid requests.
- [ ] Implement the smallest repairs only in owned files. Existing reverse request/response routing must remain functional; do not respond to unsolicited responses as though they were requests.
- [ ] Run focused new + existing protocol tests with 30s per-test / 60s command bound; save separate RED/GREEN JUnit/log artifacts under worker thread storage. No network/model calls or user-session writes.
- [ ] Self-review scoped diff; report exact owned files, test artifacts, compatibility/integration concerns to parent. Leave source uncommitted for separate mechanical checkpoint. Parent arranges independent architecture + product/transport verification before acceptance; no worker-spawned reviewers, release, merge or push.

### Cycle 7 — Parallel HostBridge component (Task 2A) S7 / execution handoff (2026-11-04)

- Latest user authorization: implement isolated HostBridge in a separate **pi** subthread only if it does not hinder the other slices. Full host/Harness integration remains excluded.
- Exclusive new files: `packages/core/src/tools/host-bridge.ts`, `packages/protocol/src/methods/host.ts`, `packages/runner/src/host/host-bridge.ts`, `packages/runner/test/host-bridge.test.ts`, `packages/protocol/test/host-methods.test.ts`. No other edits. Slice 0 relinquishes the pure SPI file but retains core index/composition/build/adapter ownership. Protocol Task 4A retains schema/errors/dispatcher/index and its two existing test paths. Parent alone owns ledger.

#### Frozen component contract

- Pure `IHostBridge` matches Canonical Design Amendment §5: `forwardToolCall(toolName: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>` and `requestInteraction(kind: string, payload: { title?: string; message?: string; data?: unknown }): Promise<unknown>`. It imports no SDK or I/O. The interface-only file may be created early to unblock the existing Slice-0 type consumer; runtime implementation remains TDD-first.
- `HostBridge` receives an injected requester with the EXISTING `request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown>` signature. Constructor options are `{ requester, timeoutMs?: number }`; default timeout is 30,000ms and a provided timeout must be finite and positive. Production passes a bound existing server request capability; tests may use the real stdio server.
- `forwardToolCall` delegates to `host/toolCall` with `{ toolName, arguments: args ?? {} }`, validates the returned payload with `hostToolResultSchema`, and preserves `isError` results rather than converting them into success.
- `requestInteraction` delegates to `host/interaction` with `{ kind, ...payload }`; response contract is an opaque JSON value (including null), validated as JSON, NOT unrestricted `z.unknown()` and NOT a claim that a user approved anything. No coercion/fabricated approval on rejection or timeout. Known UI semantic integration remains later.
- **Ruling:** transport owns wire IDs, pending promises and timeouts. HostBridge passes its timeout as the existing third request argument; it creates no IDs, extra pending map, tracker, second timer or global singleton. This supersedes the plan's misplaced HostBridge `idSource` example; component tests capture and echo actual emitted IDs, never assume numeric 101.
- Schema module owns typed host request/result payload schemas and exports locally. Keep the existing text-content result contract, reject malformed payloads and non-JSON arguments/data at the boundary. Do not change public protocol/Core index files; Slice-0/integration owner exports the pure port when needed. A type-only Core public import may be integrated once its owner adds the export; structural contract compatibility does not justify editing another owner's index.

#### Preflight

| Shared surface | Producer → consumer | Finding / ruling |
| --- | --- | --- |
| Core bridge SPI | Host component → optional Slice-0 dependency | Transfer this single new file to HostBridge owner now; exact signature frozen above. Slice 0 does not need a concrete bridge instance. |
| Stdio requester | Protocol server → HostBridge | Existing public method unchanged; no protocol transport/index ownership overlap. |
| Host schemas | New host module → isolated bridge tests | New files only, independent of Task-4A envelope fixes. |
| Composition / Harness / dynamic tools | Component → later full Task 2 | DO NOT wire now, delete legacy host code, modify extensions, or create `tools/register` integration. |
| Test identity and acceptance | Existing real server → component assertions | IDs observed from output; response ordering/timeout tests require actual pending cleanup. Full model-issued tool E2E remains later and is not replaced by component tests. |

- Selected component S7: coherent under these contracts and disjoint ownership. It is not a global plan approval, full Task-2 completion or runtime acceptance.

#### Written execution plan — Task 2A

- [ ] Load required Arch Loop/TDD skills and confirm exact dirty-worktree ownership. Write focused component tests first; missing-module failures alone are not sufficient behavior evidence.
- [ ] Validate new host schemas with meaningful valid/invalid payload assertions; keep RED and GREEN artifacts distinct.
- [ ] Implement only the new pure port, payload schemas and HostBridge requester adapter. Test real requests `host/toolCall` and `host/interaction`, validated results, malformed result rejection and propagated transport errors.
- [ ] Using real `StdioJsonRpcServer` with isolated in-memory streams, test two concurrent reverse calls answered out of order, actual-ID correlation, short configurable timeout, and server-close rejection. No live process/session/model or network is required.
- [ ] Run owned source-level tests within 30s per test / 60s per command. Do not build shared dist, change package/lock files or edit other workers' tests; parent coordinates final combined build/suite acceptance.
- [ ] Self-review; report exact five-file scope, behavioral RED/GREEN and readiness/integration concerns. No commits, new subagents, merge, push, release or S9 PASS claims. Parent handles independent review and later Harness integration.

### Cycle 7 — Protocol Task 4A candidate checkpoint / S9 running (2026-11-04)

- Author `thr_45qtxkivss` returned DONE; parent inspected the actual five-file diff and verified persisted JUnit evidence (RED: 13 cases / 8 failures; GREEN: 22 cases / no failures). This is author evidence, not independent acceptance.
- Separate mechanical candidate checkpoint: `ad122ffc9a7bf63c73a516d19fb07afcabeb7781`; only protocol index/schema/error/dispatcher/conformance-test paths committed. Other writers' WIP remains uncommitted and preserved.
- Separate bounded builder command bundled the candidate public protocol entry into an isolated package artifact, retaining original package exports. Public package self-reference import verified. No shared dist, live services, original sessions or model calls used.
- Provenance/build/source hashes: parent thread artifact `protocol-candidate-manifest.json`; full scoped review package `protocol-review-package.diff`. The artifact is a candidate, not a release.
- Independent S9a architecture/spec reviewer: `thr_xduha42zcy`, provider pi; report expected `protocol-architecture-review.md`.
- Independent S9b black-box product/transport reviewer: `thr_tqge89d4m5`, provider pi; consumes only compiled package exports/stdio, never implementation source or diff; report expected `protocol-product-review.md`.
- State: S9 PENDING. No PASS until both circuits return sound evidence and parent adjudicates all P0–P2. No full JSON-RPC conformance, runner integration or whole Cycle-7 acceptance claimed. Existing source author context retained for bounded remediation if needed.

### Cycle 7 — Parent counterexamples / first bounded remediation rounds (2026-11-04)

- Protocol S9a returned PASS, but parent ran a real compiled-public-package counterexample: an ordinary Error renamed `JsonRpcMethodNotFoundError` yields `-32601`, not required `-32603`. Source: dispatcher name-only fallback; artifact `protocol-named-generic-probe.json` in parent storage. P2 fix-now (AP-022/AP-026); prior S9a PASS is NOT sufficient for acceptance. Task 4A fix round 1/5 returns to original author `thr_45qtxkivss`; typed identity only, focused behavioral RED/GREEN, then scoped re-review and rebuilt public artifact. S9b original candidate verification remains independent.
- HostBridge five-file candidate checkpoint: `8e42698`; other writers' WIP preserved. Parent observed real call `requestInteraction("confirm", payload with kind:"notify")` delegate kind `"notify"`. Artifact `hostbridge-kind-boundary-probe.json`. P2 fix-now (AP-022/AP-026).
- **Ruling:** explicit interaction `kind` argument is authoritative; payload only supplies title/message/data and cannot override it. This supersedes the unsafe literal `{ kind, ...payload }` example in the Task-2A plan/dispatch. Fix by selecting declared payload fields or rejecting a conflicting extra field; no Harness integration or UI semantic expansion.
- HostBridge report's initial RED for both modules is `ERR_MODULE_NOT_FOUND`, not the specifically required behavioral oracle. Keep this historical evidence honestly labeled. P2 verification gap (AP-028/AP-076): original author `thr_ynjrjkqgnx` must provide genuine existing behavioral RED artifacts or do a bounded, truthful behavioral RED/GREEN redo with preserved checkpoint and valid test-loadable unimplemented boundaries, plus the new kind-override regression. Never relabel import failure as behavioral proof.
- HostBridge fix round 1/5 stays within its five files. Independent source review follows the corrected candidate/evidence; full compiled public-surface/Harness acceptance remains a later integration gate, not a fake package export manufactured for a PASS.
- Both candidates remain unaccepted. This is not a release, global S9 PASS or authorization for more implementation slices.
- Independent protocol S9b `thr_tqge89d4m5` returned **FAIL** on the frozen `ad122ff` compiled package: Happy Path and Cold Start PASS; Error Recovery fails on exactly the same renamed-generic-error P2. Report `protocol-product-review.md`, findings `protocol-product-findings.json`, wire logs/JUnit in parent storage. This is additional independent evidence for the existing finding, NOT a second defect or a new fix round.
- Task 4A: minor (deferred): S9a notification-error diagnostic observability (dispatcher:69–71), AP-023, log-only; consumer handler can log, no wire response permitted. Task 4A: minor (deferred): small repeated ID extraction expression (dispatcher:48/78), AP-019, log-only. Final whole-branch review should see these observations; they do not expand the fix round.

### Cycle 7 — Fixed component adjudication and WIP preservation checkpoint (2026-11-04)

- Protocol Task 4A fix round 1: `f3fff38a84154a36f017514c234421aef5215ced`; isolated public-package SHA256 `24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514`. Parent read architecture and compiled-product re-review reports: both PASS; the renamed-generic-error P2 is closed for this bounded package scope. Full runner dispatch and whole Cycle-7 acceptance remain pending.
- Protocol evidence correction retained: actual behavioral RED contains 37 cases including 13 host-schema cases, exactly one targeted failure; targeted GREEN contains 24 cases. Historical original-candidate FAIL remains valid history, not the fixed-candidate verdict.
- HostBridge Task 2A: `efc9eab7ddfba4ba95fb754329d33f05adda2c12`. Parent read component architecture report: scoped PASS, no open P0–P2. Kind-override regression corrected; genuine valid-boundary RED/GREEN redo distinguished from original import failures (13 schema + 23 bridge GREEN). Both parent P2s closed in component scope. Public exports, composition/tools registration, Harness and full model-issued host-tool E2E remain pending full Task 2.
- Host P3 observations: raw ZodError propagation is log-only (AP-022); recursive JSON schema performance is unmeasured, not a demonstrated performance defect (AP-015).
- User explicitly requests backing up all current valuable work, including unfinished migration. Remote visibility verified PUBLIC using `gh repo view VanDalkvist/durable-zero --json visibility,nameWithOwner,url`; explicit user push instruction authorizes this branch backup. It does not authorize release, merge, plugin install/reload or global PASS.
- Slice-0 author `thr_tcbhyv8p4r` confirmed HOLD_FOR_CHECKPOINT and source-write quiescence. Source, tests, manifests/lockfile and tracked generated artifacts are checkpointed AS IS as WIP. Build has succeeded; latest recorded walking-skeleton E2E is a 60s timeout/cancel, not GREEN. Author report is not independent acceptance.
- Read-only architecture source snapshot: 2026-11-04 22:21:47 +0300, HEAD f3fff38 + WIP; 71 TypeScript files in the relocated adapter runtime closure. File counts do not prove preserved behavior. Parent artifacts: `durable-zero-architecture-status.html`, `.json`, `architecture-map-source-snapshot.json`.
- Current WIP observations: optional-engine coordinator still returns synthetic rec_... accepted without execution (AP-012/AP-075/AP-076); composition creates resourceExt but does not forward its settings/resource loader (AP-074/AP-076); getStats returns constant contextWindow 128000 rather than runtime metrics (AP-026/AP-076); abort leaves a sticky coordinator guard, requiring explicit abort/reuse contract verification (AP-021/AP-028). These are unaccepted WIP observations, not released-regression claims or authorization to expand into Tasks 2–6.

### Cycle 7 — Unbounded diagnostic command incident (2026-11-04)

- User identified stalled command item `dae7c4713f-i1880`. Parent verified Node PID 85512, parent shell 85511, exact runner/dist/main.js and temporary /tmp/test-session-4 arguments. Debug wrapper printed `assembleDurableZero resolved!` and a native graph notification, but retained the long-lived stdio server/watchers without teardown or OS timeout for approximately 15 minutes. This does not prove main() itself never resolved or that the BB provider session needed replacement.
- Parent sent SIGTERM only to that verified debug Node and verified process disappearance. Provider process, thread/context and unrelated jobs untouched. Same-context steer reached original author, who returned HOLD_FOR_CHECKPOINT. No context reset, new worker, blind retry or expanded scope used.
- Bounded diagnostics and failure-path cleanup remain obligations in existing Slice 0. The map task did not justify leaving a silent owned command unmonitored; the user, not proactive parent monitoring, noticed this stall.

### Cycle 7 — Remote backup verified (2026-11-04)

- WIP checkpoint `7d4b2351bcd143b2fabf001c3bfd896198cb396c` preserved the full 185-path migration working set, including persisted tests and tracked dist, plus prior protocol/HostBridge fixes on branch `cycle-7-runtime-adapter-ioc-migration`.
- Normal non-force push succeeded. Independent `git ls-remote origin refs/heads/cycle-7-runtime-adapter-ioc-migration` equals the local checkpoint SHA; working tree was clean immediately after checkpoint. Parent evidence: `durable-zero-checkpoint-manifest.json`, `durable-zero-checkpoint-verification.json`, push log. Secret-shaped filenames/content checked before staging. No tests or global acceptance fabricated to justify the backup.
- Preservation does not complete Task 1. Current authorized critical path remains bounded Slice 0 execution and independent native end-to-end acceptance. Newly proposed parallel work requires its own ownership/contracts and authorization; full Task 2/3/4 still share composition/native seams and must not be dispatched to competing writers.

### Cycle 7 — Delivery correction and next bounded parallel scopes (2026-11-04)

- Latest user corrections: all deliverables must live in normal versioned project paths, not hidden thread internals; commit/push immediately, including WIP/public repositories, without waiting for consistency or acceptance. Canonical delivery contracts recorded in project/workspace AGENTS.md. Backup remains distinct from acceptance.
- Architecture HTML/SVG/structured findings promoted to `docs/arch-improvement/cycle-7/architecture/` and pushed at `6891b73`; render inline from the workspace, not an inaccessible storage link. [Artifact index](cycle-7/README.md).
- User explicitly requested the missing further worker launches and reminded parent to delegate instead of becoming the bottleneck. New bounded scopes are now dispatched on provider pi / Gemini 3.8 Flash High, with canonical reading and source-backed contracts in [handoffs](cycle-7/handoffs/).
- Artifact curator `thr_tpdann8gpi`: cycle-7 architecture/reviews/evidence/audit/historical/manifests/README only; exclude handoffs/live/ledger/product source. Promote all project deliverables and repair portable links; never publish raw private harness/brain/env dumps. Return saved batches for immediate parent checkpoint.
- Task 4B owner `thr_4yhrgipwed`: new runner dispatch modules and capability-dispatch tests; required protocol transport/schema/error changes and tests, excluding host method/schema tests. Frozen factory `createSessionDispatcher({coordinator, engine})` consumes actual existing public contracts. No Core/native/composition/CLI/build/dist edits. Missing binding/fork/admin seam requires an explicit source-backed ruling, not fabricated support. No full Task-4 PASS claimed.
- Task 5A owner `thr_rhrzagp727`: only new Core architecture-boundaries test/helpers/fixtures. TypeScript AST guard covers forbidden imports, package DAG/re-export cycles and actual CLI entrypoint. No edits to production owners' code; report actual live RED rather than weaken rules. This is a guard subset, not full Task-5 acceptance.
- Original Slice-0 author `thr_tcbhyv8p4r` resumed in the same context with existing critical path, latest WIP findings and the new file reservations. It remains sole composition/main/CLI/Core/native adapter/shared-build owner, excluding newly reserved tests and dispatcher/protocol files. No replacement author/context reset. Independent final review remains pending.
- All new reports/evidence land under cycle-7/live/<scope>/; no worker writes shared ledger or spawns agents. Parent owns mechanical commit/push of useful milestones immediately, even when RED/WIP, and subsequent independent acceptance. New thread launch ACK is not evidence of implementation progress.

### Cycle 7 — Guard and curation milestones backed up; independent acceptance pending (2026-11-04)

- Checkpoint `07609af56742247003414564463cc99ebd0ac89f` is pushed and remote ref verified. It preserves Task-5A guard source/fixtures/evidence, 106 packaged deliverables and concurrent Slice-0/Task-4B WIP. No consistency, full tests or acceptance gate delayed the backup.
- Task-5A author returned 23 passing tests and source-write HOLD. Parent inspected checker/report source rather than promoting the author PASS to independent acceptance. Leads requiring adversarial verification: CLI audit computes but does not enforce callsMain; live workspace graph uses manifest dependency lists, not source/re-export edges; report-generation test writes unconditional PASS/zero-violation values independently of sibling test results. Scope is NOT accepted until these are independently adjudicated.
- Independent reviewer `thr_tpkhmzqjar` dispatched on pi / Gemini 3.8 Flash High against frozen `07609af`, not moving live source. Exclusive output: `cycle-7/live/task-5-guards/independent-review/`; no candidate/source edits or overwriting original receipts. Original author remains same-context remediation owner. [Review brief](cycle-7/handoffs/task-5-independent-review.md).
- Reported old Core build script/stale dist cleanup is logged for critical adjudication; no unverified production impact or whole-Task-5 completion inferred from this test-only milestone. No source/data deletion authorized by the report alone.
- Curator milestone promoted source-relative renderer, immutable source snapshot, review/audit/test evidence and portable index. Parent independently parsed both SVGs and all 29 HTML links: zero broken targets. This is structural validation, not a browser-based visual acceptance claim.
- Curator continues the SAME packaging scope to verify manifest hashes and promote both frozen compiled protocol candidates and public consumer test sources (without node_modules/private harness dumps). No new packaging workflow or duplicate writer. [Artifact index](cycle-7/README.md).
- Pi launch blocker resolved by user-authorized removal of BOTH global and workspace semantic-skill-loader installation symlinks; original extension source retained. New workers have actual file-read/command receipts after retry, not just launch ACKs. Source/evidence: cycle-7/live/orchestration/pi-launch-blocker.json and worker-startup-verification.json.

### Cycle 7 — Native milestone, dispatcher review and guard fix round 1 (2026-11-04/05)

- Native author milestone saved/pushed at `d74abb8f78676cf40d66b27291c4fee6e87828e9`: CLI admission with native submission ID, reported model invocation, native settlement and turn_complete observed; live assistant text_delta still absent. This is author-observed partial execution, NOT successful full walking skeleton. Native transcript readback, clean shutdown, stable EntryIds after restart and a second distinct reply remain unproven. Original author continues the single live-event bridge fix with actual SDK/source verification and genuine live-before-settlement evidence; no post-hoc fake deltas from committed output.
- Task-4B source candidate saved/pushed at `49bcad1486a5101e20e8b88a616cc175a34fc3e9`. Author reports 61 source tests; actual historical behavioral RED receipts exist (protocol seq267; dispatcher seq328), distinct from earlier syntax/import failures. Independent source reviewer `thr_khtnehz4vz` and separate compiled-component builder `thr_kbp6d8trbt` dispatched against frozen candidate; neither author GREEN nor builder success is product acceptance. Fresh black-box reviewer follows a usable compiled artifact.
- Task-4B missing binding/register, binding/list, session/fork and tools/register seams remain unmet whole-cycle requirements. No speculative IBindingStore/ISessionAdmin interface or edits to native/Core owner are approved in this bounded dispatcher scope. Explicit unsupported errors are honest limits, not capability preservation. Stats routing does not validate the native metric placeholder.
- Independent guard reviewer `thr_tpkhmzqjar` returned FAIL on frozen `07609af`, evidence saved/pushed at `b2b485b2d57099f86a86493c087a7905fe07506f`: three P1s (hollow/nonexistent CLI target accepted; manifest-only graph misses source/re-export cycles; unconditional successful report) and one P2 (literal template/import-equals/source-extension omissions). Parent accepted blockers and returned fix round 1/5 to original author `thr_rhrzagp727`; exact brief in cycle-7/handoffs/task-5-fix-round-1.md. Original evidence immutable; independent-review subtree remains reviewer-only. Reported stale Core build leftovers adjudicated P3 log-only, not a demonstrated production defect.
- Review evidence qualification: some original probes faithfully reproduce inlined graph/report logic rather than execute the full original failing runner. Reviewer is providing an isolated real-candidate mutation/run supplement; this limit is not hidden behind the 9/9 adversarial-probe result. Fixed-candidate tests must expect rejection, not merely repeat assertions demonstrating old bad behavior.
- Project artifact inventory promoted and backed up at `71e6b520865c9274d603dac932c24c8ea7d9eeac`. Parent independently checked manifest paths/hashes and HTML links. A false original-bundle checksum in README/validation prose was caught despite byte-integrity checks; actual bundle remained intact. Corrected assertions and deterministic generator pushed at `8b49eb039023a253ef81c0adbb2e2528714743a1`; parent verified 118 manifest entries and exact original/fixed bundle hashes. Remaining hardcoded count/causality/global-quiescence claims are being removed in the same curator scope; no package-wide PASS inferred from checksums.
- All useful checkpoints are pushed immediately, including red/WIP states. Acceptance remains separate. No full Cycle-7 S9 PASS, release, merge or plugin deployment.



### Cycle 7 — current evidence/status refresh (2026-11-05)
- User requested updated AS IS/TO BE status. Current page/JSON/SVG refreshed; old page/renderer/manifest retained under cycle-7/historical/architecture-before-native-green. Historical source snapshot bytes unchanged.
- Native fc090960: genuine author12 focused cases including compiled CLI/Harness/live stream/SQLite/restart. Native source review thr_addwwk3xem and separately built frozen CLI are not global acceptance. Fresh native product reviewer follows on real artifact, model boundary only scripted.
- Contracts->adapter old concrete fork re-export (efec0439) removed by original native owner: pure ForkSessionDatabaseOptions moved into contracts; source native13 and DAG guard30 GREEN author receipts at live/task-1/fix-round-1. No global clean-workspace claim accepted.
- Test consumers remain part of atomic Task1, not postponed loss of coverage. thr_t38ban9s79 batch1 moved11 suites, adapter41 cases GREEN. Remaining batches retain same bounded test-only lease; no skips/coverage erasure.
- Dispatcher original compiled artifact has independent49 cases/5 failure assertions (one nominal identity defect). Fix ea21bf5 has actual60 source cases GREEN. Same source reviewer thr_khtnehz4vz and builder thr_kbp6d8trbt resumed for frozen fix round1; fresh compiled product re-review still pending. Root runner export is not required for internal factory; full wiring/admin seams still pending.
- Guard2d0 initial independent PASS amended FAIL after parent critical check + actual four focused probes proving three false greens: unrelated main, absent main export, substring package membership. Also1128-line synchronous multi-role helper violates AP019. Original author thr_rhrzagp727 assigned round2/5; exact prior evidence preserved. Actual DAG/report improvements remain valid, not a blanket checker acceptance.
- Outstanding full-cycle gates: host tool continuation, bindings/fork/tools registration, no-session probe, real metrics/lifecycle abort-reuse/globals isolation, clean build/typecheck/full regression, independent architecture/native product acceptance on one final candidate. No release/deploy/merge.


### Cycle7 — independent source/native findings and guard round2 checkpoint
- Task4B reviewer reports behavioral architecture PASS on ea21; parent confirms exact source bytes for dispatcher/normalizers and genuine author60 tests. Its separate six-probe JSON conditions are true, but manually emitted JUnit uses unmeasured0.005 times and probe command never fails for pass:false. Parent evidence acceptance pending bounded reviewer harness correction; original author assigned removal/correction of false prose timestamps. Follow-ups queued by host10/10 limit, not claimed started.
- Task4B fixed compiled artifact ce718a... has independent real Node reporter46/46 PASS (fixture component, not Native Harness/SQLite). Preserve original49/5fail history; no full native/composition acceptance implied.
- Native source fc090 independent reviewer thr_addwwk3xem FAIL: sticky root/child abort, collapsed contentIndex, decorative Core dependencies, weak second-reply/stream ordering oracle, double builtin teardown, EOF lifetime and fake run/doctor success. Parent verified native registry teardown chain; EOF repair assigned to runner lifetime owner, not another writer's protocol. Latent second store lock promoted from P3 to P2: canonical plan29-30 explicitly forbids it. Original source author receives these SAME original-candidate remediation round1 findings; no new admin/host/probe scope.
- Guard author round2 saved modular implementation and30 authored green cases; unaccepted until same independent review on new frozen candidate. Three former counterexamples must reject; callable export/actual serve condition/exact package and export resolution must be empirically checked, not inferred from names.


### Cycle7 — independent gated native minimum / guard R3 / component gates
- Frozenfc090 independent native product9/9 PASS: actual completion barrier held during wire delta, exact second reply in same process, both turns restored with identical EntryIds/text, third full reply after restart. Source Native review remains FAIL; no waiver of lifecycle/DI/multi-block/EOF/oracle fixes. Custom test reporter measures each case and sets exitCode1 on failure; no invented times.
- Task4B evidence correction verified: real independent Node6 and60 reporter files, failing negative control(exit1), author timestamp retraction. Together with fixed compiled46/46 black-box PASS, bounded component acceptance granted; no Native, wiring or admin capability acceptance implied.
- Guard author R3 candidate c248e6c4 preserved and same reviewer resumed; R2 canonical verdict remains FAIL until confirmed structural cases close. e006 contracts-cycle claim corrected: actual frozen graph cycles[].
- Parent command check found no overdue owned commands after native diagnostic recovery; test migration batch3 and native source fix continue in separate leases.


### Cycle7 — parent callable-target counterexample against reported Guard R3 PASS
- Independent R3 reviewer reported PASS, but parent executed actual frozen c248 runner-verify helper with genuine Node assertions/reporter:4cases,3failures,exit1. Primitive-producing call, primitive identifier and primitive named re-export are all falsely accepted; real exported function positive succeeds. Evidence under live/task-5-guards/parent-adjudication/round-3. Guard scope remains FAIL/P2, routed to original author round4/5; no false final acceptance from literal-only tests or 'mathematically sound' language.
- Native fix source1298 preserved; original native source reviewer and separate fresh builder resumed on1298. Old fc090 native minimum9-case product PASS retained, source fixes not yet accepted. Docs-only native product follow-up failed MALFORMED_FUNCTION_CALL; inspected provider/error then supported same-context retryattempt2 (no app regression/DB mutation).
- Migration batch3 ready: scope/91-case adapter evidence saved, remaining batches use same owner and exclusions.


### Guard R4 closing verification
- Source475745bb preserved; TypeScript Compiler API now resolves exported symbol/call signatures, old blanket heuristics removed. Parent exact frozen-helper replay:4cases/0fail/exit0; same R3 test matrix previously4/3fail/exit1. Both historical results preserved. This closes known parent counterexamples, not a blanket source/native PASS.
- Same independent guard reviewer resumed on frozen475745bb; source author HOLD. No extra features, roles or release/deploy scope opened.


### Native1298 product re-review / closing residual source path
- Fixed compiled Native1298 (runner090b6c...) independent product11/11 PASS: gated reasoning0/text1, full replies and restart identity, clean ready-server EOF, root abort-active-turn->continued real prompt. This does not certify child multi-turn catchup.
- Source1298 independent re-review closed seven original blockers; one P2 FND-T1-10 remains: child message_end stale currentText replays complete second-turn text at index0. Parent inspected exact source and empirical probe; original native author assigned bounded round2/5, preserve genuine per-block missing-tail catchup and remove stale scalar references. No broader native/admin/host/probe expansion.


### Task5A R4 bounded acceptance
- Parent verified genuine independent Node22/0 JUnit and helper/CLI exact byte match to475745bb, alongside exact parent4/0 replay. Known blocking guard findings closed; Task5A infrastructure PASS in checked/supported structural scope. No 'mathematically sound for all JS'/blanket global proof claim.
- P3 unused legacy build script tracked. Task5 whole clean build/typecheck/full-suite gates and Native residual child-stream P2 remain open. No new development scope opened; continue closing already-owned work.


### Native Source R2 acceptance / fresh compiled R2 verification
- Sourcead99873e same independent reviewer PASS, all selected P1/P2 Native findings closed; physical Core/parent/child files match frozen source and probe4/0 reporter verified. Component/source scope only; atomic consumer migration/full gates remain open.
- Separate native builder produced fresh sourcead99873e CLI exact byte match, runner76ec126543cc131986cdc12246f8fdd0a35a596d62c6a7a235ff9c0857f1b05c physically verified. Artifact preserved before same independent product reviewer resumed on fresh R2. Old9-case and R1 11-case native proofs remain pinned to old artifacts, not automatically transferred.
- Continue closing already-started scope; no new host/probe/admin features, provider/model changes, merge/release/deploy authorized.


### Native minimal dual-circuit acceptance (fixedR2)
- Parent verified fresh compiled Native productR2 measured11/0 JUnit and physical runnerSHA76ec126543cc131986cdc12246f8fdd0a35a596d62c6a7a235ff9c0857f1b05c matching frozenad99873e build. SourceR2 same-candidate scoped PASS already verified. Minimum Native CLI/Harness/SQLite path accepted in BOTH independent circuits.
- This is not overallTask1 atomic closure or Cycle7 PASS: final legacy test/consumer inventory, clean build/typecheck/root regression still required; host/probe/full admin/capability integration remains outside accepted minimal scope. No release/merge/deploy.


### Closing audit BLOCKERS and bounded parallel remediation
- Independent clean build from zero outputsPASS, but production-only strict tsc diagnostics113 and noofficialtypecheck script/config BLOCK final acceptance. Roottsc783 includes intentionalfixtures/docs; not conflated with113actualproduction diagnostics. No 'technicaldebt later'/esbuild halo accepted. Audit preserved with raw logs/config.
- Parent split existingclosing work into non-overlapping leases: original native A core/native/execution (~84diagnostics), original dispatcher B runner/contracts/pi-ai/protocol/roottypecheckconfig (~29). Preserve strict flags; no any/suppression/blanket optional widening. Actual IExecutionEnvironment vs SDK ExecutionEnv/async factory mismatch requires sound adapter/effect validation, not type cast; pureCliArgs/sharedDTO coordinated byB. No new feature/admin/host/probe scope.
- Migrator final root347/353 (6fail) is NOT closure. Parent read five allegedly obsolete files and counterparts: codemode installation, underlying sandbox.close calls, multiple CLI extensions and custom plugin+subagent coinstallation were not all equivalently covered. Retarget/preserve actual assertions; do not delete/weaken forgreen. Lease extensions precise sandbox test inadapter-codemode and extension-cli-multi test inrunner; B excludes thatfile. Facade oldmethod names map to actual newport intentionally, encapsulation concern must be reported not erased. Remaining abort test assignedB.


### Closing preservation: B70f4a88 + Aecf7c69 (no release/install)
- B source/config29-error remediation preserved70f4a88; parent genuinely reran subset90/0failed (not fullsuite), officialprodtypecheck stillFAIL. Independent same-context B review assignedthr_khtnehz4vz on frozen Bdelta; pending.
- A batch1 savedecf7c69868c34b6fb0bc5a30b083f4de8a1ce075 on sameGitHubbranch; author84->56 diagnostics captured, not full acceptance. Parent requests corrections to newstore any, emptyexecfile binary fallback, honest branded-ID/GraphScope identity provenance, and unsupportedfresh-test claims (20/30 historical wildcard labels lack matchingnewrawreceipts). Original frozenad998 native gates do not transfer automatically.
- Node fallback for arbitrary custom pureenv rejected: forwarding three methods while25-method FS/Context/Result contract falls through tohost violates actual injected env semantics. A to provide primary-source bounded typedseam/ruling request and finish independent option fixes inparallel; no casts/stubs/fakeunsupportedSuccess.
- All commits are WIP SOURCE/DOC backups in cycle-7-runtime-adapter-ioc-migration, packageversion0.26.31 unchanged; no npm publish, BB install, merge or release performed. Source/test leases and final integration gates retained.


### B scoped source acceptance; migrated facade harness incident recovered
- Independent B review retained PASS after correcting provenance: real Node90/90 +5/5 measured receipts/negativeexit1, B14 source/config/test files hashmatch referenceecf7. Probe4 is mocked dispatcher delegation, not realCore lifecycle; actual90subset provides Coreabort integration. Runtime imports live/mixed, historicalad998 build is NOT freshbuild. Parent accepted B ONLY via runner-foundation/parent-acceptance.json; globalNative/types/fullsuite gates remain pending.
- Migrator exactcommanditemdae7c4713f-i6627 hung31m after20.78s testFAIL; no per-testtimeout (--test-timeout=0), no failure-safeengineclose. Verifiedownedroot65489 child65490 spawnedtelegram-mcp65514 dueunisolatedHOME/cwd/SDKconfig. Parent terminatedONLYverifiedownedtree (allgone), preservedprovider85708/contexts/unrelatedjobs. No assertionaboutactualexternaltoolcalls/messages; onlyprocesslaunchobserved. Recoveryreceipt saved. Sameworker orderedstrictisolatedharness+finallyclose+outer60s bound; sourcefailuremustreportnotweaken. This is harnessincident, not successfulacceptance.


### Consumer root regression360/359+1 and preserved failing facade requirement
- Parent parsed actual root-test-final.junit.xml:360cases, one real boolean encapsulation failure, no SDKobjectdump in receipt. TSprivate `.instance` is runtime-visible raw OpenDurableResult; original Native A owns#private/WeakMap repair, not migrator. No testweakening/skip. Rootnotgreen, wholeNative/currentcandidate notaccepted.
- Migrator movedlastfive legacy suites but 'zero coverage loss' still NOT accepted: canonicalcodemode test4 fabricates namedcodemodetool returningemptycontent rather than realfactory; parent requires actualpubliccodemode builtin/delegatedspy+teardown. Facade currently staticimportsSDK beforeenv isolation and omits actualruntimecwd; require dynamicimport/ownedtemp cwd and exactenv restoration incldeletepreviouslyabsentkeys. Testonlycorrections assignedsameworker, no sourceoverlap.
- Copied testfixtures durable-1.3.sqlite provenance verified BYTEIDENTICAL to alreadytracked core fixture, sha256b7eb3aad81976e502b9f0bca5106b4505bad6c5d8bbefcc702916c574501814b, not original/privateuserdatabase. This WIP testcheckpoint preserves realred; not finalclosure.


### Live root regression GREEN after three test corrections
- Parent parsed genuine freshNodeJUnit360cases/0fail/0skip and accompanying specsummary17.4s. Test4 usesrealcodemode source-entryfactory withdelegatingregisterspy/teardown (notfake namedtool); facade dynamicallyimportsSDK afterisolatedHOME/dirs, explicittemp runtimecwd, finallyclose and exactenvrestore. Assertions retained. Greenreceipt copiedtoimmutable root-regression-green-360.*; original FAIL remains in priorGit history/parentadjudication.
- Green is LIVE/MIXED: includes NativeA's uncommitted#instance encapsulation fix and otherinflighttypechanges, not currentremote/frozenbuildacceptance. Parent requested immediatebounded A checkpoint/HOLD to preserveexactsource before finalindependentgates. No inheritedad998 compiled/nativePASS, no release/install/globalCycleacceptance.


### Source e855 preserved; measured2 type errors and R8 closing ruling
- Parent froze/preservedall A23sourcefiles+exec adapter/newtestfixtures/docs at e855a045ba291fa5d3a505a2c2294f6be8feb5a8, remoteverified. Officialwholeprodtsc rawexit2/EXACT2 EnvABI diagnostics; correctedroot360/0receiptincluded, no release/install/versionbump. A/B releasedonlyforR8 seam; independentNative sourceprecheck onfrozene855 and productR3fixturepreparationassignedoriginalcontexts; oldad998 nativePASS nottransferred.
- Canonicalplan R8 added: actualfullSDKnativefactory(Context/async) outsideCore, NodeExecutionEnvdefaultinRoot; atmostoneexplicitfactory; Core6compatibilityonlysemanticallyrepresentableoperations with realtypedunsupportederrors. No text->arbitrarybinary conversion, nonatomicappend/truncate/rename emulation, guessedhostpaths orhostfallback. Oneverifiedcleanupowner/asyncawait/rootenvpreparedforsyncSDKgetter. Default/customnativeeffects +customCore nohostfallback tests +freshpublicnativebuiltinI/O gate required; nonewfeature/admin/HostRPC scope.
- Sourceannouncementqualification: AannouncedNativeExecutionEnvFactorybeforeactualfilehits; parentprematurelyrelayed'actualexportschecked' despite rgNOhits, correctedBimmediately andrequiredpersistedreadback. ABIagreeddoesnotmeanavailableexport; no typingcasts tohideabsence.
- Historicalreceiptqualification: parentearlierparsed360/1, but workerupdatedfixedfilenamesbeforebackup and Gitb84rawXMLactually360/0. Parentadjudicationexplicitlysuperseded; no preservedraw360/1XML/fabricatedREDclaimed. Rawold353/6 and actualparent360/1observationsremainseparatefromlatestgreen.


### Independent e855 non-Env source precheck preserved
- Reviewerthr_addwwk3xem reports no NEWnonEnvP0-P2, overallPRECHECKFAIL solelyknownFND-T1-12/2EnvABI diagnostics. Parent verifiedall12SHA256inventoryclaims againstactualfrozengitblobs and measuredNodeJUnit5/0. ActualNativefactorypublicexport subsequentlyreadbackconfirmed, distinctfromearlierprematureannouncement.
- Samecontextreceiptqualification requested (not newcodeaudit): runtimeprobesimportlivesource, notisolatedarchive; Coreportmethodnames corrected; invalidJSONprobe doesn'tmeasurevalidSQLiteWALwrites/symbols; onechildindex0suffixcase doesn'tprovefreshfullmultiturn/indices. Historicalnative/sourcegates remainpinned, futureR8bytesneedfreshchecks. No newacceptancehalo or universallyprovenclaims.


### Final source freeze7e12, productionequivalent08c6; independentgates delegated
- ParentofficialTSCexit0verified andsourceAconsolidatedresidualfixes preserved08c6fd172bc90061a3e265745f183c1725c1d010. FinalBtest/docscheckpoint7e12fa592a7de537ade6424f1b1a8a9aa4e6b648 includesactualRootstartup Core/nativefactoryinvocation/effects, nativeSDK24requiredmethodqualification, properawaitResult andlazyMockEnginecase; production/src/pkg/lock/buildinputs BYTEIDENTICAL08c6. Remoteverified.
- OLD2cc authenticindependentreviewnow18cases/17FAIL/1baselinePASS acrosssame4groups; notnewgroups. SourceAreportedfixedresiduals structurederrorcodes/unknownkind/closingfactorydrain+legacyfactoryvalidation/refusalofcancellableCoreShell. SameindependentSourceReviewerreplaysALL18againstEXACT08c6/7e12code, notmovingworktree orold2ccstate. Semanticgate remainsunaccepteduntilreceipt.
- Originalmechanicalbuilderauthorizedisolatedfrozen7e12(or08c6identicalprodwithhonesttestrevisionqualifier) cleanbuild, separateofficialtypecheck, fullrootNativeNodeJUnit andactualnewCLI/runnerhash. SourceR3productreviewerprepared5continuoussamePID/restart/abort/error/readjourneys; nativeNodeJUnit+hardtimeouts+ownedclientcleanup+envallowlist. AuthenticallyfailingR2native-read expectedcorrectassert/exit1 preserved; oldobservationalexit0lognotTDDRED. No appsource read/productfaketools/newfeatures/release/install.
- Bstartupfixturehang(13m, missingtesttimeout/stdinhandles) recoveredONLYowned4062/4065; provider98922preserved, noMCPdescendantobserved. In-memorystreams/finallycleanup fixed, source/timingclaimsqualified; futureNativecommandsrequirehardOSdeadline.


### Independent Root R8 bounded PASS
- Parent verified genuine independentNode6/6 authorseamrerun +4/4 additionalRootprobes, realnegativeexit1. Factoryflagsassertedtrue inactualnativeRootstartup, no MockEnginebypass fortheseselectioncases. Staticcomposition/runnerpkg/lock bytes exactlymatch653referenceand7e12candidate; sourcehashesrecorded. ParentacceptedRootselection/dependencyseam ONLY.
- Runtimeprobeslive/mixed, fileeffects viaactualcreatedenvironmentnotHarness-tool; directdefaultSDKclassmethodinspection notproofcompiledreadfixed. Teardownexceptionfaultcasesnotproved(swallowedcloseerrorsinprobehelpers). Thesequalificationsnotnewproductclaims; SourceA18fixedreplay+isolatedbuild/type/fullroot+freshcompiledR3publicI/O stillpending.


### Native source + compiled R3 product bounded PASS; isolated root remains5FAIL
- ParentverifiedindependentR8fixed18/18 vsfrozenold18/17FAIL, exacthelperf71/cdsha; NativeSourcePASS accepted08c6/production-equivalent7e12. Two incorrectliteralhashes inreceivedfinalreport correctedmechanicallyfromgitblobs; receivedoriginalretainedhistorical; correct-referenceaudit separates2cc/e855 historyfrom7e12.
- PhysicalR3runnerfb8b86fbfa034858c000617d86dc574c5757bc6fdb8b4033eac9ad1eb7d17136 /CLI dd4705... acceptedbyactualindependentpublicNodejourneys8/8/exit0, 7.2s nativeJUnit/spec/rawwire. ToolreadisErrorfalseandactualownedsentinel returnedthroughHarness; providerfixtureonlyemitsmodel/toolcalls andconsumesrealtoolResult, no fake tool/engine/fs. ProductagentquotaerroroccurredAFTERcompletedphysicalrun. Parentboundedproductacceptance saved; fullTask1/Cycle7notaccepted.
- Coldmechanicalgitarchive7e12offlinefrozenlock/cleanbuildPASS/separateTSC0 succeeded. Fullroot374:369PASS/5FAIL(notexcusedknown):4 PiAItestsimplicituserauthcatalog +1 staleasyncenvconsumer. Exacttest-onlyowners B/migrator; noprod/APIchanges authorized.
- GeminiHighquota hit5contexts; no model/provider/effortswitch orforcedretries. Operatorthenconfirmedquota restored; originalB+migrator resumedviaretryattempt2 tocomplete5testtail. Other source/product receipts preserved, no needreconsumecompletedwork. BuilderwillrerunfinalisolatedrootonceTESTONLYcandidatefrozen. PublicartifactREADME nowstdio/WIP/externaldependencyboundaryqualified, notsocketdaemon/standalone/npmrelease.


### STAGE CLOSURE ACCEPTED — not fullCycle7 / release
- Frozenproduction7e12fa592a7de537ade6424f1b1a8a9aa4e6b648 andtestcandidate513d37264c364cdcb733d3da7677911627d8c964 byteidenticaloutsideTESTS/DOCS (parentverifiedallchangedpaths). SourceR8independent18/18, Root6+4, cleanbuildexit0, officialtypecheckexit0, actualcompiledR3public8/8inclrealbuiltinread, andfreshisolatedcoldroot374/374/0skip allverified. Parentstage-closure-acceptance.json recordsboundaries/evidence.
- R3physicalrunnerfb8b86fbfa034858c000617d86dc574c5757bc6fdb8b4033eac9ad1eb7d17136 retained, CLI dd4705...; pkg0.26.31/SDK1.5.0 distinguishedfromsourceSHA. Fivepriortestfailuresfixedwithoutprodchanges/skips/privatecredentials: realSDKfauxProvider/fakekey/offlinerefresh +awaitnativeenvAPI/context. Bothworkspaceandcoldisolatedruns374green; historicalfailreceiptsretained.
- This closes ONLYstartedcomponent/native/testclosurestage. FullCycle7capabilityparity/fullDispatcherproductionmount/adminseams/nativeHostBridgehosttoolcontinuation/no-sessionprobe remainNOTaccepted/unstartedhere. No merge/release/npm publish/BB installationperformed. PreserveallparallelWIP; no globalgitclean/reset.

### Conditional integration authorization — user, 2026-11-05
- Direct instruction: «Смержи потом всё в мейн с новым тегом как закончишь.»
- After the agreed work is finished and integration-ready acceptance is green, the parent is authorized to merge `cycle-7-runtime-adapter-ioc-migration` into `main`, create a new version tag following repository conventions, and push the result. Do not reuse or move an existing tag, force-push, discard parallel WIP, or treat this as immediate permission to merge an unfinished scope.
- Current bounded-stage PASS is not full Cycle 7 acceptance. Before integration: refresh remote/base refs, account for the remaining agreed scope, verify the exact merged tree, and choose an unused version tag. npm publication and BB installation are separate actions, not implied by this Git merge/tag request.
- Memory write accepted: request `de2f2412-e78c-5812-8f59-379c227387dc` (publishing asynchronously); no duplicate writes.
