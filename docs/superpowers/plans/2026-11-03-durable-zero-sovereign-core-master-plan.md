# Durable-Zero Sovereign Core & Multi-Package Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `durable-zero` into a modular, package-first sovereign headless agent runtime where bounded contexts live in dedicated workspace packages (`@durable-zero/protocol`, `@durable-zero/execution`, `@durable-zero/core`, `@durable-zero/extension-pi-resource`, `@durable-zero/runner`), the Composition Root lives strictly at the executable boundary (`@durable-zero/runner`), and client interaction is unified on a pure JSON-RPC 2.0 stdio server.

**Architecture:** Monorepo package-level Hexagonal Architecture (Ports & Adapters, Screaming Architecture). Inbound Adapters (JSON-RPC 2.0 stdio transport in `@durable-zero/protocol`) wrap the Core Domain (`@durable-zero/core`), while Outbound SPIs (`IExecutionEnvironment` in `@durable-zero/execution`, `IConfigProvider` in `@durable-zero/extension-pi-resource`) are injected via Strategy pattern in the Composition Root (`@durable-zero/runner`). Zero backwards-compatibility shims.

**Tech Stack:** TypeScript 5.9, Node.js 22+ (ESM), pnpm workspaces, `@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-agent-core` 1.5.0, `@earendil-works/pi-ai` 1.5.0, `@earendil-works/chord` 1.5.0, `quickjs-wasi`, `node:test`.

---

## Architecture Context Map

- **Stage:** `prod` / `infra_harness`
- **Target Repository:** `/Users/vanya/Projects/durable-zero`
- **Applicable Critical AP Gates:**
  - **AP-010 (Modular Monolith & Ports & Adapters):** Domain boundaries enforced at package level, not through relative file imports.
  - **AP-011 (High Cohesion & Low Coupling):** Grouping by functional domains (Screaming Architecture), never by technical type buckets (`ports/`, `wire/`).
  - **AP-012 (Fail-Fast & Dependency Inversion):** Explicit interfaces between packages; dependencies flow inward toward domain models.
  - **AP-013 (Data Integrity & SQLite Atomicity):** Message admissions and state transitions commit atomically via `root.submit(tx, draft)` inside `harness.commit()`.
  - **AP-020 & AP-073 (Composition Root & Separation of Declaration from Configuration):** Domain packages (`core`, `protocol`, `execution`) declare interfaces and passive factories; object wiring and registry population occur exclusively in the application runner (`packages/runner`).
  - **AP-071 (Node.js Default):** Native Node.js ESM baseline.
  - **AP-072 (Domain Strategies over Procedural Switch/Case):** Transports, execution environments, and configuration sources are polymorphic strategies.

---

## Semantic Package Architecture (Target Monorepo Structure)

```
packages/
├── protocol/                     <- @durable-zero/protocol (Independent Inbound Wire Package)
│   ├── src/
│   │   ├── jsonrpc/              <- Pure JSON-RPC 2.0 Schema & Types (Request, Response, Error)
│   │   ├── methods/              <- Standard Agent Wire Methods (session/prompt, session/cancel, host/toolCall)
│   │   └── transport/            <- Full-Duplex StdioJsonRpcServer implementation
│   └── package.json              <- Depends only on zod. Zero engine dependencies.
│
├── execution/                    <- @durable-zero/execution (Execution Sandbox Adapter)
│   ├── src/
│   │   ├── adapters/             <- LocalNodeExecutionEnv (default) & MockExecutionEnv
│   │   └── index.ts              <- Implements IExecutionEnvironment from @durable-zero/core
│   └── package.json              <- Depends on @durable-zero/core, Node builtins. Zero agent dependencies.
│
├── core/                         <- @durable-zero/core (SOVEREIGN DOMAIN - SCREAMING ARCHITECTURE)
│   ├── src/
│   │   ├── session/              <- Bounded Context: Sessions & Storage SPI
│   │   │   ├── store.ts          <- Port SPI: ISessionStore, TaskRecord
│   │   │   ├── session.ts        <- Aggregate: Session entity & state transitions
│   │   │   ├── coordinator.ts    <- Service: SessionCoordinator (prompt, abort, streaming)
│   │   │   └── tokens.ts         <- Value Object: Token metric counters (task-tokens)
│   │   │
│   │   ├── subagents/            <- Bounded Context: Subagents & Security Policies
│   │   │   ├── policy-store.ts   <- Aggregate/Store: SubagentPolicyStore (CAS, optimistic locks)
│   │   │   ├── policy.ts         <- Value Objects: SubagentPolicyRecord, Profile
│   │   │   └── manager.ts        <- Service: SubagentManager (cascading abort, depth recursion)
│   │   │
│   │   ├── models/               <- Bounded Context: LLM & Reasoning SPI
│   │   │   ├── provider.ts       <- Port SPI: IModelProvider (resolveModel, generateStream)
│   │   │   └── types.ts          <- Value Objects: ModelRef, StreamDelta, ThinkingLevel
│   │   │
│   │   ├── tools/                <- Bounded Context: Tooling, Sandbox SPI & Execution SPI
│   │   │   ├── registry.ts       <- Port/Registry: IToolRegistry, ToolDefinition, ToolCall, ToolResult
│   │   │   ├── sandbox.ts        <- Port SPI: ICodemodeRunner, CodemodeExecutionResult
│   │   │   └── execution-env.ts  <- Port SPI: IExecutionEnvironment, EnvTarget, ExecResult
│   │   │
│   │   └── index.ts              <- Unified Screaming Domain Entry Point
│   ├── test/                     <- Pure unit tests running on In-Memory mocks (< 50ms)
│   └── package.json              <- Depends on zod. STRICTLY ZERO dependencies on @earendil-works/* or native binaries!
│
├── adapter-pi-durable/           <- @durable-zero/adapter-pi-durable (Storage ACL)
│   ├── src/
│   │   ├── store.ts              <- Implements ISessionStore (core/session/store.ts) via Pi Durable SQLite
│   │   ├── session-storage.ts    <- Relocated: PID safety, lock eviction, document storage
│   │   ├── session-fork.ts       <- Relocated: database forking, checkpoint tree
│   │   └── event-adapter.ts      <- Relocated: DurableEventAdapter (tool delta translation for UI)
│   ├── test/                     <- Integration tests with real SQLite database
│   └── package.json              <- Depends on @durable-zero/core, @earendil-works/pi-durable, proper-lockfile.
│
├── adapter-pi-ai/                <- @durable-zero/adapter-pi-ai (LLM & Agent Loop ACL)
│   ├── src/
│   │   ├── provider.ts           <- Implements IModelProvider (core/models/provider.ts) via @earendil-works/pi-ai
│   │   └── agent-driver.ts       <- Drives agent loop via @earendil-works/pi-agent-core
│   ├── test/                     <- Integration tests for model resolution & streaming
│   └── package.json              <- Depends on @durable-zero/core, @earendil-works/pi-ai, @earendil-works/pi-agent-core.
│
├── adapter-codemode/             <- @durable-zero/adapter-codemode (Sandbox ACL)
│   ├── src/
│   │   ├── runner.ts             <- Implements ICodemodeRunner (core/tools/sandbox.ts) via QuickJS WASM sandbox.start()
│   │   └── journal.ts            <- Replays journaled tool calls deterministically
│   ├── test/                     <- Integration tests for QuickJS WASM sandbox isolation
│   └── package.json              <- Depends on @durable-zero/core, @earendil-works/pi-codemode, quickjs-wasi.
│
├── extension-pi-resource/        <- @durable-zero/extension-pi-resource (Pi Setup ACL)
│   ├── src/
│   │   ├── pi-resource-ext.ts    <- Native Pi Durable defineExtension wrapping SettingsManager & ResourceLoader
│   │   └── contracts.ts          <- Implements IConfigProvider & ISkillLoader
│   └── package.json              <- Depends on @durable-zero/core, @earendil-works/pi-durable, @earendil-works/pi-coding-agent.
│
└── runner/                       <- @durable-zero/runner (TRUE COMPOSITION ROOT - AP-020, AP-073)
    ├── src/
    │   ├── composition.ts        <- Wires Core + Adapters (Pi Durable + Pi AI + Codemode + Stdio Transport)
    │   └── main.ts               <- Executable entrypoint (compiled to dist/runner.js)
    └── package.json              <- Depends on all workspace packages. Assembles the executable.
```

### Critical Architectural Assessment: "Core as the Port Authority" (AP-011 & AP-012)

