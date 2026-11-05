# Cycle 7: Sovereign Core Decoupling, Runtime Adapter Migration & JSON-RPC 2.0 Walking Skeleton Plan

> **Status:** Candidate DRAFT — awaiting independent S7 review by parent thread (`thr_9yjb93iwmn`) and subsequent user approval. Implementation is strictly blocked until approval is granted.
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `durable-zero` into a sovereign, modular headless agent runtime by migrating the real agent execution closure out of `@durable-zero/core` into `@durable-zero/adapter-pi-durable` as `PiDurableEngine` implementing domain SPI `IAgentEngine`, unifying client transport on strict Full-Duplex JSON-RPC 2.0 over stdio with bidirectional Host Tool Calling (`host/toolCall`, `host/interaction`) and probe mode (`--no-session`), eliminating legacy ad-hoc framing (`runner-server.ts`, `host-rpc.ts`), and proving end-to-end durability via a live Walking Skeleton (Slice 0) before dependency decoupling.

**Architecture:** Monorepo package-level Hexagonal Architecture (Ports & Adapters, AP-010). Core defines pure domain SPI ports (`ISessionStore`, `IAgentEngine`, `IExecutionEnvironment`, `IResourceLoader`, `IHostBridge`) and high-level FSM coordination (`SessionCoordinator`). All `@earendil-works/*` harness, subagents, event bridge, stdout guards, and host RPC machinery live strictly in `@durable-zero/adapter-pi-durable`, `@durable-zero/protocol`, and `@durable-zero/runner`. Reverse RPC for host-provided tools is handled symmetrically over JSON-RPC 2.0 via Constructor Dependency Injection without mutable module singletons (AP-074).

**Tech Stack:** Node.js 22+ ESM, `@durable-zero/protocol` (JSON-RPC 2.0 stdio server & client), `@durable-zero/core`, `@durable-zero/adapter-pi-durable` (`@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-ai`, `@earendil-works/chord`, `@earendil-works/pi-coding-agent`), `@durable-zero/runner`, Zod (^4.6.7), `node:test`.

**Spec & Authority:**
- Primary Design Spec: This document supersedes conflicting clauses of `docs/superpowers/plans/2026-11-03-durable-zero-sovereign-core-master-plan.md` (specifically: backward-compatibility shims, setter-based host singletons, and deletion of unmapped runtime capabilities are explicitly revoked).
- Audit Evidence: `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/cycle7-plan-audit.md` and `plan-findings.json` (F01–F14).
- Adjudication: `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/third-party-adjudication.json`.
- Candidate Review Round 1 & 2: `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/plan-repair-review-round1.md` (R1–R9) and `plan-repair-review-round2.md`.

---

## Canonical Design Amendment (Resolving Master Plan Conflicts)

1. **Authoritative Goal & Non-Goals:**
   - **Goal:** Preserve 100% of existing runtime capabilities (subagent dispatch, task graphs, steer/followUp, image inputs, model switching, thinking level, session forks, checkpoints, extension mounting, and token metrics) while migrating their execution implementation into `@durable-zero/adapter-pi-durable`.
   - **Non-Goal 1 (No Legacy Transport):** Do NOT preserve legacy ad-hoc line-based JSONL framing (`runner-server.ts`, `RunnerRpcChannel`). Client transport is strictly JSON-RPC 2.0 over stdio.
   - **Non-Goal 2 (No BB Plugin Edits in Cycle 7):** Do NOT modify `bb-plugin-provider-pi-durable` in this cycle. The runner is verified against an independent generic JSON-RPC 2.0 client test suite. BB plugin migration will occur as a downstream task.
   - **Non-Goal 3 (No Skill Changes):** Do NOT edit skill files in `arch-improvement-skills`, `arch-rules-skills`, or `superpowers`.
2. **Single Owner of Session, Lock & Lifecycle (Resolves F04, R5):**
   - In persistent mode, `PiDurableEngine` is the **exclusive owner** of the SQLite session database, `Harness` instance, and file locks (`session.owner.json` / `acquireSessionLock`).
   - `SessionCoordinator` manages logical lifecycle states (`unstarted` $\to$ `ready` $\to$ `active` $\to$ `aborted` $\to$ `closed`) and delegates all physical execution and teardown to `IAgentEngine`.
   - `SessionCoordinator.start()` invokes `await this.engine.start(sessionDir)`. It does NOT call a separate `store.acquireLock()`. `ISessionStore` functions as an administrative read/fork port or shares the underlying open engine session.
3. **Parent Ordering Ruling on Slice 0 & Acyclic Relocation (Resolves R1, R3, R4):**
   - *Technical Ruling:* Task 1 (Slice 0) includes the mechanical relocation of the executable dependency closure into `packages/adapter-pi-durable/src/engine/` and simultaneous build/consumer rewiring.
   - `adapter-pi-durable` never imports concrete `core/src/runtime.ts`. The inter-package DAG is strictly acyclic from Task 1 onward:
     `@durable-zero/contracts` $\to$ `@durable-zero/core` (SPI ports) $\to$ `@durable-zero/adapter-pi-durable` (implements SPI) $\to$ `@durable-zero/runner` (Composition Root) $\to$ `@durable-zero/cli`.
   - `packages/core/src/runner-server.ts` build target in `scripts/build.mjs` is removed in Task 1 at the moment the new runner entry point becomes authoritative.
4. **Dependency Assembly & Injection Boundaries (Resolves F13, R5):**
   - **Closing amendment R8 — native execution environment ABI (2026-11-05, parent ruling):** The native-facing dependency is the exact public SDK `HarnessOptions.env` factory signature, including target, Context and asynchronous return, confined to `adapter-pi-durable`/Runner. The pure six-method Core `IExecutionEnvironment` is NOT structurally a native 25-method `ExecutionEnv`. This amendment supersedes earlier instructions below that use the Core factory as the native default: production Runner injects the SDK `NodeExecutionEnv` through `nativeExecutionEnvFactory`; Core remains vendor-free. Explicit custom Core and native factories are mutually exclusive (configuration error if both are supplied); neither may be silently ignored or replaced by host defaults.
   - **R8 limited Core compatibility:** A custom six-method Core factory may use a deliberately limited adapter forwarding only operations whose semantics can actually be preserved. Unsupported operations return the real SDK typed error (`FileError("not_supported", ...)` where applicable), not fake success or host I/O. In particular, UTF-8 `readFile` does not provide arbitrary binary reads; read/modify/write does not establish native atomic append/truncate/rename; missing path/watch/cancellation capabilities must not be guessed or advertised. Full-capability custom execution uses the native factory. Do not expand the pure Core port or reimplement native filesystem/agent machinery merely to clear tsc.
   - **R8 lifecycle/verification:** Await async factories and forward the native Context; cache and clean up real environments under one verified owner, exactly once, with retry after failed creation. Preserve the actual native Node implementation rather than a partial substitute. Verify native/default and custom injection effects on owned temporary files/processes, explicit unsupported results and zero host fallback for a custom Core environment, asynchronous creation and cleanup. A native model-issued builtin tool round-trip through the public provider seam must accompany final compiled CLI acceptance; this adds no new tool/RPC/admin feature.
   - The Composition Root (`packages/runner/src/composition.ts`) creates concrete infrastructure adapters:
     - `executionEnvFactory` from `@durable-zero/execution`
     - `hostBridge` from `@durable-zero/runner` (implements `IHostBridge`)
     - Builtin extensions via `createCodemodeBuiltinExtension()` from `@durable-zero/adapter-codemode` and `createPiResourceExtension()` from `@durable-zero/extension-pi-resource`
   - These are assembled into typed vendor-private `PiRuntimeDependencies`:
     ```typescript
     export interface PiRuntimeDependencies {
       readonly executionEnvFactory: ExecutionEnvFactory;
       readonly hostBridge?: IHostBridge;
       readonly modelRuntime?: ModelRuntime;
       readonly nativeProviders?: readonly Provider[];
       readonly resourceLoader?: DefaultResourceLoader;
       readonly settingsManager?: SettingsManager;
       readonly builtins?: readonly BuiltinExtension[];
       readonly dynamicSections?: DynamicPromptSections;
       readonly prompt?: PromptOptions;
     }
     ```
   - `PiDurableEngine` constructor in `@durable-zero/adapter-pi-durable` accepts `{ cwd, sessionDir, cli, dependencies: PiRuntimeDependencies }` and forwards `dependencies` directly to `openDurable({ sessionDir, cwd, cli, dependencies })`.
   - In `loadHarnessEnvironment` (`packages/adapter-pi-durable/src/engine/runtime-loader.ts`):
     - `const modelRuntime = dependencies.modelRuntime ?? await ModelRuntime.create();`
     - For each `provider` in `dependencies.nativeProviders ?? []`: `modelRuntime.registerNativeProvider(provider);`
     - `const settingsManager = dependencies.settingsManager ?? SettingsManager.create(location.cwd);`
     - `const resourceLoader = dependencies.resourceLoader ?? new DefaultResourceLoader({ cwd: location.cwd, ... });`
     - `const codingRegistry = await createCodingRegistry(settingsManager, location.cwd, getSubagentPolicy, { ...dependencies.prompt, resourceLoader, dynamicSections }, dynamicNamespaces, dependencies.builtins);`
     - `harness = await Harness.open(storage, { models: modelRuntime, registry: codingRegistry, settings, env: envs.env, onReport: report }, runtimeContext);`
     - `dependencies.hostBridge` is wired into `extension-ui-context` and tool execution without global singletons.
     - Single teardown path: `closeRuntimeResources` cleans up once without double-disposing externally injected instances.
   - **Production Purity & Test Seam:** Production `composition.ts` does NOT import test fixtures or branch on `mock` providers. Test-only scripted models are loaded in black-box CLI E2E tests through the existing public CLI `--extension <path>` mechanism (e.g. `--extension packages/runner/test/fixtures/scripted-provider-extension.ts --provider scripted-e2e --model echo`), which registers the native `Provider` into `modelRuntime` via `runtime-loader.ts`'s standard extension lifecycle (`pendingNativeProviderRegistrations`).
   - **Model Abstraction Distinction:** The model catalogue/resolver `IModelProvider` (domain SPI in `core/src/models/provider.ts`) is cleanly distinguished from the native `Models` / `ModelRuntime` interface consumed by `HarnessOptions.models`.
   - **Extension Decoupling & Acyclic DAG:**
     - Vendor-free extension lifecycle interface `ISandboxExtension` lives in `core/src/tools/sandbox.ts`.
     - Concrete `BuiltinExtensionContext` (which references `@earendil-works/pi-durable` `Registry` and `@earendil-works/pi-coding-agent` `SettingsManager`) and `BuiltinExtension` live in `packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts`.
     - `packages/adapter-codemode` depends on `@durable-zero/adapter-pi-durable` and `@durable-zero/core`. It exports `createCodemodeBuiltinExtension()` returning `CodemodeExtension` implementing `BuiltinExtension` and `ISandboxExtension`.
     - `adapter-pi-durable` never depends on `adapter-codemode`. The DAG is strictly acyclic: `contracts` $\to$ `core` $\to$ `adapter-pi-durable` $\to$ `adapter-codemode` $\to$ `runner` $\to$ `cli`.
   - `SessionCoordinator` in Core receives only pure domain SPI ports: `engine: IAgentEngine`, `store?: ISessionStore`. No decorative ports or vendor dependencies exist in Core.
   - **Native Root Identity & Wire Mapping:** The native root conversation ID in `@earendil-works/pi-durable` is `ROOT_CONVERSATION_ID = 1`. In all public wire DTOs and JSON-RPC responses, the root conversation is identified by its canonical string `"1"`.
   - `PiDurableEngine.getState()` and `getTranscript()` return typed domain DTOs:
     ```typescript
     export interface ModelSummaryDTO {
       readonly provider: string;
       readonly modelId: string;
       readonly name?: string;
       readonly contextWindow?: number;
     }

     export interface SessionStateDTO {
       readonly sessionId: string;
       readonly cwd: string;
       readonly activeConversationId: string; // Canonical "1" for root
       readonly activeModel?: { readonly provider: string; readonly modelId: string };
       readonly thinkingLevel?: string;
       readonly models: readonly ModelSummaryDTO[];
       readonly entryCount: number; // total entries in conversation.entries()
     }

     export interface TranscriptEntryDTO {
       readonly id: string; // Native EntryId
       readonly conversationId: string;
       readonly kind: string;
       readonly role?: "user" | "assistant" | "system" | "tool";
       readonly text?: string;
     }

     export interface SessionTranscriptDTO {
       readonly conversationId: string;
       readonly entries: readonly TranscriptEntryDTO[];
     }
     ```
5. **Host Communication Architecture (Resolves F06, F14, R6, R7):**
   - Transport DTOs and JSON-RPC 2.0 method schemas (`host/toolCall`, `host/interaction`, `tools/register`) live in `@durable-zero/protocol`.
   - The domain/adapter port `IHostBridge` lives in Core contracts:
     ```typescript
     export interface IHostBridge {
       forwardToolCall(toolName: string, args: unknown): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
       requestInteraction(kind: string, payload: { title?: string; message?: string; data?: unknown }): Promise<unknown>;
     }
     ```
   - `HostBridge` in `@durable-zero/runner` implements `IHostBridge` by invoking `server.request("host/toolCall", ...)` and `server.request("host/interaction", ...)`. It is injected into `PiDurableEngine` via Constructor DI.
   - Reverse RPC results are validated at runtime against Zod schema `hostToolResultSchema`. Configurable timeout (`timeoutMs`, default 30,000ms, injectable down to 100ms in tests) and injected `idSource` ensure deterministic testing without 120s hangs (R7).
   - `packages/core/src/host-rpc.ts` and all its mutable singletons (`activeToolForwarder`, `setHostToolForwarder`) are completely deleted.
   - The runner<->host tool call and host<->BB interaction are separate RPC hops with distinct ID spaces; no cross-hop tracker unification is forced.
6. **Superseded Clauses of Master Plan (2026-11-03):**
   - *Superseded:* Preservation of backward-compatible JSONL re-exports (`export * from "./runner-server.ts"`). Revoked; JSON-RPC 2.0 is exclusive.
   - *Superseded:* Keeping `forkSessionDatabase` inside Core. Moved to `@durable-zero/adapter-pi-durable/src/storage/`.
   - *Superseded:* Global setter `setHostToolForwarder`. Replaced by `IHostBridge` constructor DI.
   - *Superseded:* Out-of-band `control.jsonl` file channel. Superseded by public JSON-RPC method `session/abortTask`.

---

## Global Constraints

- **Pure Sovereign Core:** `@durable-zero/core/package.json` depends ONLY on `@durable-zero/contracts` and `zod` (`^4.6.7`). Zero `@earendil-works/*`, zero SQLite, zero adapter dependencies, and zero host RPC infrastructure in Core (AP-010, AP-012, R8).
- **Single Production Runner Entry Point:** `@durable-zero/runner` (`main.ts`) is the single production Composition Root for `durable-zero serve`. Delete `packages/core/src/runner-server.ts`, `packages/core/src/jsonl.ts`, and `packages/core/src/cli-args.ts` (AP-020, AP-075).
- **Executable CLI Integration (Resolves F03):** `packages/runner/src/main.ts` exports a callable `export async function main(argv?: string[]): Promise<void>`. `packages/cli/bin/durable-zero.js` calls `await main(process.argv.slice(2))` when `command === "serve"`.
- **Pure Full-Duplex JSON-RPC 2.0 Transport (Resolves F08):**
  - Protocol conforms strictly to JSON-RPC 2.0 specification:
    - Incoming notifications (`id === undefined`) produce ZERO response (silence).
    - Unknown method returns error `-32601` (`Method not found`), NOT `-32603`.
    - Response schema enforces strict XOR: object must contain `result` OR `error`, never both.
- **Walking Skeleton Invariant (Resolves F07, R1):** Slice 0 (Task 1) connects entry point -> runner -> coordinator -> engine -> live model stream and is proven by a true black-box E2E test with real Harness, SQLite persistence, and restart verification before migrating remaining runtime files (AP-075).
- **Assertion Integrity (Resolves F10, R2):** Every test asserts concrete state transitions, emitted token deltas, and dependency invocations. Returning synthetic stub IDs (`rec_...`) or fake timestamps to satisfy tests is classified as P1 Hollow Implementation (AP-076).
- **Mandatory Timeouts:** Per-test timeout is 30,000ms (`--test-timeout 30000`). Total command timeout is 60s for unit suites, 120s for E2E suites (AP-028).

---

## Review Focus & Literal Behavioral Assertions (Resolves F10, R1, R2, R7)

1. **Empty Prompt Validation:** Submitting an empty or whitespace string throws `SessionError` with code `INVALID_PROMPT`.
   ```typescript
   await assert.rejects(
     () => coordinator.prompt("   "),
     (err: any) => err instanceof SessionError && err.code === "INVALID_PROMPT" && err.message.includes("non-empty")
   );
   ```
   *Mutation Caught:* Prevents dispatching blank turns to LLM.
2. **Lifecycle State Enforcement:** Submitting prompt before `start()` or after `close()` throws `SessionError` with code `SESSION_NOT_STARTED` or `SESSION_CLOSED`.
   ```typescript
   await assert.rejects(
     () => coordinator.prompt("hello"),
     (err: any) => err instanceof SessionError && err.code === "SESSION_NOT_STARTED"
   );
   ```
   *Mutation Caught:* Eliminates unhandled promise hangs when uninitialized.
3. **Prompt Abort (`session/abort`):** Sending `session/abort` invokes `engine.abort()` and emits `session_aborted` event.
   ```typescript
   await coordinator.abort();
   assert.equal(engine.abortCalled, true);
   assert.equal(emittedEvents.some(e => e.type === "session_aborted"), true);
   ```
   *Mutation Caught:* Ensures runaway token generation terminates immediately.