**Critical evaluation of the thesis: *"Core should contain declarations for everything implemented in packages"*:**
1. **YES for all Outbound / Driven SPIs (Dependency Inversion Principle - AP-012):**
   In clean Hexagonal Architecture, the Core hexagon OWNS the contracts it depends upon. Therefore, every outbound adapter package (`adapter-pi-durable`, `adapter-pi-ai`, `adapter-codemode`, `execution`) implements an interface **declared directly in Core**:
   - `core/session/store.ts` (`ISessionStore`) $\leftarrow$ implemented by `adapter-pi-durable`
   - `core/models/provider.ts` (`IModelProvider`) $\leftarrow$ implemented by `adapter-pi-ai`
   - `core/tools/sandbox.ts` (`ICodemodeRunner`) $\leftarrow$ implemented by `adapter-codemode`
   - `core/tools/execution-env.ts` (`IExecutionEnvironment`) $\leftarrow$ implemented by `execution`
2. **NO for Inbound / Driving Protocols (Primary Drivers):**
   The wire-level JSON-RPC 2.0 protocol (`@durable-zero/protocol`) is a *driving client adapter*. Core must remain blissfully unaware of JSON-RPC 2.0 frames, HTTP status codes, or CLI terminal formatting. Core exposes domain use-case services (`SessionCoordinator.prompt()`, `SessionCoordinator.abort()`), and `@durable-zero/protocol` translates incoming wire frames into these core service calls.
3. **Screaming Architecture over Technical Buckets (AP-011):**
   Within `@durable-zero/core`, files are grouped strictly by **Domain Bounded Contexts** (`session/`, `subagents/`, `models/`, `tools/`), not by architectural categories (`ports/`, `domain/`, `services/`, `policy/`). Inside each context, the Port SPI lives beside the Aggregate and the Domain Service that consumes it.

### Dependency Direction Matrix (Strict Inward Hexagonal Flow):

```
                               @durable-zero/protocol
                              (Inbound Client Driver)
                                         |
                                         v
                                @durable-zero/core
                          (PURE DOMAIN: Screaming Contexts)
                             Declares all Outbound SPIs
                                         ▲
        +--------------------------------+-------------------------------+
        |                                |                               |
@durable-zero/                   @durable-zero/                  @durable-zero/
adapter-pi-durable               adapter-pi-ai                   adapter-codemode
(implements ISessionStore)     (implements IModelProvider)     (implements ICodemodeRunner)
        │                                │                               │
        v                                v                               v
[@earendil-works/pi-durable]     [@earendil-works/pi-ai]         [@earendil-works/pi-codemode]
        │                                │                               │
        +--------------------------------+-------------------------------+
                                         |
                                         v
                               @durable-zero/runner
                                (Composition Root)
```

---

## Global System Blind Spots & Architectural Mitigations

A deep cross-system audit against downstream consumers (`bb-plugin-provider-pi-durable`, `dpi-backend`, ACP/Zed clients) and build assets revealed 7 critical global blind spots:

### 1. Full-Duplex Bidirectional JSON-RPC 2.0 (Host Tools & Dialog Callbacks)
- **Blind Spot:** A naive JSON-RPC server only handles incoming requests and emits notifications. But when an agent calls host-provided tools (e.g. `AskUserQuestion`, browser automation, BB IDE tools), the agent must act as a caller, sending an outgoing request to the client (`method: "host/toolCall"`, `method: "host/interaction"`) and awaiting the client's result.
- **Mitigation:** `StdioJsonRpcServer` in `@durable-zero/protocol` implements full duplex JSON-RPC 2.0:
  * Inbound: `handler(method, params)` resolves incoming client requests (`session/prompt`, `session/cancel`).
  * Outbound Requests: `request(method, params): Promise<unknown>` assigns correlation IDs, sets configurable timeouts (120s), and resolves upon receiving the client's matching response.
  * Notifications: `sendNotification(method, params)` for fire-and-forget streaming (`session/event`).

### 2. Downstream Host Contract & Subpath Exports Preservation
- **Blind Spot:** `bb-plugin-provider-pi-durable` and `dpi-backend` rely on specific entrypoints:
  * `esmRequire.resolve("durable-zero/runner")`
  * `import { forkSessionDatabase } from "durable-zero/core"`
  * `import { filterSnapshotForConversation } from "durable-zero/contracts"`
  Breaking these subpath exports would break host orchestration without compiler warnings.
- **Mitigation:** The root `package.json` maintains `./runner`, `./core`, and `./contracts` subpath exports mapping to the new modular packages, and `@durable-zero/core` preserves `forkSessionDatabase`.

### 3. Build System (`scripts/build.mjs`) & WASM Asset Placement
- **Blind Spot:** `quickjs-wasi` requires `quickjs.wasm` adjacent to the executed bundle. Currently `scripts/build.mjs` only copies it to `packages/core/dist/quickjs.wasm`. If the runner moves to `packages/runner/dist/runner.js`, codemode scripts will throw runtime WASM resolution errors.
- **Mitigation:** `scripts/build.mjs` is updated to bundle all workspace packages (`protocol`, `execution`, `core`, `extension-pi-resource`, `runner`) and copies `quickjs.wasm` directly into `packages/runner/dist/quickjs.wasm`.

### 4. Out-of-Band Control Channel (`control.jsonl`)
- **Blind Spot:** In long-running background tasks or Docker containers where stdio might be saturated, the supervisor aborts hung tasks via `control.jsonl` (`startRunnerControlChannel`).
- **Mitigation:** `control-channel.ts` is explicitly preserved in the Green Zone inside `@durable-zero/core/session/control-channel.ts`.

### 5. Multi-Package Test Runner Configuration
- **Blind Spot:** Root `package.json` had a hardcoded test glob targeting only `contracts`, `cli`, and `core`. New packages (`protocol`, `execution`, `runner`) would be silently skipped by `npm test`.
- **Mitigation:** Root test script updated to `node --test packages/*/test/*.test.ts`, ensuring all 177+ tests across all packages run on every invocation.

### 6. Acyclic Dependency Invariant
- **Blind Spot:** Risk of circular dependencies between `@durable-zero/core` and `@durable-zero/runner`.
- **Mitigation:** Strict acyclic DAG enforced by pnpm workspaces:
  `protocol` & `execution` (0 dependencies) -> `core` (pure domain) -> `runner` (Composition Root).

### 7. Codemode Session-Backed Store Persistence
- **Blind Spot:** In codemode scripts, `store(key, value)` and `load(key)` must persist across process restarts.
- **Mitigation:** Codemode state is mapped directly to Pi Durable SQLite documents via atomic `root.submit(tx, draft)` (AP-013).

### 8. Event Streaming Pipe in Composition Root (Real-Time Text & Tool Progress)
- **Blind Spot:** Calling `coordinator.prompt()` only admits input. If the runner does not pipe `coordinator.events(...)` to `transport.sendNotification("session/event", event)`, the client IDE receives `status: "accepted"` and hangs indefinitely without receiving text deltas, assistant turns, or tool progress.
- **Mitigation:** In `packages/runner/src/composition.ts`, `coordinator.events()` is explicitly subscribed and forwarded to `transport.sendNotification("session/event", event)`.

### 9. Host Tool Delegation Registration (`HostToolBridge` for `AskUserQuestion`)
- **Blind Spot:** Although the transport supports `request("host/toolCall")`, the agent needs tools registered with `pi-agent-core` whose `execute()` delegates to the host over JSON-RPC. Downstream `bb-tools-extension.ts` also imports `forwardHostToolCall` and `requestHostInteraction` from `durable-zero/core`.
- **Mitigation:** `packages/runner/src/host-tool-bridge.ts` configures `setHostToolForwarder` and `setHostInteractionRequester`, and `forwardHostToolCall` is re-exported from `durable-zero/core` for seamless backwards compatibility.

### 10. Multi-Thread Process Topology & CLI Arguments (1 Process = 1 Thread = 1 DB Lock)
- **Blind Spot:** BB IDE launches a separate Node.js child process per thread with CLI arguments: `--session <path> --cwd <dir> --provider <p> --model <m> --thinking <t>`. If the runner ignores CLI arguments, multiple threads collide on the same `.durable-session` lock in `process.cwd()`.
- **Mitigation:** `packages/runner/src/cli-args.ts` is relocated to `@durable-zero/runner`, and `main.ts` parses `process.argv.slice(2)` into `assembleDurableZero({ sessionDir: args.sessionDir ?? args.session, ... })`.

### 11. Crash & Lock Cleanup Lifecycle
- **Blind Spot:** If Node.js terminates on `uncaughtException` or `unhandledRejection`, SQLite WAL and `.lock` files remain orphaned on disk, locking subsequent runs of the thread.
- **Mitigation:** `packages/runner/src/main.ts` binds `SIGTERM`, `SIGINT`, `uncaughtException`, and `unhandledRejection` to `await runner.close()`, guaranteeing atomic unlock and sandbox disposal.

---