4. **Host Tool Round-Trip:** Model calling a host tool causes runner to send `host/toolCall` over JSON-RPC, await client response, and continue turn.
   ```typescript
   const clientRes = await hostBridge.forwardToolCall("echo", { val: "test-42" });
   assert.deepEqual(clientRes, { content: [{ type: "text", text: "echoed: test-42" }], isError: false });
   ```
   *Mutation Caught:* Proves host tools actually execute through reverse RPC without global singletons.
5. **Headless Probe Mode (`--no-session`):** Running with `--no-session` boots server without creating `.durable/sessions` or SQLite files.
   ```typescript
   assert.equal(fs.existsSync(path.resolve(tmpDir, ".durable/sessions")), false);
   assert.equal(fs.existsSync(path.resolve(tmpDir, "session.sqlite")), false);
   ```
   *Mutation Caught:* Prevents spurious session creation and lock contention during inspection.

---

## Preflight Dependency Order & Task Transition Matrix (Resolves R3)

| Task | Files Touched / Relocated | Export / Build Changes | Inter-Package DAG State | Executable Public Path Verified |
| :--- | :--- | :--- | :--- | :--- |
| **Task 1: Slice 0** | Core `session/engine.ts`, `coordinator.ts`; Relocate 50 runtime files to `adapter-pi-durable/src/engine/`; `runner/composition.ts`, `cli/bin/durable-zero.js` | Exports `IAgentEngine` from Core; exports `main(argv)` from runner; CLI `serve` imports `runner/dist/main.js`; removes `runner-server.ts` build from `scripts/build.mjs` | `contracts` $\to$ `core` $\to$ `adapter-pi-durable` $\to$ `runner` $\to$ `cli` (strict acyclic) | `durable-zero serve` runs real Harness with deterministic test provider |
| **Task 2: Host Bridge** | Protocol `methods/host.ts`, Core `tools/host-bridge.ts`, Runner `host/host-bridge.ts`, Adapter `pi-durable-engine.ts`, Delete `core/src/host-rpc.ts` | Exports `IHostBridge` from Core; deletes `core/src/host-rpc.ts`; rewires `extension-ui-context.ts` to `IHostBridge` | `protocol` $\to$ `core` $\to$ `adapter-pi-durable` $\to$ `runner` (acyclic) | Model tool call round-trip over stdio JSON-RPC 2.0 |
| **Task 3: Probe Mode** | Runner `composition.ts`, `main.ts`, `cli-args.ts` | Runner accepts `--no-session` flag and starts non-locking probe server | No DAG changes | `durable-zero serve --no-session` responds to `models/list` |
| **Task 4: Conformance & Dispatch** | Protocol `schema.ts`, `request-dispatcher.ts`, Runner `session-dispatcher.ts` | Protocol strictly validates JSON-RPC 2.0 rules; runner dispatches all capability methods | No DAG changes | Generic JSON-RPC test client executes all 16 capabilities |
| **Task 5: Pure Core Decoupling** | Core `package.json`, `index.ts`, delete `core/src/jsonl.ts`, `core/src/cli-args.ts`, `core/scripts/build-runner.mjs` | Core `package.json` stripped to `zod` + `contracts`; exports clean domain entry point | `core` has ZERO vendor/adapter imports | Automated AST boundary check passes |
| **Task 6: S9 Gate & Ledger** | `docs/arch-improvement/ledger.md` | S9 Architecture PASS + S9 Product PASS + Orchestrator Diff Gate | Final state verified | Release candidate verified |

---

## Full Dependency Closure Inventory (All 87 Files in `packages/core/src/`) (Resolves F01, R4)

| # | File Path in `packages/core/src/` | Responsibility | Target Package & Path | Action | Importers & Regression Test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `binding-commands.ts` | Thread binding RPC commands (`register_binding`, `get_all_bindings`) | `adapter-pi-durable/src/engine/binding-commands.ts` | Move in Task 1 | Used by `session-commands.ts`; tested in `packages/adapter-pi-durable/test/` |
| 2 | `binding-docs.ts` | Pi document schema for bindings | `adapter-pi-durable/src/engine/binding-docs.ts` | Move in Task 1 | Used by `binding-commands.ts` |
| 3 | `bridge/assistant-message-builder.ts` | Pi AI message formatting | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `durable-event-adapter.ts` |
| 4 | `bridge/child-run-outcome.ts` | Subagent execution result DTO | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `durable-child-event-adapter.ts` |
| 5 | `bridge/contracts.ts` | Bridge internal interfaces | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by bridge adapters |
| 6 | `bridge/durable-child-event-adapter.ts` | Subagent event projection | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Tested in `durable-child-event-adapter.test.ts` |
| 7 | `bridge/durable-contracts.ts` | Event contracts | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by event projector |
| 8 | `bridge/durable-event-adapter.ts` | Main event stream adapter | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Tested in `durable-event-adapter.test.ts` |
| 9 | `bridge/native-tool-result.ts` | Native Pi tool result parser | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `tool-result-extractor.ts` |
| 10 | `bridge/tool-args-resolver.ts` | Live state tool args resolver | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `durable-event-adapter.ts` |
| 11 | `bridge/tool-progress-state.ts` | Tool execution progress tracking | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `durable-event-adapter.ts` |
| 12 | `bridge/tool-result-extractor.ts` | Tool output extraction | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by event projector |
| 13 | `bridge/tool-result-presentation.ts` | Formatting tool presentations | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by event projector |
| 14 | `bridge/turn-summary.ts` | Agent turn summary generator | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by event projector |
| 15 | `bridge/view-stream-projector.ts` | View stream projector | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Tested in `view-stream-projector.test.ts` |
| 16 | `bridge/watch-events-compat.ts` | Upstream watch event compat | `adapter-pi-durable/src/engine/bridge/` | Move in Task 1 | Used by `runtime.ts` |
| 17 | `builtin-extensions/coding-tools.ts` | Pi coding tools registration | `adapter-pi-durable/src/engine/builtin-extensions/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 18 | `builtin-extensions/index.ts` | Builtin extension aggregator | `adapter-pi-durable/src/engine/builtin-extensions/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 19 | `builtin-extensions/registry.ts` | Builtin extension registry | `adapter-pi-durable/src/engine/builtin-extensions/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 20 | `builtin-extensions/subagents.ts` | Native subagent tools mount | `adapter-pi-durable/src/engine/builtin-extensions/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 21 | `builtin-extensions/types.ts` | Extension context types | `adapter-pi-durable/src/engine/builtin-extensions/` | Split in Task 1 | Generic `ISandboxExtension` in `core/tools/sandbox.ts`; concrete `BuiltinExtensionContext` in `adapter-pi-durable` |
| 22 | `cli-args.ts` | CLI option parsing | `runner/src/cli-args.ts` | Move in Task 1 | Used by `runner/src/main.ts` |
| 23 | `codemode-namespaces.ts` | Dynamic QuickJS namespaces | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 24 | `compaction-hooks.ts` | Conversation compaction hook | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 25 | `control-channel.ts` | Runtime control channel (`control.jsonl`) | `adapter-pi-durable/src/engine/` | Superseded | Replaced by `session/abortTask` in Task 4 |
| 26 | `conversation-id.ts` | Conversation ID parser & constants | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by controller and commands |
| 27 | `engine.ts` | Existing working wrapper over openDurable | `adapter-pi-durable/src/engine/pi-durable-engine.ts` | Refactor in Task 1 | Re-implemented as `PiDurableEngine implements IAgentEngine` |
| 28 | `errors.ts` | Domain errors | `core/src/errors.ts` | Keep | Domain core error hierarchy |
| 29 | `extension-actions.ts` | Extension action types | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `extension-bridge.ts` |
| 30 | `extension-bridge.ts` | Bridge for dynamic extensions | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `extension-mount.ts` |
| 31 | `extension-mount.ts` | Mounts extensions to registry | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 32 | `harness-setup.ts` | Harness initialization | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 33 | `host-rpc.ts` | Legacy host RPC with singletons | N/A | Delete in Task 2 | Replaced by `IHostBridge` and `HostBridge` |
| 34 | `index.ts` | Core domain entry point | `core/src/index.ts` | Keep | Export pure domain ports and services |
| 35 | `jsonl.ts` | Legacy line reader | N/A | Delete in Task 5 | Replaced by `@durable-zero/protocol` |
| 36 | `models/provider.ts` | Domain SPI port `IModelProvider` | `core/src/models/provider.ts` | Keep | Core model interface |
| 37 | `policy/errors.ts` | Subagent policy errors | `core/src/policy/errors.ts` | Keep | Pure domain policy errors |
| 38 | `policy/resolver.ts` | Policy inheritance resolver | `core/src/policy/resolver.ts` | Keep | Pure domain policy resolver |
| 39 | `policy/schema.ts` | Pure Zod schemas for policies | `core/src/policy/schema.ts` | Keep | Stripped of `@earendil-works` imports |
| 40 | `policy/store.ts` | In-memory/CAS policy store | `core/src/policy/store.ts` | Keep | Domain policy store |
| 41 | `policy/types.ts` | Pure policy TypeScript types | `core/src/policy/types.ts` | Keep | Domain policy types |
| 42 | `prompt.ts` | Pi prompt extension & tool defs | `adapter-pi-durable/src/engine/prompt.ts` | Move in Task 1 | Concrete Pi tool creation moved to adapter; domain options in core |
| 43 | `runner-server.ts` | Legacy server monolith | N/A | Delete in Task 1 | Replaced by `@durable-zero/runner` |
| 44 | `runtime-bindings.ts` | Doc family bindings | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 45 | `runtime-cleanup.ts` | Runtime cleanup logic | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-controller.ts` |
| 46 | `runtime-controller.ts` | Concrete controller implementation | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 47 | `runtime-graph-conversations.ts` | Graph conversation node mapper | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 48 | `runtime-graph-mapper.ts` | Graph task tree mapper | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 49 | `runtime-graph-receipts.ts` | Graph receipt node tracking | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 50 | `runtime-graph-scope.ts` | Graph scope types | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 51 | `runtime-graph-source.ts` | Graph snapshot provider | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `PiDurableEngine` |
| 52 | `runtime-graph-state.ts` | Graph state transitions | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 53 | `runtime-hydration.ts` | Hydrates persisted sessions | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 54 | `runtime-loader.ts` | Loads Pi SDK objects | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 55 | `runtime-types.ts` | Pi runtime DTOs and contracts | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `PiDurableEngine` |
| 56 | `runtime.ts` | `openDurable` implementation | `adapter-pi-durable/src/engine/` | Move in Task 1 | Encapsulated by `PiDurableEngine` |
| 57 | `schema-port.ts` | Schema port for Pi Schema | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 58 | `session-commands.ts` | Legacy session command handlers | `runner/src/dispatch/` | Move in Task 4 | Migrated to JSON-RPC dispatcher |
| 59 | `session-daemon.ts` | Background daemon runner | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime.ts` |
| 60 | `session-state-commands.ts` | Session state query handlers | `runner/src/dispatch/` | Move in Task 4 | Migrated to JSON-RPC dispatcher |
| 61 | `session/coordinator.ts` | `SessionCoordinator` service | `core/src/session/coordinator.ts` | Keep | Pure domain FSM and lifecycle |
| 62 | `session/store.ts` | `ISessionStore` SPI port | `core/src/session/store.ts` | Keep | Pure domain session store port |
| 63 | `shared/agent-dir.ts` | Agent directory resolver | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 64 | `shared/child-title.ts` | Child task title derivation | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `subagent-delivery.ts` |
| 65 | `shared/errors.ts` | Adapter error types | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by adapter bridge |
| 66 | `shared/extension-runner.ts` | Runner extension helpers | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 67 | `shared/extension-ui-context.ts` | UI dialog requester bridge | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Injected with `IHostBridge` |
| 68 | `shared/model-ref.ts` | Model reference DTO | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `runtime-controller.ts` |
| 69 | `shared/subagent-envelope.ts` | Subagent IPC message envelope | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `subagent-delivery.ts` |
| 70 | `shared/version.ts` | Pi runtime version helper | `adapter-pi-durable/src/engine/shared/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 71 | `stdout-guard.ts` | Pi output guard for FD 1 | `adapter-pi-durable/src/engine/stdout-guard.ts` | Move in Task 1 | Isolates `@earendil-works/pi-coding-agent` |
| 72 | `subagent-courier.ts` | Subagent courier service | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent.ts` |
| 73 | `subagent-delivery-types.ts` | Delivery types | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent-delivery.ts` |
| 74 | `subagent-delivery.ts` | Subagent delivery dispatch | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent.ts` |
| 75 | `subagent-docs.ts` | Subagent Pi document schemas | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent-watcher.ts` |
| 76 | `subagent-policy-ack.ts` | Subagent policy acknowledgment | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent.ts` |
| 77 | `subagent-policy-state.ts` | Subagent policy state tracking | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent.ts` |
| 78 | `subagent-role.ts` | Subagent role definitions | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `subagent.ts` |
| 79 | `subagent-watcher.ts` | Subagent file/state watcher | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `runtime.ts` |
| 80 | `subagent.ts` | Subagent manager core | `adapter-pi-durable/src/engine/subagents/` | Move in Task 1 | Used by `runtime-controller.ts` |
| 81 | `task-labels.ts` | Task labeling helpers | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-mapper.ts` |
| 82 | `task-tokens.ts` | Task token counter metrics | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-graph-source.ts` |
| 83 | `tool-adapter.ts` | Tool adapter for Pi harness | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `runtime-loader.ts` |
| 84 | `tools/execution-env.ts` | `IExecutionEnvironment` port | `core/src/tools/execution-env.ts` | Keep | Pure domain execution SPI |
| 85 | `tools/sandbox.ts` | `ICodemodeRunner`, `ISandboxExtension` | `core/src/tools/sandbox.ts` | Keep | Pure domain sandbox SPI |
| 86 | `version.ts` | Core version constant | `core/src/version.ts` | Keep | Pure version string |
| 87 | `watcher-compat.ts` | Watcher backward compat | `adapter-pi-durable/src/engine/` | Move in Task 1 | Used by `subagent-watcher.ts` |

---

## Capability Preservation Matrix (Resolves F05, R4, R6)

| Legacy Command / Feature | Legacy Source Location | Target JSON-RPC 2.0 Method | Target Owner Package | Verification Test Name |
| :--- | :--- | :--- | :--- | :--- |
| `prompt` (text + images) | `core/session-commands.ts:34` | `session/prompt` | `@durable-zero/runner` | `test_prompt_with_text_and_images` |
| `steer` (interrupt turn) | `core/session-commands.ts:54` | `session/steer` | `@durable-zero/runner` | `test_steer_interrupts_active_turn` |
| `abort` (active turn) | `core/session-commands.ts:74` | `session/abort` | `@durable-zero/runner` | `test_abort_terminates_turn` |
| `abort_task` (subagent task) | `core/session-commands.ts:87` | `session/abortTask` | `@durable-zero/runner` | `test_abort_subagent_task` |
| `compact` (conversation) | `core/session-commands.ts:96` | `session/compact` | `@durable-zero/runner` | `test_compact_conversation` |
| `set_subagent_policy` (CAS) | `core/session-commands.ts:101` | `subagent/setPolicy` | `@durable-zero/adapter-pi-durable` | `test_subagent_policy_cas_update` |
| `get_available_models` | `core/session-commands.ts:112` | `models/list` | `@durable-zero/runner` | `test_models_list_catalog` |
| `set_model` | `core/session-commands.ts:117` | `models/set` | `@durable-zero/adapter-pi-durable` | `test_models_set_active` |
| `set_thinking_level` | `core/session-commands.ts:125` | `models/setThinking` | `@durable-zero/adapter-pi-durable` | `test_models_set_thinking_level` |
| `session_fork` (checkpoints) | `core/session-commands.ts:133` | `session/fork` | `@durable-zero/adapter-pi-durable` | `test_session_fork_checkpoint` |
| `get_state` | `core/session-state-commands.ts:19` | `session/getState` | `@durable-zero/runner` | `test_get_session_state` |
| `get_session_stats` | `core/session-state-commands.ts:51` | `session/getStats` | `@durable-zero/runner` | `test_get_session_stats_tokens` |
| `register_binding` | `core/binding-commands.ts:21` | `binding/register` | `@durable-zero/adapter-pi-durable` | `test_register_thread_binding` |
| `get_all_bindings` | `core/binding-commands.ts:68` | `binding/list` | `@durable-zero/adapter-pi-durable` | `test_list_all_bindings` |
| `host_tool_result` (reverse response) | `core/runner-server.ts:188` | Standard JSON-RPC 2.0 Response | `@durable-zero/protocol` | `test_host_tool_response_flow` |
| `host_interaction_response` | `core/runner-server.ts:199` | Standard JSON-RPC 2.0 Response | `@durable-zero/protocol` | `test_host_interaction_response_flow` |
| `RuntimeGraphSource` events | `core/runner-server.ts:141` | `session/event` (graph) | `@durable-zero/adapter-pi-durable` | `test_stream_runtime_graph_snapshot` |
| `DurableEventAdapter` deltas | `core/runner-server.ts:113` | `session/event` (deltas) | `@durable-zero/adapter-pi-durable` | `test_stream_text_and_tool_deltas` |
| Dynamic Tools Registration | `core/builtin-extensions/` | `tools/register` | `@durable-zero/runner` | `test_dynamic_tools_registration` |

---

## Tasks Breakdown

### Task 1: Slice 0 — Acyclic Closure Relocation, Living Walking Skeleton with Deterministic Provider & Restart Verification (Resolves F01, F02, F03, F04, F07, F13, R1, R2, R3, R4, R5)

**Files:**
- Create: `packages/contracts/src/receipt.ts` (export `PromptAdmissionReceipt` and prompt content types from contracts)
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/core/src/session/engine.ts` (domain SPI `IAgentEngine` and pure DTOs with zero `any`)
- Modify: `packages/core/src/session/coordinator.ts`
- Modify: `packages/core/src/prompt.ts` (split pure `PromptOptions` and `DynamicPromptSections`; remove `node:fs` and `@earendil-works/*` imports)
- Modify: `packages/core/src/index.ts`
- Delete: `packages/core/src/engine.ts` (working logic migrated into adapter)
- Delete: `packages/core/src/runner-server.ts`
- Relocate: 50 runtime/bridge/subagent files from `packages/core/src/` to `packages/adapter-pi-durable/src/engine/` (per Inventory table)
- Create: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
- Modify: `packages/adapter-pi-durable/src/engine/runtime-types.ts` (add `PiRuntimeDependencies`)
- Modify: `packages/adapter-pi-durable/src/engine/runtime-loader.ts` (consume `PiRuntimeDependencies`)
- Modify: `packages/adapter-pi-durable/src/engine/runtime.ts` (forward dependencies)
- Modify: `packages/adapter-pi-durable/src/index.ts`
- Modify: `packages/adapter-pi-durable/package.json` (add `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`)
- Modify: `packages/adapter-codemode/package.json` (add `@durable-zero/adapter-pi-durable`)
- Modify: `packages/extension-pi-resource/package.json` (add `@durable-zero/adapter-pi-durable`)
- Create: `packages/runner/test/fixtures/scripted-provider-extension.ts` (test support scripted provider extension)
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Modify: `packages/cli/bin/durable-zero.js`
- Modify: `scripts/build.mjs` (drop `runner-server.ts` build target, bundle `runner/dist/main.js`)
- Test: `packages/runner/test/e2e-walking-skeleton.test.ts`