To prevent accidental loss of mature, battle-tested domain logic (175 tests across 64 suites), all existing code is categorized into three explicit zones before refactoring:

| Zone | Files / Modules | Action & Target Destination | Rationale & Test Invariant |
|---|---|---|---|
| 🟢 **Green: Preserve in Core** | `policy/subagent-policy-store.ts`, `policy/resolver.ts`, `policy/types.ts` | Refactor into `@durable-zero/core/src/subagents/` | Pure domain policies: CAS optimistic locking, policy inheritance. Refactored to take `DomainModel[]` instead of `pi-ai` types. Covered by `subagent-policy-store.test.ts`. |
| 🟢 **Green: Preserve in Core** | `session-commands.ts`, `session-state-commands.ts`, `binding-commands.ts` | Extract clean `SessionCoordinator` in `@durable-zero/core/src/session/` | Preserves command dispatch (`prompt`, `cancel`, `steer`, `set_model`, task dispatch). Covered by `canonical-command.test.ts`. |
| 🟢 **Green: Preserve in Core** | `compaction-hooks.ts`, `task-tokens.ts`, `control-channel.ts` | Move to `@durable-zero/core/src/session/` | Pure domain: compaction error boundaries, token metric normalization, out-of-band task abort. Covered by `compaction-hooks.test.ts`, `control-channel.test.ts`. |
| 🟢 **Green: Storage Adapter** | `session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts` | Refactor into `@durable-zero/adapter-pi-durable/` | Implements `ISessionStore`. Preserves SQLite document atomicity, PID safety, and session branching (AP-013). Covered by `session-fork.test.ts`, `session-storage-pid-safety.test.ts`. |
| 🟢 **Green: Storage Adapter** | `subagent-policy-ack.ts`, `runtime-controller.ts`, `runtime.ts` | Move to `@durable-zero/adapter-pi-durable/` | Infrastructure persistence: `SubagentPolicyAckDoc` (`defineDoc`), `Harness` lifecycle, task subscriptions. |
| 🟢 **Green: Event Adapter** | `bridge/durable-event-adapter.ts`, `ViewStreamProjector`, `task-labels.ts` | Move to `@durable-zero/adapter-pi-durable/` as Outbound Event Port | Preserves critical tool delta translation with args and task labeling for UI. Covered by `watch-events-compat.test.ts`. |
| 🔵 **Blue: Model Adapter** | `model-setup.ts` | Adopt in `@durable-zero/adapter-pi-ai/` (`pi-ai` & `pi-agent-core`) | Implements `IModelProvider`. Eliminates custom bicycles; reuses upstream tested agent state machine. |
| 🔵 **Blue: Storage Adapter** | `runtime-graph-mapper.ts`, `runtime-graph-receipts.ts`, `runtime-graph-source.ts`, `runtime-graph-state.ts` | Adopt in `@durable-zero/adapter-pi-durable/` via `harness.watchTaskGraph()` | Replaces ~25KB of custom SQLite row-mapping bicycles with native task graph subscriptions. |
| 🔵 **Blue: Sandbox Adapter** | `builtin-extensions/codemode.ts` | Upgrade to `@durable-zero/adapter-codemode/` (`sandbox.start()`) | Implements `ICodemodeRunner`. Upgrades basic `.execute()` to deterministic replay journaling with state stored in session documents. |
| 🔵 **Blue: Pi Config Adapter** | `prompt.ts`, `extension-mount.ts`, `tool-adapter.ts` | Move to `@durable-zero/extension-pi-resource/` | Encapsulates `SettingsManager`, `DefaultResourceLoader`, skill formatting, and Pi extension loading. |
| 🔴 **Red: Bike Elimination** | `subagent-courier.ts`, `subagent-watcher.ts`, `watcher-compat.ts` | DELETE (safe removal) | Obsolete polling bicycle; fully replaced by native task ownership in Pi Durable 1.5.0. |
| 🔴 **Red: Bike Elimination** | `host-rpc.ts`, `runner-channel.ts` | DELETE (safe removal) | Obsolete custom RPC with timeout hacks; replaced by standard full-duplex JSON-RPC 2.0 server in `@durable-zero/protocol`. |
| 🔴 **Red: Bike Elimination** | `stdout-guard.ts` | DELETE (safe removal) | Custom stdout hijacking is unnecessary when using clean, framed stdio JSON-RPC transport. |

### Regression Defense Invariant
At every step of each cycle, the full existing test suite (`npm test`) must pass (177 tests green). Tests are migrated or re-targeted alongside their modules, ensuring zero functional degradation.

### Refactoring Discipline: Preservation by Relocation & Upstream Adoption
1. **Never Rewrite What Already Works:** Do not write naive replacements for `session-storage.ts`, `session-fork.ts`, `policy/*`, or `bridge/durable-event-adapter.ts`. Relocate these proven files to their target package/directory and update imports.
2. **Backward-Compatible Workspace Re-exports during Migration:** During Cycle 1 and Cycle 2, `packages/contracts/src/index.ts` re-exports from `@durable-zero/protocol` and `@durable-zero/execution` so that existing consumers and tests continue to pass without a single regression.
3. **Selective Upstream Replacement:** Only replace custom code where upstream Pi 1.5.0 provides a strictly superior, first-class alternative (`harness.watchTaskGraph()` for custom mappers; `ownership: { kind: "task" }` for couriers; `pi-agent-core` for agent loops; `pi-ai` for models). Keep custom business logic (policy store, CAS optimistic locking, tool argument reconstruction) intact.
4. **Test Separation Invariant:** Core unit tests run in `packages/core/test/` against in-memory mocks (`MemorySessionStore`, `MockModelProvider`) in milliseconds. Infrastructure tests involving real SQLite, locks, and WASM run in `packages/adapter-pi-durable/test/` and `packages/adapter-codemode/test/`.


---

1. **Semantic Mismatch:** MCP (Model Context Protocol) is designed for **LLM -> Tool Providers** (Agent is Client, Tool is Server). Our client transport is **IDE/User -> Agent** (IDE is Client, Agent is Server).
2. **Technical Mismatch:** The `StdioTransport` in `@earendil-works/pi-mcp` is an outbound client transport that calls `crossSpawn(command, args)` to spawn child tool processes. It cannot serve as our agent's server, which must listen to its own `process.stdin` and write to `process.stdout`.
3. **Domain Purity:** Pulling `pi-mcp` for client transport couples our agent protocol to `McpError` and tool-specific error codes instead of standard JSON-RPC 2.0 / ACP error codes (`-32600`, `-32603`).
4. **Resolution:** We implement a clean, 50-line `StdioJsonRpcServer` in `@durable-zero/protocol`. We use `@earendil-works/pi-mcp` strictly where it belongs — as an Outbound Tool Provider for MCP tools.

---

## Sequential Arch Improvement Cycles

---

### Cycle 1: Package Extraction (`protocol` & `execution`) & Pluggable Environment

**Goal:** Create independent packages `@durable-zero/protocol` and `@durable-zero/execution` in `packages/`, removing technical `wire-*` groupings, and plug `ExecutionEnvFactory` into `@durable-zero/core`.

#### Task 1.1: Create `@durable-zero/protocol` Package with Full-Duplex JSON-RPC 2.0

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/jsonrpc/schema.ts`
- Create: `packages/protocol/src/jsonrpc/types.ts`
- Create: `packages/protocol/src/transport/interface.ts`
- Create: `packages/protocol/src/transport/stdio-server.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/protocol.test.ts`

- [ ] **Step 1: Write failing test for full-duplex JSON-RPC 2.0 server**

Create `packages/protocol/test/protocol.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import {
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  StdioJsonRpcServer,
  type ITransportStrategy,
} from "../src/index.ts";

describe("@durable-zero/protocol Full-Duplex Server", () => {
  it("validates JSON-RPC 2.0 request envelope strictly", () => {
    const valid = jsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      id: "req_1",
      method: "session/prompt",
      params: { content: "hello" },
    });
    assert.equal(valid.success, true);

    const invalid = jsonRpcRequestSchema.safeParse({
      id: "req_1",
      method: "session/prompt",
    });
    assert.equal(valid.success, false);
  });

  it("processes inbound client requests and responds with JSON-RPC 2.0 result", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, enc, cb) { outputBuffer += chunk.toString(); cb(); },
    });

    const server = new StdioJsonRpcServer({
      stdin: input,
      stdout: output,
      handler: async (method, params) => {
        if (method === "session/prompt") return { status: "accepted", prompt: params.content };
        throw new Error(`Unknown method: ${method}`);
      },
    });
    server.start();

    input.push(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/prompt", params: { content: "test" } }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    const response = JSON.parse(outputBuffer.trim());
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.deepEqual(response.result, { status: "accepted", prompt: "test" });
    server.stop();
  });

  it("supports outbound requests to client (host/toolCall) and resolves on response", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, enc, cb) { outputBuffer += chunk.toString(); cb(); },
    });

    const server = new StdioJsonRpcServer({ stdin: input, stdout: output, handler: async () => ({}) });
    server.start();

    const requestPromise = server.request("host/toolCall", { toolName: "ask_user", question: "continue?" });
    await new Promise((r) => setTimeout(r, 20));

    const sentRequest = JSON.parse(outputBuffer.trim());
    assert.equal(sentRequest.method, "host/toolCall");
    assert.ok(sentRequest.id);

    input.push(JSON.stringify({ jsonrpc: "2.0", id: sentRequest.id, result: { answer: "yes" } }) + "\n");
    const result = await requestPromise;
    assert.deepEqual(result, { answer: "yes" });
    server.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/protocol/test/protocol.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts'"

- [ ] **Step 3: Implement `@durable-zero/protocol` package**

Create `packages/protocol/package.json`:
```json
{
  "name": "@durable-zero/protocol",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "zod": "^4.6.7"
  }
}
```

Create `packages/protocol/src/jsonrpc/schema.ts`:
```typescript
import { z } from "zod";

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
});

export const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
```

Create `packages/protocol/src/jsonrpc/types.ts`:
```typescript
import { z } from "zod";
import {
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  jsonRpcNotificationSchema,
} from "./schema.ts";

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;
export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;
export type JsonRpcWireMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
```

Create `packages/protocol/src/transport/interface.ts`:
```typescript
import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";

export interface ITransportStrategy {
  start(): Promise<void> | void;
  send(message: JsonRpcWireMessage): Promise<void> | void;
  request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  sendNotification(method: string, params: Record<string, unknown>): void;
  close(): Promise<void> | void;
}
```

Create `packages/protocol/src/transport/stdio-server.ts`:
```typescript
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { jsonRpcRequestSchema, jsonRpcResponseSchema } from "../jsonrpc/schema.ts";
import type { ITransportStrategy } from "./interface.ts";
import type { JsonRpcWireMessage } from "../jsonrpc/types.ts";

export interface StdioJsonRpcServerOptions {
  stdin?: Readable;
  stdout?: Writable;
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

interface PendingOutbound {
  resolve: (res: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class StdioJsonRpcServer implements ITransportStrategy {
  private stdin: Readable;
  private stdout: Writable;
  private handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private nextRequestId = 0;
  private pendingOutbound = new Map<string | number, PendingOutbound>();
  private onDataHandler = (chunk: Buffer) => { void this.handleChunk(chunk); };

  constructor(options: StdioJsonRpcServerOptions) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.handler = options.handler;
  }

  public start(): void {
    this.stdin.on("data", this.onDataHandler);
  }

  public stop(): void {
    this.stdin.off("data", this.onDataHandler);
    for (const pending of this.pendingOutbound.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server stopped"));
    }
    this.pendingOutbound.clear();
  }

  public close(): void {
    this.stop();
  }

  public send(message: JsonRpcWireMessage): void {
    this.stdout.write(JSON.stringify(message) + "\n");
  }

  public sendNotification(method: string, params: Record<string, unknown>): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  public request(method: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<unknown> {
    const id = `req_${Date.now()}_${++this.nextRequestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOutbound.delete(id);
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingOutbound.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private async handleChunk(chunk: Buffer): Promise<void> {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      await this.processLine(line);
    }
  }

  private async processLine(line: string): Promise<void> {
    try {
      const parsed = JSON.parse(line);

      // Check if this is a response to an outbound request
      if ("id" in parsed && ("result" in parsed || "error" in parsed) && !("method" in parsed)) {
        const responseVal = jsonRpcResponseSchema.safeParse(parsed);
        if (responseVal.success) {
          const { id, result, error } = responseVal.data;
          if (id !== null && this.pendingOutbound.has(id)) {
            const pending = this.pendingOutbound.get(id)!;
            clearTimeout(pending.timer);
            this.pendingOutbound.delete(id);
            if (error) pending.reject(new Error(error.message));
            else pending.resolve(result);
            return;
          }
        }
      }

      // Handle inbound request
      const validated = jsonRpcRequestSchema.safeParse(parsed);
      if (!validated.success) {
        this.sendError(parsed.id ?? null, -32600, "Invalid Request");
        return;
      }
      const { id, method, params } = validated.data;
      try {
        const result = await this.handler(method, params ?? {});
        this.sendResult(id, result);
      } catch (err) {
        this.sendError(id, -32603, err instanceof Error ? err.message : String(err));
      }
    } catch {
      this.sendError(null, -32700, "Parse error");
    }
  }

  private sendResult(id: string | number, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: string | number | null, code: number, message: string): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
```

Create `packages/protocol/src/index.ts`:
```typescript
export * from "./jsonrpc/schema.ts";
export * from "./jsonrpc/types.ts";
export * from "./transport/interface.ts";
export * from "./transport/stdio-server.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/protocol/test/protocol.test.ts`
Expected: PASS (3 tests pass)

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/
git commit -m "feat(protocol): create @durable-zero/protocol with full-duplex StdioJsonRpcServer"
```

---

#### Task 1.2: Declare `IExecutionEnvironment` Port in Core

**Files:**
- Create: `packages/core/src/tools/execution-env.ts`
- Modify: `packages/core/src/harness-setup.ts:109-131`
- Test: `packages/core/test/execution-env-strategy.test.ts`

- [ ] **Step 1: Write failing test for pluggable ExecutionEnvFactory in Core**

Create `packages/core/test/execution-env-strategy.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionEnvs } from "../src/harness-setup.ts";
import type { IExecutionEnvironment, ExecutionEnvFactory } from "../src/tools/execution-env.ts";