**Interfaces:**
- Consumes: `openDurable({ sessionDir, cwd, cli, dependencies })` in `packages/adapter-pi-durable/src/engine/runtime.ts`.
- Produces: `IAgentEngine` in Core, `PiDurableEngine implements IAgentEngine` in adapter, callable `export async function main(argv?: string[]): Promise<void>` in runner.

- [ ] **Step 1: Write failing True Black-Box Walking Skeleton E2E Test (Resolves R1)**

Create `packages/runner/test/e2e-walking-skeleton.test.ts`:
- Build project: `node scripts/build.mjs`.
- Spawn compiled CLI via `child_process.spawn`:
  `packages/cli/bin/durable-zero.js serve --session <tmpDir> --extension packages/runner/test/fixtures/scripted-provider-extension.ts --provider scripted-e2e --model echo`
- Send JSON-RPC 2.0 request:
  `{"jsonrpc": "2.0", "id": 1, "method": "session/prompt", "params": {"content": "Echo: hello world"}}`
- Assertions:
  1. Receive response with `id: 1, result: { status: "accepted", id: observedRequestId, conversationId: "1" }`. Store `observedRequestId`.
  2. Receive streaming text delta via canonical RunnerEvent: `{"jsonrpc": "2.0", "method": "session/event", "params": {"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "Echo: hello world"}}}`.
  3. Receive additive terminal turn notification: `{"jsonrpc": "2.0", "method": "session/event", "params": {"type": "turn_complete", "status": "completed", "requestId": observedRequestId}}` (declared in contracts schemas/types and correlated to native `Submission.wait()` settlement).
  4. Query `{"jsonrpc": "2.0", "id": 2, "method": "session/getTranscript", "params": {}}`.
     Assert entries list contains:
     - User entry: role `"user"`, text `"Echo: hello world"`, stable entry id `userEntryId`.
     - Assistant entry: role `"assistant"`, text `"Echo: hello world"`, stable entry id `assistantEntryId`.
  5. Send `SIGTERM` and verify process exits cleanly with code 0 within 5 seconds.
  6. Restart process with SAME `--session <tmpDir>` and `--extension packages/runner/test/fixtures/scripted-provider-extension.ts --provider scripted-e2e --model echo`.
  7. Send `{"jsonrpc": "2.0", "id": 3, "method": "session/getState", "params": {}}`.
     Assert `result.sessionId === locationId` and `result.entryCount >= 2` (read from persisted SQLite entries).
  8. Send `{"jsonrpc": "2.0", "id": 4, "method": "session/getTranscript", "params": {}}`.
     Assert exact matching `userEntryId`, `assistantEntryId`, and identical user and assistant text read back from persisted SQLite entries.
  9. Send second prompt: `{"jsonrpc": "2.0", "id": 5, "method": "session/prompt", "params": {"content": "Second turn"}}` and assert turn completes with `entryCount >= 4`.
- Timeout: Justified 60,000ms (`--test-timeout 60000`) for bundle build plus two-process execution and restart lifecycle.

- [ ] **Step 2: Run test to verify failure**

Run: `node scripts/build.mjs && node --test --test-timeout 60000 packages/runner/test/e2e-walking-skeleton.test.ts`
Expected: FAIL (runner does not support mock model or does not stream).

- [ ] **Step 3: Relocate Runtime Dependency Closure to `packages/adapter-pi-durable/src/engine/` (Resolves R3, R4)**