describe("ExecutionEnvs Strategy Pattern in Core (AP-012, AP-072)", () => {
  it("delegates environment instantiation to injected ExecutionEnvFactory without depending on concrete adapters", () => {
    let calledWithCwd: string | undefined;
    const mockEnv: IExecutionEnvironment = {
      id: "mock-env",
      cwd: "/sandbox/dir",
      readFile: async () => "data",
      writeFile: async () => {},
      exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    };

    const factory: ExecutionEnvFactory = (target) => {
      calledWithCwd = target.cwd;
      return mockEnv;
    };

    const envs = new ExecutionEnvs("/default", factory);
    const env = envs.env({ cwd: "/sandbox/dir" });
    assert.equal(calledWithCwd, "/sandbox/dir");
    assert.equal(env.id, "mock-env");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: FAIL with "Cannot find module '../src/tools/execution-env.ts'"

- [ ] **Step 3: Declare `IExecutionEnvironment` port in `packages/core/src/tools/execution-env.ts`**

Create `packages/core/src/tools/execution-env.ts`:
```typescript
export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  sizeBytes: number;
  mtimeMs: number;
}

export interface EnvTarget {
  readonly conversationId?: string | number;
  readonly cwd?: string;
}

export interface IExecutionEnvironment {
  readonly id: string;
  readonly cwd: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exec(argv: string[], options?: ExecOptions): Promise<ExecResult>;
  statFile?(path: string): Promise<FileStat>;
  listFiles?(path: string, options?: { exclude?: string[]; maxEntries?: number }): Promise<string[]>;
  cleanup(context?: unknown): Promise<void>;
}

export type ExecutionEnvFactory = (target: EnvTarget) => IExecutionEnvironment | Promise<IExecutionEnvironment>;
```

Modify `packages/core/src/harness-setup.ts:109-131` to use `type { ExecutionEnvFactory } from "./tools/execution-env.ts"`, accepting `factory?: ExecutionEnvFactory`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/execution-env.ts packages/core/src/harness-setup.ts packages/core/test/execution-env-strategy.test.ts
git commit -m "feat(core): declare IExecutionEnvironment port in tools/ without adapter dependencies"
```

---

#### Task 1.3: Create `@durable-zero/execution` Adapter Package

**Files:**
- Create: `packages/execution/package.json`
- Create: `packages/execution/src/adapters/local-node-env.ts`
- Create: `packages/execution/src/adapters/mock-env.ts`
- Create: `packages/execution/src/index.ts`
- Test: `packages/execution/test/execution.test.ts`

- [ ] **Step 1: Write test for LocalNodeExecutionEnv and MockExecutionEnv**

Create `packages/execution/test/execution.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalNodeExecutionEnv, MockExecutionEnv } from "../src/index.ts";

describe("@durable-zero/execution Adapter Package", () => {
  it("MockExecutionEnv provides fast in-memory filesystem for tests", async () => {
    const mock = new MockExecutionEnv();
    await mock.writeFile("test.txt", "hello world");
    assert.equal(await mock.readFile("test.txt"), "hello world");
    const res = await mock.exec(["echo", "ok"]);
    assert.equal(res.exitCode, 0);
  });

  it("LocalNodeExecutionEnv executes against local node filesystem", async () => {
    const local = new LocalNodeExecutionEnv({ cwd: process.cwd() });
    assert.equal(local.cwd, process.cwd());
    assert.equal(typeof local.readFile, "function");
  });
});
```

- [ ] **Step 2: Implement `@durable-zero/execution` package**

Create `packages/execution/package.json`:
```json
{
  "name": "@durable-zero/execution",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "@durable-zero/core": "workspace:*"
  }
}
```

Implement `LocalNodeExecutionEnv` and `MockExecutionEnv` in `packages/execution/src/adapters/` implementing `IExecutionEnvironment` from `@durable-zero/core`.
Create `packages/execution/src/index.ts`.

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test packages/execution/test/execution.test.ts`
Expected: PASS (2 tests pass)

- [ ] **Step 4: Commit**

```bash
git add packages/execution/
git commit -m "feat(execution): create @durable-zero/execution adapter implementing core execution port"
```

---

---

### Cycle 2: Storage Anti-Corruption Layer (`@durable-zero/adapter-pi-durable`) & Core `ISessionStore` Port

**Goal:** Create `@durable-zero/adapter-pi-durable` implementing `ISessionStore`. Relocate SQLite persistence, PID lock eviction (`session-lock-eviction.ts`), database forks (`session-fork.ts`), and task graph subscriptions into this adapter. Introduce the pure domain port `ISessionStore` with an In-Memory mock in `@durable-zero/core`, keeping domain logic decoupled from SQLite.

#### Task 2.1: Define `ISessionStore` Port in Core with In-Memory Mock

**Files:**
- Create: `packages/core/src/session/store.ts`
- Create: `packages/core/test/mocks/memory-session-store.ts`
- Create: `packages/core/test/session-store-port.test.ts`

- [ ] **Step 1: Write failing test for ISessionStore contract using MemorySessionStore**

Create `packages/core/test/session-store-port.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ISessionStore } from "../src/session/store.ts";
import { MemorySessionStore } from "./mocks/memory-session-store.ts";

describe("ISessionStore Domain Port (AP-010, AP-012)", () => {
  it("provides in-memory session persistence without disk or native binaries", async () => {
    const store: ISessionStore = new MemorySessionStore();
    await store.acquireLock();
    assert.equal(store.isLocked, true);

    await store.saveDocument("settings", "active", { theme: "sovereign" });
    const doc = await store.readDocument("settings", "active");
    assert.deepEqual(doc, { theme: "sovereign" });

    await store.releaseLock();
    assert.equal(store.isLocked, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/session-store-port.test.ts`
Expected: FAIL with "Cannot find module '../src/session/store.ts'"

- [ ] **Step 3: Define `ISessionStore` and implement `MemorySessionStore`**

Create `packages/core/src/session/store.ts`:
```typescript
export interface TaskRecord {
  id: string | number;
  conversationId: string | number;
  status: "pending" | "running" | "completed" | "aborted" | "failed";
  outcome?: unknown;
}

export interface ISessionStore {
  readonly sessionDir: string;
  readonly isLocked: boolean;
  acquireLock(): Promise<void>;
  releaseLock(): Promise<void>;
  saveDocument(collection: string, docId: string, data: unknown): Promise<void>;
  readDocument(collection: string, docId: string): Promise<unknown | undefined>;
  forkSession(checkpointId: string | number, newSessionDir: string): Promise<void>;
  watchTasks(onUpdate: (tasks: TaskRecord[]) => void): { close(): void };
  close(): Promise<void>;
}
```

Create `packages/core/test/mocks/memory-session-store.ts`:
```typescript
import type { ISessionStore, TaskRecord } from "../../src/session/store.ts";

export class MemorySessionStore implements ISessionStore {
  public sessionDir = "/memory/session";
  public isLocked = false;
  private documents = new Map<string, Map<string, unknown>>();
  private tasks: TaskRecord[] = [];
  private taskWatchers = new Set<(tasks: TaskRecord[]) => void>();

  async acquireLock(): Promise<void> {
    if (this.isLocked) throw new Error("Lock already held");
    this.isLocked = true;
  }

  async releaseLock(): Promise<void> {
    this.isLocked = false;
  }

  async saveDocument(collection: string, docId: string, data: unknown): Promise<void> {
    if (!this.documents.has(collection)) {
      this.documents.set(collection, new Map());
    }
    this.documents.get(collection)!.set(docId, structuredClone(data));
  }

  async readDocument(collection: string, docId: string): Promise<unknown | undefined> {
    const col = this.documents.get(collection);
    if (!col) return undefined;
    const val = col.get(docId);
    return val !== undefined ? structuredClone(val) : undefined;
  }

  async forkSession(_checkpointId: string | number, _newSessionDir: string): Promise<void> {
    // In-memory fork creates isolated clone
  }

  watchTasks(onUpdate: (tasks: TaskRecord[]) => void): { close(): void } {
    this.taskWatchers.add(onUpdate);
    onUpdate([...this.tasks]);
    return {
      close: () => { this.taskWatchers.delete(onUpdate); },
    };
  }

  async close(): Promise<void> {
    this.isLocked = false;
    this.taskWatchers.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/session-store-port.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/store.ts packages/core/test/session-store-port.test.ts packages/core/test/mocks/memory-session-store.ts
git commit -m "feat(core): declare ISessionStore domain port in session/ with in-memory mock"
```

---

#### Task 2.2: Create `@durable-zero/adapter-pi-durable` Package

**Files:**
- Create: `packages/adapter-pi-durable/package.json`
- Create: `packages/adapter-pi-durable/src/store.ts`
- Relocate: `packages/core/src/session-storage.ts` -> `packages/adapter-pi-durable/src/session-storage.ts`
- Relocate: `packages/core/src/session-fork.ts` -> `packages/adapter-pi-durable/src/session-fork.ts`
- Relocate: `packages/core/src/bridge/durable-event-adapter.ts` -> `packages/adapter-pi-durable/src/event-adapter.ts`
- Create: `packages/adapter-pi-durable/src/index.ts`
- Test: `packages/adapter-pi-durable/test/sqlite-storage.test.ts`

- [ ] **Step 1: Write integration test for PiDurableSessionStore**

Create `packages/adapter-pi-durable/test/sqlite-storage.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiDurableSessionStore } from "../src/index.ts";

describe("@durable-zero/adapter-pi-durable (SQLite Storage Integration)", () => {
  it("acquires lock, persists documents in SQLite, and releases lock safely", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dz-sqlite-test-"));
    const store = new PiDurableSessionStore({ sessionDir: dir });

    try {
      await store.acquireLock();
      assert.equal(store.isLocked, true);

      await store.saveDocument("test_col", "doc1", { foo: "bar" });
      const read = await store.readDocument("test_col", "doc1");
      assert.deepEqual(read, { foo: "bar" });

      await store.releaseLock();
      assert.equal(store.isLocked, false);
    } finally {
      await store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/adapter-pi-durable/test/sqlite-storage.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts'"

- [ ] **Step 3: Implement `@durable-zero/adapter-pi-durable`**

Create `packages/adapter-pi-durable/package.json`:
```json
{
  "name": "@durable-zero/adapter-pi-durable",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "@durable-zero/core": "workspace:*",
    "@earendil-works/chord": "1.5.0",
    "@earendil-works/pi-durable": "1.5.0",
    "proper-lockfile": "^4.1.2"
  }
}
```

Implement `PiDurableSessionStore` in `packages/adapter-pi-durable/src/store.ts` wrapping `session-storage.ts`, `session-fork.ts`, and `Harness.open()`.
Relocate `session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts` to `packages/adapter-pi-durable/src/`.
Create `packages/adapter-pi-durable/src/index.ts`.

- [ ] **Step 4: Re-export `forkSessionDatabase` from `@durable-zero/core` and `packages/contracts`**

In `packages/core/src/index.ts` and `packages/contracts/src/index.ts`:
```typescript
export { forkSessionDatabase } from "@durable-zero/adapter-pi-durable";
```
This guarantees 100% backward compatibility for `bb-plugin-provider-pi-durable` (`thread-fork.ts`) and existing tests.

- [ ] **Step 5: Run integration test and full test suite**

Run: `node --test packages/adapter-pi-durable/test/sqlite-storage.test.ts`
Expected: PASS
Run: `npm test`
Expected: 177 tests PASS!

- [ ] **Step 6: Commit**

```bash
git add packages/adapter-pi-durable/ packages/core/ packages/contracts/
git commit -m "feat(adapter-pi-durable): encapsulate SQLite storage, PID safety, and database forks"
```

---

#### Task 2.3: Enforce Bind-before-Resume Invariant & Delete Redundant Task Graph Mappers

**Files:**
- Modify: `packages/adapter-pi-durable/src/store.ts` (ensure `beforeResume` hook runs strictly before `harness.resume()`)
- Delete: `packages/core/src/runtime-graph-mapper.ts`
- Delete: `packages/core/src/runtime-graph-receipts.ts`
- Delete: `packages/core/src/runtime-graph-source.ts`
- Delete: `packages/core/src/runtime-graph-state.ts`
- Delete: `packages/core/src/runtime-graph-scope.ts`
- Test: `packages/core/test/before-resume.test.ts`
- Test: `packages/adapter-pi-durable/test/task-graph-watcher.test.ts`

- [ ] **Step 1: Write test verifying native task graph watcher**

Create `packages/adapter-pi-durable/test/task-graph-watcher.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Harness, MemoryStorage, createRegistry } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";

describe("Native Pi Durable Task Graph Watcher in Adapter", () => {
  it("streams live task state updates without custom mappers", async () => {
    const harness = await Harness.open(
      new MemoryStorage(),
      { models: createModels(), registry: createRegistry() },
      BACKGROUND_CONTEXT
    );
    const graphWatch = await harness.watchTaskGraph(BACKGROUND_CONTEXT);
    assert.ok(graphWatch.value);
    assert.equal(typeof graphWatch.value.tasks, "object");
    await harness.close(BACKGROUND_CONTEXT);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test packages/adapter-pi-durable/test/task-graph-watcher.test.ts`
Expected: PASS

- [ ] **Step 3: Delete redundant custom graph mappers**

```bash
rm packages/core/src/runtime-graph-mapper.ts
rm packages/core/src/runtime-graph-receipts.ts
rm packages/core/src/runtime-graph-source.ts
rm packages/core/src/runtime-graph-state.ts
rm packages/core/src/runtime-graph-scope.ts
```

- [ ] **Step 4: Run full test suite and verify**

Run: `npm test`
Expected: PASS (all tests pass without dead graph mappers)

- [ ] **Step 5: Commit**

```bash
git add packages/core/ packages/adapter-pi-durable/
git commit -m "refactor(storage): delete custom task graph mappers in favor of native harness.watchTaskGraph"
```

---

### Cycle 3: Model & Codemode Adapters (`@durable-zero/adapter-pi-ai` & `@durable-zero/adapter-codemode`)

**Goal:** Extract model generation and QuickJS WASM execution into separate ACL packages. Core declares port interfaces (`IModelProvider`, `ICodemodeRunner`), while adapters encapsulate `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-codemode`.

#### Task 3.1: Create `@durable-zero/adapter-pi-ai`

**Files:**
- Create: `packages/core/src/models/provider.ts`
- Create: `packages/adapter-pi-ai/package.json`
- Create: `packages/adapter-pi-ai/src/model-provider.ts`
- Create: `packages/adapter-pi-ai/src/index.ts`
- Relocate: `packages/core/src/model-setup.ts` -> `packages/adapter-pi-ai/src/model-setup.ts`
- Test: `packages/adapter-pi-ai/test/model-provider.test.ts`

- [ ] **Step 1: Write test for IModelProvider and PiAiModelProvider**

Create `packages/adapter-pi-ai/test/model-provider.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PiAiModelProvider } from "../src/index.ts";

describe("@durable-zero/adapter-pi-ai (IModelProvider Adapter)", () => {
  it("normalizes model references and maps thinking levels", async () => {
    const provider = new PiAiModelProvider();
    const resolved = await provider.resolveModel({ provider: "antigravity", modelId: "antigravity/gemini-3.8-flash" });
    assert.equal(resolved.provider, "antigravity");
    assert.equal(resolved.modelId, "gemini-3.8-flash");
  });
});
```

- [ ] **Step 2: Implement `IModelProvider` port in core and `PiAiModelProvider` in adapter**

Create `packages/core/src/models/provider.ts`:
```typescript
export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface StreamDelta {
  type: "text" | "tool_call" | "thought";
  content?: string;
  toolCall?: { id: string; name: string; args: unknown };
}

export interface IModelProvider {
  resolveModel(ref?: ModelRef): Promise<ModelRef>;
  generateStream(model: ModelRef, prompt: string, onDelta: (delta: StreamDelta) => void): Promise<{ output: string }>;
}
```

Create `packages/adapter-pi-ai/package.json`:
```json
{
  "name": "@durable-zero/adapter-pi-ai",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "@durable-zero/core": "workspace:*",
    "@earendil-works/pi-agent-core": "1.5.0",
    "@earendil-works/pi-ai": "1.5.0"
  }
}
```

Implement `PiAiModelProvider` wrapping `createModels()` and streaming deltas.
Relocate `packages/core/src/model-setup.ts` into `packages/adapter-pi-ai/src/model-setup.ts`.

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test packages/adapter-pi-ai/test/model-provider.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/models/provider.ts packages/adapter-pi-ai/
git commit -m "feat(adapter-pi-ai): create LLM adapter implementing core/models/provider.ts"
```

---

#### Task 3.2: Create `@durable-zero/adapter-codemode` with Deterministic Replay

**Files:**
- Create: `packages/core/src/tools/sandbox.ts`
- Create: `packages/adapter-codemode/package.json`
- Create: `packages/adapter-codemode/src/codemode-runner.ts`
- Create: `packages/adapter-codemode/src/index.ts`
- Relocate: `packages/core/src/builtin-extensions/codemode.ts` -> `packages/adapter-codemode/src/codemode.ts`
- Test: `packages/adapter-codemode/test/codemode-replay.test.ts`

- [ ] **Step 1: Write failing test for deterministic codemode replay**

Create `packages/adapter-codemode/test/codemode-replay.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QuickJsCodemodeRunner } from "../src/index.ts";

describe("@durable-zero/adapter-codemode (Deterministic Replay)", () => {
  it("replays journaled tool calls without physically re-executing tools", async () => {
    const runner = new QuickJsCodemodeRunner();
    let executions = 0;
    const tools = [
      {
        name: "test_tool",
        execute: async () => {
          executions++;
          return "fresh-result";
        },
      },
    ];

    const result = await runner.run(`return await tools.test_tool();`, tools);
    assert.equal(result.ok, true);
    assert.equal(result.value, "fresh-result");
    assert.equal(executions, 1);
    await runner.close();
  });
});
```

- [ ] **Step 2: Implement `ICodemodeRunner` port in core and `QuickJsCodemodeRunner` in adapter**

Create `packages/core/src/tools/sandbox.ts`:
```typescript
export interface CodemodeExecutionResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface ICodemodeRunner {
  run(code: string, tools: Array<{ name: string; execute: (args: unknown) => Promise<unknown> }>): Promise<CodemodeExecutionResult>;
  close(): Promise<void>;
}
```

Create `packages/adapter-codemode/package.json`:
```json
{
  "name": "@durable-zero/adapter-codemode",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "@durable-zero/core": "workspace:*",
    "@earendil-works/pi-codemode": "1.5.0",
    "quickjs-wasi": "3.6.2"
  }
}
```

Implement `QuickJsCodemodeRunner` wrapping `sandbox.start()` with replay journaling and session documents.
Relocate `codemode.ts` into `packages/adapter-codemode/src/`.

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test packages/adapter-codemode/test/codemode-replay.test.ts`
Expected: PASS

- [ ] **Step 4: Delete redundant bike files**

```bash
rm packages/core/src/subagent-courier.ts
rm packages/core/src/subagent-watcher.ts
rm packages/core/src/watcher-compat.ts
rm packages/core/src/stdout-guard.ts
```

- [ ] **Step 5: Run full test suite and commit**

Run: `npm test`
Expected: PASS

```bash
git add packages/core/src/tools/sandbox.ts packages/adapter-codemode/
git commit -m "feat(adapter-codemode): encapsulate QuickJS WASM sandbox and delete obsolete couriers"
```

---

### Cycle 4: Pi Resource Extension (`@durable-zero/extension-pi-resource`) & Sovereign Core Purification

**Goal:** Extract `SettingsManager` and `DefaultResourceLoader` into `@durable-zero/extension-pi-resource` via native `defineExtension`. Purify `@durable-zero/core`: strip all `@earendil-works/*` dependencies from `core/package.json`, extract clean `SessionCoordinator`, and verify fast In-Memory unit tests.

#### Task 4.1: Create `@durable-zero/extension-pi-resource` Package

**Files:**
- Create: `packages/extension-pi-resource/package.json`
- Create: `packages/extension-pi-resource/src/contracts.ts`
- Create: `packages/extension-pi-resource/src/pi-resource-ext.ts`
- Create: `packages/extension-pi-resource/src/index.ts`
- Test: `packages/extension-pi-resource/test/pi-resource.test.ts`

- [ ] **Step 1: Write failing test for `@durable-zero/extension-pi-resource`**

Create `packages/extension-pi-resource/test/pi-resource.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPiResourceExtension } from "../src/index.ts";

describe("@durable-zero/extension-pi-resource (AP-073)", () => {
  it("creates a pure declarative native Pi Durable extension without self-installing", () => {
    const ext = createPiResourceExtension({
      cwd: process.cwd(),
      agentDir: "/tmp/fake-agent",
    });
    assert.equal(ext.name, "pi-resource");
    assert.ok(ext.configProvider);
    assert.equal(typeof ext.configProvider.getDefaultModel, "function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/extension-pi-resource/test/pi-resource.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts'"

- [ ] **Step 3: Implement `@durable-zero/extension-pi-resource`**

Create `packages/extension-pi-resource/package.json`:
```json
{
  "name": "@durable-zero/extension-pi-resource",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "@durable-zero/core": "workspace:*",
    "@earendil-works/pi-coding-agent": "1.5.0",
    "@earendil-works/pi-durable": "1.5.0"
  }
}
```

Implement `createPiResourceExtension` using `defineExtension` (as declared in Cycle 2 of baseline plan).
Create `packages/extension-pi-resource/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/extension-pi-resource/test/pi-resource.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension-pi-resource/
git commit -m "feat(extension): create @durable-zero/extension-pi-resource package"
```

---

#### Task 4.2: Purify `@durable-zero/core` (Zero Vendor Dependencies)

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/src/session/coordinator.ts`
- Create: `packages/core/test/pure-domain-engine.test.ts`

- [ ] **Step 1: Write pure domain engine unit test with In-Memory mocks**

Create `packages/core/test/pure-domain-engine.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session/coordinator.ts";
import { MemorySessionStore } from "./mocks/memory-session-store.ts";

describe("@durable-zero/core Sovereign Domain Engine", () => {
  it("coordinates prompt admission, cascading abort, and lock release without external infrastructure", async () => {
    const store = new MemorySessionStore();
    const coordinator = new SessionCoordinator({
      store,
      modelProvider: {
        resolveModel: async () => ({ provider: "mock", modelId: "mock-v1" }),
        generateStream: async (_m, _p, onDelta) => {
          onDelta({ type: "text", content: "Hello sovereign world" });
          return { output: "Hello sovereign world" };
        },
      },
    });

    await coordinator.start();
    const receipt = await coordinator.prompt("hi");
    assert.equal(receipt.status, "accepted");

    await coordinator.abort();
    assert.equal(coordinator.isAborted, true);
    await coordinator.close();
    assert.equal(store.isLocked, false);
  });
});
```

- [ ] **Step 2: Implement `SessionCoordinator` in Core**

Extract pure domain coordination from `session-commands.ts` into `packages/core/src/session/coordinator.ts`. It accepts `ISessionStore`, `IModelProvider`, `ICodemodeRunner`, and `IExecutionEnvironment` via constructor dependency injection (AP-012, AP-072).

- [ ] **Step 3: Clean `packages/core/package.json` to have ZERO `@earendil-works/*` dependencies**

Edit `packages/core/package.json`:
```json
{
  "name": "@durable-zero/core",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    }
  },
  "dependencies": {
    "zod": "^4.6.7"
  }
}
```

- [ ] **Step 4: Verify automated vendor isolation check**

Run: `grep -rn "@earendil-works" packages/core/src/ || true`
Expected: 0 matches!

Run: `node --test packages/core/test/pure-domain-engine.test.ts`
Expected: PASS in < 25ms!

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat(core): achieve zero vendor dependencies in core with pure domain SessionCoordinator"
```

---

### Cycle 5: True Composition Root (`@durable-zero/runner`) & Build Pipeline

**Goal:** Establish `@durable-zero/runner` as the Composition Root (AP-020, AP-073), wiring Core with all Adapters (`adapter-pi-durable`, `adapter-pi-ai`, `adapter-codemode`, `extension-pi-resource`) and the full-duplex `StdioJsonRpcServer`. Update `scripts/build.mjs` and the root test glob.

#### Task 5.1: Create `@durable-zero/runner` Composition Root

**Files:**
- Create: `packages/runner/package.json`
- Create: `packages/runner/src/cli-args.ts`
- Create: `packages/runner/src/host-tool-bridge.ts`
- Create: `packages/runner/src/composition.ts`
- Create: `packages/runner/src/main.ts`
- Test: `packages/runner/test/composition-root.test.ts`

- [ ] **Step 1: Write test verifying runner wires engine, adapters, streaming pipe, and host tool bridge**

Create `packages/runner/test/composition-root.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleDurableZero } from "../src/composition.ts";
import { parseCliArgs } from "../src/cli-args.ts";

describe("Durable-Zero True Composition Root (AP-020, AP-073)", () => {
  it("parses CLI flags correctly for multi-thread process topology", () => {
    const args = parseCliArgs([
      "--session", "/tmp/test-session",
      "--cwd", "/tmp/test-cwd",
      "--provider", "antigravity",
      "--model", "gemini-3.8-flash",
      "--thinking", "high",
    ]);
    assert.equal(args.session, "/tmp/test-session");
    assert.equal(args.cwd, "/tmp/test-cwd");
    assert.equal(args.provider, "antigravity");
    assert.equal(args.model, "gemini-3.8-flash");
    assert.equal(args.thinking, "high");
  });

  it("assembles core engine, storage, models, sandbox, streaming pipe, and transport at root boundary", async () => {
    const notifications: Array<{ method: string; params: unknown }> = [];
    const instance = await assembleDurableZero({
      cwd: process.cwd(),
      headless: true,
      onNotification: (method, params) => {
        notifications.push({ method, params });
      },
    });

    assert.ok(instance.coordinator);
    assert.ok(instance.transport);

    // Verify event streaming pipe is wired
    instance.coordinator.emitEvent({
      type: "item/agentMessage/delta",
      delta: { text: "hello stream" },
    });

    assert.ok(notifications.some((n) => n.method === "session/event"));
    await instance.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/runner/test/composition-root.test.ts`
Expected: FAIL with "Cannot find module '../src/composition.ts'"

- [ ] **Step 3: Implement `@durable-zero/runner`**

Create `packages/runner/package.json`:
```json
{
  "name": "@durable-zero/runner",
  "version": "0.8.1",
  "type": "module",
  "license": "MIT",
  "main": "./dist/runner.js",
  "types": "./src/main.ts",
  "dependencies": {
    "@durable-zero/adapter-codemode": "workspace:*",
    "@durable-zero/adapter-pi-ai": "workspace:*",
    "@durable-zero/adapter-pi-durable": "workspace:*",
    "@durable-zero/core": "workspace:*",
    "@durable-zero/execution": "workspace:*",
    "@durable-zero/extension-pi-resource": "workspace:*",
    "@durable-zero/protocol": "workspace:*"
  }
}
```

Create `packages/runner/src/cli-args.ts`:
```typescript
export interface CliArgs {
  mode?: string;
  session?: string;
  sessionDir?: string;
  continueSession?: boolean;
  noSession?: boolean;
  provider?: string;
  model?: string;
  thinking?: string;
  cwd?: string;
  systemPromptPath?: string;
  appendSystemPromptPath?: string;
  extension?: string;
  extensions?: string[];
  noGlobalExtensions?: boolean;
  skills?: string[];
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode" && i + 1 < argv.length) args.mode = argv[++i];
    else if (arg === "--session" && i + 1 < argv.length) args.session = argv[++i];
    else if (arg === "--session-dir" && i + 1 < argv.length) args.sessionDir = argv[++i];
    else if (arg === "--continue") args.continueSession = true;
    else if (arg === "--no-session") args.noSession = true;
    else if (arg === "--provider" && i + 1 < argv.length) args.provider = argv[++i];
    else if (arg === "--model" && i + 1 < argv.length) args.model = argv[++i];
    else if (arg === "--thinking" && i + 1 < argv.length) args.thinking = argv[++i];
    else if (arg === "--system-prompt" && i + 1 < argv.length) args.systemPromptPath = argv[++i];
    else if (arg === "--append-system-prompt" && i + 1 < argv.length) args.appendSystemPromptPath = argv[++i];
    else if (arg === "--cwd" && i + 1 < argv.length) args.cwd = argv[++i];
    else if (arg === "--extension" && i + 1 < argv.length) {
      const ext = argv[++i];
      args.extension = ext;
      args.extensions ??= [];
      args.extensions.push(ext);
    }
    else if (arg === "--no-global-extensions") {
      args.noGlobalExtensions = true;
    }
    else if (arg === "--skill" && i + 1 < argv.length) {
      args.skills ??= [];
      args.skills.push(argv[++i]);
    }
  }
  return args;
}
```

Create `packages/runner/src/host-tool-bridge.ts`:
```typescript
import { setHostToolForwarder, setHostInteractionRequester } from "@durable-zero/core";
import type { ITransportStrategy } from "@durable-zero/protocol";

export function setupHostToolBridge(transport: ITransportStrategy): void {
  setHostToolForwarder(async (toolName: string, args: unknown) => {
    try {
      const response = await transport.request("host/toolCall", {
        toolName,
        arguments: args ?? {},
      });
      const parsed = response as { content?: Array<{ type: "text"; text: string }>; isError?: boolean } | undefined;
      return {
        content: parsed?.content ?? [{ type: "text", text: JSON.stringify(response ?? "") }],
        isError: Boolean(parsed?.isError),
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Host tool ${toolName} failed: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  setHostInteractionRequester(async (kind: string, payload: { title?: string; message?: string; data?: unknown }) => {
    try {
      return await transport.request("host/interaction", {
        interactionKind: kind,
        ...payload,
      });
    } catch {
      return null;
    }
  });
}
```

Create `packages/runner/src/composition.ts`:
```typescript
import { SessionCoordinator } from "@durable-zero/core";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import { PiDurableSessionStore } from "@durable-zero/adapter-pi-durable";
import { PiAiModelProvider } from "@durable-zero/adapter-pi-ai";
import { QuickJsCodemodeRunner } from "@durable-zero/adapter-codemode";
import { createPiResourceExtension } from "@durable-zero/extension-pi-resource";
import { setupHostToolBridge } from "./host-tool-bridge.ts";

export interface AssembleOptions {
  cwd?: string;
  sessionDir?: string;
  session?: string;
  headless?: boolean;
  provider?: string;
  model?: string;
  thinking?: string;
  extensions?: string[];
  skills?: string[];
  noGlobalExtensions?: boolean;
  onNotification?: (method: string, params: unknown) => void;
}

export async function assembleDurableZero(options: AssembleOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const sessionDir = options.sessionDir ?? options.session ?? `${cwd}/.durable-session`;

  const env = new LocalNodeExecutionEnv({ cwd });
  const store = new PiDurableSessionStore({ sessionDir });
  const modelProvider = new PiAiModelProvider();
  const codemodeRunner = new QuickJsCodemodeRunner();
  const piResource = options.headless ? undefined : createPiResourceExtension({ cwd });

  const coordinator = new SessionCoordinator({
    store,
    modelProvider,
    codemodeRunner,
    executionEnv: env,
    piResourceExtension: piResource,
  });

  const transport = new StdioJsonRpcServer({
    handler: async (method, params) => {
      if (method === "session/prompt") {
        return coordinator.prompt(String(params.content ?? ""), {
          deliverAs: params.deliverAs as "steer" | "followUp" | undefined,
        });
      }
      if (method === "session/cancel") {
        await coordinator.abort();
        return { status: "aborted" };
      }
      if (method === "session/get_state") {
        return coordinator.getState();
      }
      if (method === "session/set_subagent_policy") {
        return coordinator.setSubagentPolicy(params);
      }
      throw new Error(`Unknown method: ${method}`);
    },
  });

  // 1. Pipe coordinator events to JSON-RPC stream notifications
  coordinator.events((event) => {
    transport.sendNotification("session/event", event as unknown as Record<string, unknown>);
    options.onNotification?.("session/event", event);
  });

  // 2. Wire host tools bridge for full-duplex client tool delegation (e.g. AskUserQuestion)
  setupHostToolBridge(transport);

  return {
    coordinator,
    transport,
    close: async () => {
      transport.stop();
      await coordinator.close();
      await codemodeRunner.close();
      await store.close();
      await env.cleanup();
    },
  };
}
```

Create `packages/runner/src/main.ts`:
```typescript
import { parseCliArgs } from "./cli-args.ts";
import { assembleDurableZero } from "./composition.ts";

async function main() {
  const argv = process.argv.slice(2);
  const args = parseCliArgs(argv);

  const runner = await assembleDurableZero({
    cwd: args.cwd,
    sessionDir: args.sessionDir ?? args.session,
    provider: args.provider,
    model: args.model,
    thinking: args.thinking,
    extensions: args.extensions,
    skills: args.skills,
    noGlobalExtensions: args.noGlobalExtensions,
  });

  runner.transport.start();
  runner.transport.sendNotification("session/ready", {
    ready: true,
    pid: process.pid,
  });

  let isExiting = false;
  const handleExit = async (signalOrReason: string, err?: unknown) => {
    if (isExiting) return;
    isExiting = true;
    if (err) {
      console.error(`[Runner] Fatal crash (${signalOrReason}):`, err);
    }
    try {
      await runner.close();
    } catch (closeErr) {
      console.warn(`[Runner] Cleanup error on ${signalOrReason}:`, closeErr);
    }
    process.exit(err ? 1 : 0);
  };

  process.on("SIGINT", () => { void handleExit("SIGINT"); });
  process.on("SIGTERM", () => { void handleExit("SIGTERM"); });
  process.on("uncaughtException", (err) => { void handleExit("uncaughtException", err); });
  process.on("unhandledRejection", (err) => { void handleExit("unhandledRejection", err); });
}

void main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/runner/test/composition-root.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/runner/
git commit -m "feat(runner): establish dedicated Composition Root assembling core with adapters, streaming pipe, and host tool bridge"
```

---

#### Task 5.2: Update Build Pipeline & WASM Distribution

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update `scripts/build.mjs` to bundle all packages and copy `quickjs.wasm`**

Edit `scripts/build.mjs`:
```javascript
const packages = [
  "protocol",
  "execution",
  "core",
  "adapter-pi-durable",
  "adapter-pi-ai",
  "adapter-codemode",
  "extension-pi-resource",
  "runner",
];

for (const pkg of packages) {
  await build({
    entryPoints: [resolve(root, `packages/${pkg}/src/index.ts`)],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: resolve(root, `packages/${pkg}/dist/index.js`),
    external: externals,
    sourcemap: true,
  });
  console.log(`- Built packages/${pkg}/dist/index.js`);
}

// Build standalone runner binary
await build({
  entryPoints: [resolve(root, "packages/runner/src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(root, "packages/runner/dist/runner.js"),
  external: externals,
  banner: {
    js: `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);`,
  },
  sourcemap: true,
});
console.log("- Built packages/runner/dist/runner.js");

// Copy WASM to runner distribution directory
const wasmSource = resolve(root, "node_modules/.pnpm/quickjs-wasi@3.6.2/node_modules/quickjs-wasi/quickjs.wasm");
const wasmDest = resolve(root, "packages/runner/dist/quickjs.wasm");
await fs.copyFile(wasmSource, wasmDest);
console.log("- Copied quickjs.wasm to packages/runner/dist/quickjs.wasm");
```

- [ ] **Step 2: Update root `package.json` test runner glob and subpath exports**

In root `package.json`:
- `"test": "node --test packages/*/test/*.test.ts"`
- `"./runner": "./packages/runner/dist/runner.js"`

- [ ] **Step 3: Run full build and test suite**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass!

- [ ] **Step 4: Commit**

```bash
git add scripts/build.mjs package.json
git commit -m "chore(build): update build pipeline for all packages and copy WASM to runner dist"
```

---

## Verification & Dual-Circuit Review Protocol (S9 Gate)

At the completion of each cycle, the orchestrator triggers two parallel review subagents strictly using Pi Durable on Gemini 3.8 Flash High:
`bb thread spawn --provider pi-durable --model antigravity/gemini-3.8-flash --reasoning-level high`

1. **Circuit 1: Semantic Architecture Review (`arch-rules-implementation-review`)**
   - Evaluates modular integrity, loose coupling, absence of leaky abstractions.
   - Verifies **Zero Vendor Invasions in Core**: `grep -rn "@earendil-works" packages/core/src/ || true` MUST return 0 matches.
   - Verifies **Port Inversion**: All adapters implement core ports (`ISessionStore`, `IModelProvider`, `ICodemodeRunner`), never the reverse.
   - Verifies AP-010, AP-011, AP-012, AP-013, AP-020, AP-072, AP-073.
   - Zero tolerance for P0, P1, P2 findings.
2. **Circuit 2: Black-Box Synthetic Product Review (`arch-improvement-product-review`)**
   - Traverses the Three Golden Journeys (Happy Path, Empty State, Error Recovery) as an external operator without inspecting code.
   - Confirms exit codes, readable JSON-RPC error responses, zero hanging processes.
3. **Gate Rule:** Unanimous **PASS** required before advancing to the next cycle.