Mechanically move the 50 files listed in the Inventory (bridge/*, subagent-*.ts, runtime-*.ts, runtime.ts, harness-setup.ts, stdout-guard.ts, shared/*) into `packages/adapter-pi-durable/src/engine/`.
Split `prompt.ts`:
- Keep pure `PromptOptions` and `DynamicPromptSections` in `packages/core/src/prompt.ts`.
- Move concrete Pi prompt extension, `CANONICAL_TOOL_DEFS`, and `@earendil-works/*` imports to `packages/adapter-pi-durable/src/engine/prompt.ts`.
Migrate working wrapper logic from `packages/core/src/engine.ts` into `PiDurableEngine` in `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`, and delete `packages/core/src/engine.ts`.
Update internal imports within `adapter-pi-durable` to be local (`./`).
Remove `packages/core/src/runner-server.ts`.
In `scripts/build.mjs`: remove building of `runner-server.ts`.
In `packages/adapter-pi-durable/package.json`: add dependencies on `@earendil-works/pi-coding-agent: 1.5.0`, `@earendil-works/pi-ai: 1.5.0`.
In `packages/adapter-codemode/package.json` and `packages/extension-pi-resource/package.json`: import `BuiltinExtension` and `BuiltinExtensionContext` from `@durable-zero/adapter-pi-durable`.

- [ ] **Step 4: Implement `IAgentEngine` and update `SessionCoordinator` with Zero `any` (Resolves F02, R2)**

In `packages/contracts/src/receipt.ts`:
```typescript
export interface TextContentPart {
  readonly type: "text";
  readonly text: string;
}

export interface ImageContentPart {
  readonly type: "image";
  readonly data: string;
  readonly mimeType: string;
}

export type PromptContentPart = TextContentPart | ImageContentPart;
export type PromptInput = string | readonly PromptContentPart[];

export interface PromptAdmissionReceipt {
  readonly status: "accepted";
  readonly id: string; // Native requestId (SubmissionId) from Harness submission
  readonly conversationId: string; // Canonical "1" for root
  readonly sequence?: number;
}
```
Export `PromptAdmissionReceipt` and prompt content types from `packages/contracts/src/index.ts`.

In `packages/core/src/session/engine.ts`:
```typescript
import type { PromptAdmissionReceipt, PromptInput, RunnerEvent } from "@durable-zero/contracts";
import type { SubagentPolicyRecord } from "../policy/types.ts";

export interface PromptExecutionOptions {
  readonly deliverAs?: "steer" | "followUp";
  readonly conversationId?: string;
}

export interface ModelSummaryDTO {
  readonly provider: string;
  readonly modelId: string;
  readonly name?: string;
  readonly contextWindow?: number;
}

export interface SessionStateDTO {
  readonly sessionId: string;
  readonly cwd: string;
  readonly activeConversationId: string; // Canonical "1" for root
  readonly activeModel?: { readonly provider: string; readonly modelId: string };
  readonly thinkingLevel?: string;
  readonly models: readonly ModelSummaryDTO[];
  readonly entryCount: number; // total entries in conversation.entries()
}

export interface TranscriptEntryDTO {
  readonly id: string; // Native EntryId
  readonly conversationId: string;
  readonly kind: string;
  readonly role?: "user" | "assistant" | "system" | "tool";
  readonly text?: string;
}

export interface SessionTranscriptDTO {
  readonly conversationId: string;
  readonly entries: readonly TranscriptEntryDTO[];
}

export interface SessionStatsDTO {
  readonly contextUsage: {
    readonly tokens: number | null;
    readonly contextWindow: number;
  };
}

export interface IAgentEngine {
  start(sessionDir: string): Promise<void>;
  submit(input: PromptInput, options?: PromptExecutionOptions): Promise<PromptAdmissionReceipt>;
  abort(conversationId?: string): Promise<void>;
  abortTask(taskId: number): Promise<void>;
  compact(instructions?: string): Promise<void>;
  setSubagentPolicy(record: SubagentPolicyRecord): Promise<void>;
  setModel(model: { provider: string; modelId: string }): Promise<void>;
  setThinkingLevel(level: string): Promise<void>;
  getState(conversationId?: string): Promise<SessionStateDTO>;
  getTranscript(conversationId?: string, limit?: number): Promise<SessionTranscriptDTO>;
  getStats(conversationId?: string): Promise<SessionStatsDTO>;
  events(listener: (event: RunnerEvent) => void): () => void;
  close(): Promise<void>;
}
```

In `packages/core/src/session/coordinator.ts`:
Accept `{ engine: IAgentEngine, store?: ISessionStore, sessionDir: string }` in constructor via pure DI.
In `start()`: call `await this.engine.start(this.sessionDir)`. Single lock owner in `PiDurableEngine` (no `store.acquireLock()`).
In `prompt(input, options)`: validate:
- If string: `input.trim().length > 0`.
- If array: non-empty and contains at least one text part with non-empty text OR at least one image part with valid data/mimeType.
- Otherwise throw `SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list")`.
- Call `return await this.engine.submit(input, options)`.
In `abort(conversationId)`: call `await this.engine.abort(conversationId)` and emit `session_aborted` event.
In `close()`: call `await this.engine.close()`.

- [ ] **Step 5: Implement `PiDurableEngine` and `PiRuntimeDependencies` in Adapter (Resolves F02, F04, R2, R5)**

Create test support fixture `packages/runner/test/fixtures/scripted-provider-extension.ts`:
Exports an extension factory that registers the scripted provider via `api.registerProvider(provider)` during extension loading.
The scripted provider implements `@earendil-works/pi-ai` `Provider` for provider `"scripted-e2e"` and model `"echo"` using `createAssistantMessageEventStream` from `@earendil-works/pi-ai/utils/event-stream`. For prompt `"Echo: hello world"`, streams `text_delta` with delta `"Echo: hello world"` and completes cleanly.

In `packages/adapter-pi-durable/src/engine/runtime-types.ts`:
Declare `PiRuntimeDependencies`:
```typescript
export interface PiRuntimeDependencies {
  readonly executionEnvFactory: ExecutionEnvFactory;
  readonly hostBridge?: IHostBridge;
  readonly modelRuntime?: ModelRuntime;
  readonly nativeProviders?: readonly Provider[];
  readonly resourceLoader?: DefaultResourceLoader;
  readonly settingsManager?: SettingsManager;
  readonly builtins?: readonly BuiltinExtension[];
  readonly dynamicSections?: DynamicPromptSections;
  readonly prompt?: PromptOptions;
}
```

In `packages/adapter-pi-durable/src/engine/runtime-loader.ts`:
Consume `dependencies: PiRuntimeDependencies`:
- `const modelRuntime = dependencies.modelRuntime ?? await ModelRuntime.create();`
- For each `provider` in `dependencies.nativeProviders ?? []`: `modelRuntime.registerNativeProvider(provider);`
- `const settingsManager = dependencies.settingsManager ?? SettingsManager.create(location.cwd);`
- `const resourceLoader = dependencies.resourceLoader ?? new DefaultResourceLoader({ cwd: location.cwd, ... });`
- `const codingRegistry = await createCodingRegistry(settingsManager, location.cwd, getSubagentPolicy, { ...dependencies.prompt, resourceLoader, dynamicSections }, dynamicNamespaces, dependencies.builtins);`
- `harness = await Harness.open(storage, { models: modelRuntime, registry: codingRegistry, settings, env: envs.env, onReport: report }, runtimeContext);`
- Wire `dependencies.hostBridge` into `extension-ui-context` and tool execution without global singletons.

In `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`:
Implement `PiDurableEngine implements IAgentEngine`:
- Constructor receives `{ cwd, sessionDir, cli, dependencies: PiRuntimeDependencies }`.
- In `start(sessionDir)`: calls `this.instance = await openDurable({ sessionDir, cwd, cli, dependencies })`.
- In `submit(input, options)`:
  - Normalizes `input` into native text and image parts (`ImageContent[]`).
  - Target conversation resolution:
    - If `!options?.conversationId || options.conversationId === "1"`:
      call `const receipt = await this.instance.controller.submit(nativeInput, options?.deliverAs ?? "followUp");`
      `admissionReceipt = { requestId: receipt.requestId, conversationId: "1", status: "accepted" };`
    - If child `conversationId`:
      `const conv = await this.instance.harness.conversation(options.conversationId, runtimeContext);`
      `if (!conv) throw new SessionError("CONVERSATION_NOT_FOUND", "Conversation not found");`
      `const submission = await conv.submit({ type: "input", content: nativeInput, whenBusy: options?.deliverAs ?? "followUp" }, runtimeContext);`
      `admissionReceipt = { requestId: String(submission.id), conversationId: options.conversationId, status: "accepted" };`
  - Returns `PromptAdmissionReceipt` with native `id: receipt.requestId` (no synthetic random IDs).
- In `abort(conversationId)`:
  - If root (`!conversationId || conversationId === "1"`): call `await this.instance.controller.abort()`.
  - If child: `const conv = await this.instance.harness.conversation(conversationId, runtimeContext); await conv?.abort(runtimeContext, { background: true });`
- In `abortTask(taskId)`: calls `await this.instance.harness.abortTask(taskId, runtimeContext)`.
- In `compact(instructions)`: calls `await this.instance.controller.compact(instructions)`.
- In `setSubagentPolicy(record)`: calls `await this.instance.subagentPolicyHolder.setRecord(record)`.
- In `setModel(model)`: calls `await this.instance.controller.setModel(model)`.
- In `setThinkingLevel(level)`: calls `await this.instance.controller.setThinkingLevel(level)`.
- In `getState(conversationId)`: queries `conv = await this.instance.harness.conversation(targetId ?? 1, runtimeContext)`. Paginates all pages of `conv.entries({}, 50, cursor, runtimeContext)` to compute total `entryCount`. Returns `SessionStateDTO` with `sessionId`, `cwd`, `activeConversationId: String(conv.id)`, active model/thinking, and paginated `entryCount`.
- In `getTranscript(conversationId, limit)`: queries `conv = await this.instance.harness.conversation(targetId ?? 1, runtimeContext)`. Reads `paged = await conv.entries({ order: "ascending" }, limit ?? 50, undefined, runtimeContext)`. Maps each `entry` to `TranscriptEntryDTO`: extracts text and maps role (`"pi.user"` $\to$ `"user"`, `"pi.assistant"` $\to$ `"assistant"`). Returns `SessionTranscriptDTO`.
- In `getStats(conversationId)`: returns `SessionStatsDTO` with context window and token estimate.
- In `events(listener)`: attaches `DurableEventAdapter` and `RuntimeGraphSource` to forward canonical runner events.
- In `close()`: calls `await this.instance.close()`.

- [ ] **Step 6: Wire `assembleDurableZero` and Export Callable `main` in CLI (Resolves F03, F13)**

In `packages/runner/src/composition.ts`:
- Build `LocalNodeExecutionEnv` from `@durable-zero/execution` and `HostBridge` from `@durable-zero/runner`.
- Instantiate builtin extensions via `createCodemodeBuiltinExtension()` and `createPiResourceExtension()`.
- Bundle `dependencies: PiRuntimeDependencies` with `executionEnvFactory`, `hostBridge`, `builtins`.
- Pass `cli` options directly from `argv` into `PiDurableEngine({ sessionDir, cwd, cli, dependencies })`.
- Production runner contains ZERO test fixture imports or mock provider branches. CLI extensions passed via `--extension` are loaded by `runtime-loader.ts` through standard `DefaultResourceLoader`.
- Construct `coordinator = new SessionCoordinator({ engine, sessionDir })`.
- Explicitly call `await coordinator.start()`.
- Wire `coordinator.events(evt => server.sendNotification("session/event", evt))`.
In `packages/runner/src/main.ts`:
- Export `export async function main(argv: string[] = process.argv.slice(2)): Promise<void>`.
In `packages/cli/bin/durable-zero.js`:
- In `command === "serve"`: import `main` from `../../runner/dist/main.js` and call `await main(argv.slice(1))`.

- [ ] **Step 7: Run Walking Skeleton Test to verify GREEN**

Run: `node scripts/build.mjs && node --test --test-timeout 60000 packages/runner/test/e2e-walking-skeleton.test.ts`
Expected: PASS.
Commit:
```bash
git add packages/contracts/ packages/core/ packages/adapter-pi-durable/ packages/adapter-codemode/ packages/extension-pi-resource/ packages/runner/ packages/cli/ scripts/build.mjs
git commit -m "feat(runner): implement Slice 0 Walking Skeleton with real PiDurableEngine and E2E black-box test"
```

---

### Task 2: Host Tool Bridge, Reverse RPC & Dynamic Tool Registration (Resolves F06, F14, R6, R7)

**Files:**
- Create: `packages/protocol/src/methods/host.ts`
- Create: `packages/core/src/tools/host-bridge.ts` (Domain Port: `IHostBridge`)
- Create: `packages/runner/src/host/host-bridge.ts` (Runner Adapter: `HostBridge implements IHostBridge`)
- Modify: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
- Modify: `packages/adapter-pi-durable/src/engine/shared/extension-ui-context.ts`
- Delete: `packages/core/src/host-rpc.ts`
- Test: `packages/runner/test/e2e-host-tool-roundtrip.test.ts`

**Interfaces:**
- Consumes: `StdioJsonRpcServer.request()` in runner.
- Produces: `IHostBridge` in core, bidirectional `host/toolCall` and `host/interaction` in runner.

- [ ] **Step 1: Write failing E2E test for Host Tool Bridge reverse RPC**

In `packages/runner/test/e2e-host-tool-roundtrip.test.ts`:
Spawn compiled runner binary via `child_process.spawn` with `--provider mock`.
Client registers dynamic tool via `tools/register`:
`{"jsonrpc": "2.0", "id": 1, "method": "tools/register", "params": {"tools": [{"name": "calculator", "description": "Add numbers", "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}}}]}}`
Client sends prompt: `{"jsonrpc": "2.0", "id": 2, "method": "session/prompt", "params": {"content": "Compute 5+7 using calculator"}}`
Runner executes scripted model fixture, model calls tool `calculator`.
Runner sends reverse RPC request to client:
`{"jsonrpc": "2.0", "id": 101, "method": "host/toolCall", "params": {"toolName": "calculator", "arguments": {"a": 5, "b": 7}}}`
Client sends response:
`{"jsonrpc": "2.0", "id": 101, "result": {"content": [{"type": "text", "text": "12"}], "isError": false}}`
Runner receives response, passes to model, and completes turn with final text containing "12".
Test asserts:
1. Reverse request format is valid JSON-RPC 2.0.
2. Response is validated against Zod schema `hostToolResultSchema`.
3. If client does not respond within configurable timeout (`timeoutMs: 200` in test), `HostBridge` rejects and yields error diagnostic to Harness.
4. Second test case verifies `host/interaction` with kind `"approval"` receiving confirmation response.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test --test-timeout 30000 packages/runner/test/e2e-host-tool-roundtrip.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `IHostBridge`, `HostBridge`, and remove `host-rpc.ts`**

In `packages/protocol/src/methods/host.ts`:
Define `hostToolResultSchema` and `hostInteractionResponseSchema`.
In `packages/core/src/tools/host-bridge.ts`: declare interface `IHostBridge`.
In `packages/runner/src/host/host-bridge.ts`: implement `HostBridge implements IHostBridge` with configurable `timeoutMs` (default 30,000ms), injectable `idSource`, and runtime Zod validation.
In `packages/adapter-pi-durable/src/engine/shared/extension-ui-context.ts`: replace `requestHostInteraction` import with injected `IHostBridge`.
Delete `packages/core/src/host-rpc.ts` completely (eliminating `activeToolForwarder` and `setHostToolForwarder`).

- [ ] **Step 4: Run test to verify PASS**

Run: `node --test --test-timeout 30000 packages/runner/test/e2e-host-tool-roundtrip.test.ts`
Expected: PASS.
Commit:
```bash
git add packages/protocol/ packages/core/ packages/runner/ packages/adapter-pi-durable/
git commit -m "feat(runner): implement validated JSON-RPC 2.0 HostBridge and delete legacy host-rpc from core"
```



---

### Task 3: Headless Probe Mode (`--no-session`) (Resolves F04, F10, R7)

**Files:**
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Modify: `packages/runner/src/cli-args.ts`
- Test: `packages/runner/test/probe-mode.test.ts`

**Interfaces:**
- Consumes: CLI option `--no-session`.
- Produces: Read-only diagnostics and catalog server without SQLite persistence or file locks.

- [ ] **Step 1: Write failing test for `--no-session` probe mode**

In `packages/runner/test/probe-mode.test.ts`:
Spawn runner with `--no-session`.
Send request: `{"jsonrpc": "2.0", "id": 1, "method": "models/list", "params": {}}`.
Assert valid response with available models array.
Assert that directory `.durable/sessions` was NOT created on disk.
Send request: `{"jsonrpc": "2.0", "id": 2, "method": "session/prompt", "params": {"content": "hi"}}`.
Assert error response with application error code `-32000` and `error.data: { code: "PROBE_MODE_UNSUPPORTED" }`.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test --test-timeout 30000 packages/runner/test/probe-mode.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement probe mode in `composition.ts`**

In `packages/runner/src/composition.ts`:
If `options.noSession === true`:
- Do not instantiate SQLite store or lock files.
- Instantiate lightweight probe engine exposing `models/list` and `doctor`.
- Reject stateful session mutations with JSON-RPC error code `-32000` (`PROBE_MODE_UNSUPPORTED`).

- [ ] **Step 4: Run test to verify PASS**

Run: `node --test --test-timeout 30000 packages/runner/test/probe-mode.test.ts`
Expected: PASS.
Commit:
```bash
git add packages/runner/
git commit -m "feat(runner): implement non-locking headless probe mode for --no-session"
```

---

### Task 4: JSON-RPC 2.0 Protocol Conformance & Complete Capability Dispatch (Resolves F05, F08, R4, R6)

**Files:**
- Modify: `packages/protocol/src/jsonrpc/schema.ts`
- Modify: `packages/protocol/src/transport/request-dispatcher.ts`
- Modify: `packages/protocol/src/transport/stdio-server.ts`
- Create: `packages/runner/src/dispatch/session-dispatcher.ts`
- Modify: `packages/runner/src/composition.ts`
- Test: `packages/protocol/test/protocol-conformance.test.ts`
- Test: `packages/runner/test/capability-preservation.test.ts`

**Interfaces:**
- Consumes: JSON-RPC 2.0 specification §§4.1, 5, 5.1.
- Produces: Strict protocol conformance and full capability preservation dispatch.

- [ ] **Step 1: Write failing protocol conformance tests (Resolves F08)**

In `packages/protocol/test/protocol-conformance.test.ts`:
Assert:
1. Incoming notification (`id` is undefined) produces NO response (silence).
2. Unknown method produces error `-32601` (`Method not found`).
3. Response schema rejects payloads having both `result` and `error`.
4. Parse error produces `-32700`.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test --test-timeout 30000 packages/protocol/test/protocol-conformance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Fix protocol conformance in `@durable-zero/protocol`**

In `packages/protocol/src/jsonrpc/schema.ts`:
Enforce `result` XOR `error` via Zod discriminated union or superRefine.
In `packages/protocol/src/transport/request-dispatcher.ts`:
If `request.id === undefined` (notification), do NOT emit response.
If method not found in registry, return code `-32601`.

- [ ] **Step 4: Implement Capability Preservation Dispatch (Resolves F05, R6)**

In `packages/runner/src/dispatch/session-dispatcher.ts`:
Wire all capabilities from the Capability Preservation Matrix:
- Incoming request methods: `session/prompt` (supports pure text, pure images, text+images, and optional `conversationId`), `session/steer` (supports images and optional `conversationId`), `session/abort` (root or child `conversationId`), `session/abortTask` (`taskId: number`), `session/compact` (`instructions?: string`), `subagent/setPolicy` (validated `SubagentPolicyRecord`), `models/list`, `models/set` (`provider`, `modelId`), `models/setThinking` (`level`), `session/fork` (`sourceDir`, `targetDir`, `checkpointId`), `session/getState` (returns `SessionStateDTO` with `persistedTurns` and `lastTurn`), `session/getStats` (returns `SessionStatsDTO`), `binding/register` (`threadId`, `conversationId`, `parentThreadId`), `binding/list`.
- Reverse RPC response routing: host responses to `host/toolCall` and `host/interaction` are correlated to their pending promises in `StdioJsonRpcServer` and validated with Zod schemas.
- Notifications: outgoing `session/event` for stream deltas (`text_delta`, `tool_call_delta`, `turn_complete`) and graph updates.
- Dynamic tool registration: `tools/register` (`tools: ToolDefinition[]`).
In `packages/runner/test/capability-preservation.test.ts`:
Write literal tests verifying each method dispatches to `PiDurableEngine` with typed arguments and returns correct DTOs. Verify that `session/abort` withdraws tasks and emits `session_aborted` event, and that pure image inputs (`[{ type: "image", data: "...", mimeType: "image/png" }]`) are accepted without requiring dummy text.

- [ ] **Step 5: Run tests to verify PASS**

Run: `node --test --test-timeout 30000 packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-preservation.test.ts`
Expected: PASS.
Commit:
```bash
git add packages/protocol/ packages/runner/
git commit -m "feat(protocol): enforce strict JSON-RPC 2.0 conformance and implement full capability preservation dispatch"
```

---

### Task 5: Pure Core Decoupling, Build Script Cleanup & AST Boundary Enforcement (Resolves F01, F09, R8)

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Delete: `packages/core/src/jsonl.ts`
- Delete: `packages/core/src/cli-args.ts`
- Delete: `packages/core/scripts/build-runner.mjs`
- Test: `packages/core/test/boundary-enforcement.test.ts`

- [ ] **Step 1: Clean Core package.json and delete legacy files (Resolves F09, R8)**

In `packages/core/package.json`:
Keep Zod at `"zod": "^4.6.7"`. Remove all `@earendil-works/*` and `@durable-zero/adapter-*` dependencies.
Remove script `"build:runner": "node scripts/build-runner.mjs"`.
Remove export `"./runner": "./dist/runner.js"`.
Delete `packages/core/scripts/build-runner.mjs`, `packages/core/src/jsonl.ts`, and `packages/core/src/cli-args.ts`.
In `packages/core/src/index.ts`: export only pure domain files (`session/`, `models/`, `tools/`, `policy/`, `errors.ts`, `version.ts`).

- [ ] **Step 2: Implement automated AST boundary enforcement test (Resolves F09, R8)**

Create `packages/core/test/boundary-enforcement.test.ts`:
Parse all import and export statements across all files in `packages/core/src/` using TypeScript AST (`ts.createSourceFile`):
Assert:
1. Zero imports or re-exports matching `@earendil-works/*` (resolving relative paths, type-only imports, and dynamic imports).
2. Zero imports or re-exports matching `@durable-zero/adapter-*`.
3. Zero imports matching `node:fs` or `node:child_process` in domain logic (pure domain contracts only; concrete I/O isolated in tools/execution adapters).
4. Core `package.json` dependencies contain ONLY `zod` and `@durable-zero/contracts`.
5. Packaged runtime bundle (`packages/runner/dist/main.js`) contains zero unresolved `src/*.ts` imports.
6. Test executes as an isolated test case; it does not spawn a recursive subprocess runner that invokes itself.

- [ ] **Step 3: Run boundary test, full build, and strict typecheck to verify PASS**

Run: `node scripts/build.mjs`
Run: `pnpm tsc --noEmit`
Run: `npm test -- --test-timeout 30000` (with explicit 60s per-test exception for `packages/runner/test/e2e-walking-skeleton.test.ts`)
Expected: ALL PASS.
Commit:
```bash
git add packages/core/
git commit -m "chore(core): purge vendor/adapter dependencies and enforce sovereign core boundary"
```

---

### Task 6: Triple-Circuit Verification Gate (S9) & Ledger Finalization (Resolves F12, R9)

**Files:**
- Verify: Circuit A (`arch-rules-implementation-review`)
- Verify: Circuit B (`arch-improvement-product-review`)
- Verify: Circuit C (Orchestrator Diff Gate)
- Modify: `docs/arch-improvement/ledger.md`

- [ ] **Step 1: Circuit A — Semantic Architecture Audit**
  Audit on candidate SHA against AP-010..AP-076. Answer the 4 Mandatory Semantic Probes:
  1. *Dependency Traceability:* Prove exact line in `coordinator.ts` invoking `IAgentEngine.submit()`.
  2. *Runtime Completeness:* Confirm 0 dangling operational files in `core/src/`.
  3. *Entry Point Wiring:* Prove `bin/durable-zero.js` calls `main()` of `@durable-zero/runner`.
  4. *Anti-Gaming Check:* Confirm classes contain genuine orchestration, not fake ID generators.

- [ ] **Step 2: Circuit B — True Black-Box Product Audit**
  Execute compiled binary `packages/cli/bin/durable-zero.js serve`:
  - Happy Path Journey: `session/prompt` returns token stream and completed turn.
  - Empty State Journey: `--no-session` boots probe mode cleanly.
  - Error Recovery Journey: Invalid JSON-RPC request returns standard JSON-RPC 2.0 error `-32600`.

- [ ] **Step 3: Circuit C — Orchestrator Diff Gate**
  Lead orchestrator inspects `git diff origin/main..HEAD --stat` and reviews key files (`coordinator.ts`, `pi-durable-engine.ts`, `composition.ts`, `host-bridge.ts`).

- [ ] **Step 4: Record Cycle 7 in Ledger & Complete Learn Gate (S11)**
  Append Cycle 7 completion record to `docs/arch-improvement/ledger.md` based on actual implementation observations.

Commit:
```bash
git add docs/arch-improvement/ledger.md
git commit -m "docs(ledger): record Cycle 7 completion with Triple-Circuit Gate verification and durable lessons"
```

---

## Execution Handoff & Governance Protocol (Resolves F12, R9)

- **Orchestration Ownership:** Parent thread `thr_9yjb93iwmn` owns workflow progression, S9 dispatch, and user approval gates.
- **Implementer Constraints:** One bounded implementer subagent per slice. Subagent receives exact task brief, interfaces, and constraints.
- **Resume-Based Fix Loop:**
  - Review findings in rounds 1–3 resume the original implementer session with structured findings.
  - Rounds 4–5 dispatch a fresh implementer on Gemini 3.8 High.
  - 5-round circuit breaker escalates to orchestrator; unresolved P0–P2 issues are marked `blocked` and NEVER parked as `PASS`.
- **S9 Verification Gates:** Independent Architectural and Product Reviewers run on the same candidate SHA after meaningful slices (Slice 0 in Task 1, Host Bridge in Task 2, and Final in Task 6).
- **Orchestrator Diff Gate:** The orchestrator personally audits `git diff origin/main..HEAD --stat` before authorizing branch merge.

---

## Explicit Findings Disposition (F01–F14)

| Finding ID | Title | Disposition | How Resolved in This Plan |
| :--- | :--- | :--- | :--- |
| **F01** | Runtime вынос неполный (замыкание зависимостей) | **Addressed** | Full Dependency Closure Inventory maps all 87 files; Task 1 relocates the complete 50-file executable runtime closure into `adapter-pi-durable/src/engine/` atomically, splits `prompt.ts`, and migrates `engine.ts` wrapper logic into `PiDurableEngine`. |
| **F02** | Вызовы несуществующих методов `openDurable` | **Addressed** | Canonical Design Amendment §4 & Task 1 Steps 4–5: `IAgentEngine` defines pure typed ports with zero `any`; `PiDurableEngine` maps exact native signatures: `controller.submit(nativeInput, deliverAs)`, `harness.conversation(id).submit()`, `controller.abort()`, native `submission.id` as `requestId`, `DurableEventAdapter`. |
| **F03** | Смена `import` в CLI не запускает runner | **Addressed** | Task 1 Step 6 exports callable `main(argv)` from `runner/src/main.ts` and explicitly invokes `await main(argv.slice(1))` from `cli/bin/durable-zero.js`. |
| **F04** | Не определён единственный владелец session/lock | **Addressed** | Canonical Design Amendment §2 & Task 1 Steps 4–5: `PiDurableEngine` is the single exclusive owner of session database, lock, and Harness. `coordinator.start()` delegates to `engine.start()`; no redundant `store.acquireLock()`. |
| **F05** | Полный переход транспорта не сохраняет весь функционал | **Addressed** | Capability Preservation Matrix maps all 16 legacy commands from `runnerCommandSchema` (14 incoming requests + 2 reverse response flows); Task 4 Step 4 implements full capability dispatch with support for pure image inputs, root/child targeting, and `session/abort`. |
| **F06** | `HostBridge` не определён как исполнимый DI-контракт | **Addressed** | Task 2 Steps 1–4: declares domain port `IHostBridge`, implements `HostBridge` in runner with schema validation, configurable timeout (`timeoutMs`), and injected `idSource`, completely deletes `core/src/host-rpc.ts`. |
| **F07** | Срез 0 разделён на горизонтальные задачи со слабым оракулом | **Addressed** | Task 1 Step 1 unifies the entire vertical slice into ONE reviewable Slice 0 task with a strict black-box E2E test verifying scripted external model streaming, turn completion with correlated native `requestId`, clean SIGTERM exit, and persisted turn readback from SQLite after process restart. |
| **F08** | «Strict JSON-RPC 2.0» без conformance задачи | **Addressed** | Task 4 Steps 1–3: dedicated protocol conformance test and fixes: notification silence, `-32601` for unknown methods, and strict `result` XOR `error` schema validation. |
| **F09** | Проверки core и сборки не обеспечивают gates | **Addressed** | Task 1 & 5 remove `runner-server.ts` from `scripts/build.mjs`, add isolated AST boundary tests resolving relative/type-only imports and checking package dependencies, and enforce `--test-timeout 30000` (with 60s E2E exception). |
| **F10** | Review Focus без проверяемых literal assertions | **Addressed** | Review Focus section and owning tasks provide literal code assertions and name specific production mutations caught for every single item; arbitrary line caps removed. |
| **F11** | Spec ссылается на старый план с конфликтами | **Addressed** | Canonical Design Amendment section explicitly overrides and supersedes stale master plan clauses with verified architectural decisions. |
| **F12** | Оркестрация, re-review и Learn Gate не зафиксированы | **Addressed** | Execution Handoff & Governance Protocol defines orchestrator ownership, resume-based fix loops, S9 dual-circuit on candidate SHA, and S11 Learn Gate. |
| **F13** | Фасад над `openDurable` сохраняет вторую сборку | **Addressed** | Canonical Design Amendment §4 & Task 1 Step 5: Composition Root constructs concrete adapters and injects typed `PiRuntimeDependencies` into `PiDurableEngine`; `openDurable` and `runtime-loader` forward and consume them directly into `Harness.open()`. |
| **F14** | Два RPC hop ошибочно объявлены дублирующим tracker | **Addressed** | Clarified separation of hops: runner<->host tool call and host<->BB are distinct ID spaces. Cycle 7 acceptance verified against generic JSON-RPC client without touching BB. |
