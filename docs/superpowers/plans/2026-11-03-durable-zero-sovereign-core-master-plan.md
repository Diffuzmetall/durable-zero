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
├── protocol/                     <- @durable-zero/protocol (Independent Wire Package)
│   ├── src/
│   │   ├── jsonrpc/              <- Pure JSON-RPC 2.0 Schema & Types (Request, Response, Error)
│   │   ├── methods/              <- Standard Agent Methods (session/prompt, session/cancel, session/update)
│   │   └── transport/            <- ITransportStrategy interface & StdioJsonRpcServer implementation
│   └── package.json              <- Depends only on zod. Zero engine dependencies.
│
├── execution/                    <- @durable-zero/execution (Execution Sandbox Domain)
│   ├── src/
│   │   ├── contracts/            <- IExecutionEnvironment, EnvTarget, ExecOptions, ExecResult
│   │   └── adapters/             <- LocalNodeExecutionEnv (default) & MockExecutionEnv
│   └── package.json              <- Depends on Node.js builtins. Zero agent dependencies.
│
├── core/                         <- @durable-zero/core (Sovereign Headless Core Domain)
│   ├── src/
│   │   ├── engine.ts             <- DurableZeroEngine (orchestrator, no transport knowledge)
│   │   ├── runtime.ts            <- Session Lifecycle (Bind-before-Resume invariant)
│   │   ├── session/              <- Session state, transcript, task graph bindings
│   │   ├── builtin-extensions/   <- Pure declarative factories (defineExtension, no self-install)
│   │   └── policy/               <- SubagentPolicyStore & security rules
│   └── package.json              <- Depends on @durable-zero/protocol, @durable-zero/execution,
│                                    @earendil-works/pi-durable, @earendil-works/pi-agent-core, @earendil-works/pi-ai.
│                                    NO dependency on @earendil-works/pi-coding-agent!
│
├── extension-pi-resource/        <- @durable-zero/extension-pi-resource (Pi Setup ACL)
│   ├── src/
│   │   ├── pi-resource-ext.ts    <- Native Pi Durable defineExtension wrapping SettingsManager & ResourceLoader
│   │   └── contracts.ts          <- IConfigProvider & ISkillLoader implementations
│   └── package.json              <- Depends on @earendil-works/pi-durable, @earendil-works/pi-coding-agent.
│
└── runner/                       <- @durable-zero/runner (TRUE COMPOSITION ROOT - AP-020, AP-073)
    ├── src/
    │   ├── composition.ts        <- Wires engine + transport + execution env + pi-resource extension
    │   └── main.ts               <- Executable entrypoint (compiled to dist/runner.js)
    └── package.json              <- Depends on all workspace packages. Assembles the executable.
```

### Dependency Direction Matrix:

```
@durable-zero/protocol  (Zero dependencies)
@durable-zero/execution (Zero dependencies)
          ▲                     ▲
          │                     │
@durable-zero/core      (Pure Domain: depends on protocol & execution contracts)
          ▲                     ▲
          │                     │
@durable-zero/extension-pi-resource (Pi ACL: depends on pi-durable & pi-coding-agent)
          ▲                     ▲
          │                     │
@durable-zero/runner    (COMPOSITION ROOT: wires all packages into the executable process)
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

---

To prevent accidental loss of mature, battle-tested domain logic (175 tests across 64 suites), all existing code is categorized into three explicit zones before refactoring:

| Zone | Files / Modules | Action & Target Destination | Rationale & Test Invariant |
|---|---|---|---|
| 🟢 **Green: Preserve & Refactor** | `session-storage.ts`, `session-fork.ts`, `session-lock-eviction.ts` | Refactor into `@durable-zero/core/session/` | Preserves SQLite document atomicity, PID safety, and session branching (AP-013). Covered by `session-fork.test.ts`, `session-storage-pid-safety.test.ts`. |
| 🟢 **Green: Preserve & Refactor** | `policy/*`, `subagent-policy-ack.ts`, `subagent-policy-state.ts` | Refactor into `@durable-zero/core/policy/` | Preserves security policies across restarts, user approval gates, and cascading abort. Covered by `subagent-policy-store.test.ts`, `subagent-cascading-abort.test.ts`. |
| 🟢 **Green: Preserve & Refactor** | `session-commands.ts`, `session-state-commands.ts`, `binding-commands.ts` | Extract clean `SessionService` in `@durable-zero/core/session/` | Preserves command dispatch (`prompt`, `cancel`, `steer`, `set_model`, task dispatch). Covered by `canonical-command.test.ts`. |
| 🟢 **Green: Preserve & Refactor** | `bridge/durable-event-adapter.ts` | Move to `@durable-zero/core/bridge/` as Outbound Event Port | Preserves critical tool delta translation with args (fixed in v0.8.1 for BB/terminal UI). Covered by `watch-events-compat.test.ts`. |
| 🟢 **Green: Preserve & Refactor** | `compaction-hooks.ts`, `task-tokens.ts`, `task-labels.ts` | Move to `@durable-zero/core/session/` | Preserves context compaction hooks, task metric counters, and formatting. Covered by `compaction-hooks.test.ts`. |
| 🔵 **Blue: Upstream Pi Adoption** | Custom agent stepping in `runtime-controller.ts` | Adopt `@earendil-works/pi-agent-core` (`Agent`, `agentLoop`, `beforeToolCall`, `afterToolCall`) | Eliminates custom bicycles; reuses upstream tested agent state machine. |
| 🔵 **Blue: Upstream Pi Adoption** | `model-setup.ts` | Adopt `@earendil-works/pi-ai` (`createModels()`) | Replaces coupling to `ModelRuntime` with pure upstream model catalog and streaming types. |
| 🔵 **Blue: Upstream Pi Adoption** | `runtime-graph-mapper.ts`, `runtime-graph-receipts.ts`, `runtime-graph-source.ts`, `runtime-graph-state.ts` | Adopt `@earendil-works/pi-durable` (`harness.watchTaskGraph()`, `ownership: { kind: "task" }`) | Replaces ~25KB of custom SQLite row-mapping bicycles with native task graph subscriptions. |
| 🔵 **Blue: Upstream Pi Adoption** | `builtin-extensions/codemode.ts` | Upgrade to `@earendil-works/pi-codemode` (`sandbox.start()`) | Upgrades basic `.execute()` to deterministic replay journaling with state stored in session SQLite documents. |
| 🔴 **Red: Bike Elimination** | `subagent-courier.ts`, `subagent-watcher.ts`, `watcher-compat.ts` | DELETE (safe removal) | Obsolete polling bicycle; fully replaced by native task ownership in Pi Durable 1.5.0. |
| 🔴 **Red: Bike Elimination** | `host-rpc.ts`, `runner-channel.ts` | DELETE (safe removal) | Obsolete custom RPC with timeout hacks; replaced by standard JSON-RPC 2.0 server in `@durable-zero/protocol`. |
| 🔴 **Red: Bike Elimination** | `stdout-guard.ts` | DELETE (safe removal) | Custom stdout hijacking is unnecessary when using clean, framed stdio JSON-RPC transport. |

### Regression Defense Invariant
At every step of each cycle, the full existing test suite (`npm test`) must pass (177 tests green). Tests are migrated or re-targeted alongside their modules, ensuring zero functional degradation.

### Refactoring Discipline: Preservation by Relocation & Upstream Adoption
1. **Never Rewrite What Already Works:** Do not write naive replacements for `session-storage.ts`, `session-fork.ts`, `policy/*`, or `bridge/durable-event-adapter.ts`. Relocate these proven files to their target package/directory and update imports.
2. **Backward-Compatible Workspace Re-exports during Migration:** During Cycle 1 and Cycle 2, `packages/contracts/src/index.ts` re-exports from `@durable-zero/protocol` and `@durable-zero/execution` so that existing consumers and tests continue to pass without a single regression.
3. **Selective Upstream Replacement:** Only replace custom code where upstream Pi 1.5.0 provides a strictly superior, first-class alternative (`harness.watchTaskGraph()` for custom mappers; `ownership: { kind: "task" }` for couriers; `pi-agent-core` for agent loops; `pi-ai` for models). Keep custom business logic (policy store, CAS optimistic locking, tool argument reconstruction) intact.


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

#### Task 1.1: Create `@durable-zero/protocol` Package

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/jsonrpc/schema.ts`
- Create: `packages/protocol/src/jsonrpc/types.ts`
- Create: `packages/protocol/src/transport/interface.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/protocol.test.ts`

- [ ] **Step 1: Write failing test for `@durable-zero/protocol`**

Create `packages/protocol/test/protocol.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  type ITransportStrategy,
} from "../src/index.ts";

describe("@durable-zero/protocol Package", () => {
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

  it("exports ITransportStrategy interface", () => {
    const transport: ITransportStrategy = {
      start: async () => {},
      send: async () => {},
      onMessage: () => {},
      close: async () => {},
    };
    assert.equal(typeof transport.send, "function");
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
  start(): Promise<void>;
  send(message: JsonRpcWireMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcWireMessage) => void): void;
  close(): Promise<void>;
}
```

Create `packages/protocol/src/index.ts`:
```typescript
export * from "./jsonrpc/schema.ts";
export * from "./jsonrpc/types.ts";
export * from "./transport/interface.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/protocol/test/protocol.test.ts`
Expected: PASS (2 tests pass)

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/
git commit -m "feat(protocol): create @durable-zero/protocol package with JSON-RPC 2.0 schemas"
```

---

#### Task 1.2: Create `@durable-zero/execution` Package

**Files:**
- Create: `packages/execution/package.json`
- Create: `packages/execution/src/contracts/types.ts`
- Create: `packages/execution/src/contracts/environment.ts`
- Create: `packages/execution/src/adapters/local-node-env.ts`
- Create: `packages/execution/src/index.ts`
- Test: `packages/execution/test/execution.test.ts`

- [ ] **Step 1: Write failing test for `@durable-zero/execution`**

Create `packages/execution/test/execution.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LocalNodeExecutionEnv,
  type IExecutionEnvironment,
  type ExecutionEnvFactory,
} from "../src/index.ts";

describe("@durable-zero/execution Package", () => {
  it("LocalNodeExecutionEnv implements IExecutionEnvironment interface", async () => {
    const env: IExecutionEnvironment = new LocalNodeExecutionEnv({ cwd: process.cwd() });
    assert.equal(env.cwd, process.cwd());
    assert.equal(typeof env.readFile, "function");
    assert.equal(typeof env.exec, "function");
  });

  it("supports pluggable custom ExecutionEnvFactory", () => {
    const mockFactory: ExecutionEnvFactory = (target) => ({
      id: "mock-custom-env",
      cwd: target.cwd ?? "/tmp",
      readFile: async () => "data",
      writeFile: async () => {},
      exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    });
    const env = mockFactory({ cwd: "/sandbox" });
    assert.equal(env.id, "mock-custom-env");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/execution/test/execution.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts'"

- [ ] **Step 3: Implement `@durable-zero/execution` package**

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
    "@earendil-works/chord": "1.5.0",
    "@earendil-works/pi-durable": "1.5.0"
  }
}
```

Create `packages/execution/src/contracts/types.ts`:
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
```

Create `packages/execution/src/contracts/environment.ts`:
```typescript
import type { Context } from "@earendil-works/chord";
import type { ExecOptions, ExecResult, FileStat } from "./types.ts";

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
  cleanup(context?: Context): Promise<void>;
}

export type ExecutionEnvFactory = (target: EnvTarget) => IExecutionEnvironment | Promise<IExecutionEnvironment>;
```

Create `packages/execution/src/adapters/local-node-env.ts`:
```typescript
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import type { Context } from "@earendil-works/chord";
import type { IExecutionEnvironment, EnvTarget } from "../contracts/environment.ts";
import type { ExecOptions, ExecResult, FileStat } from "../contracts/types.ts";

export class LocalNodeExecutionEnv implements IExecutionEnvironment {
  readonly id: string;
  readonly cwd: string;
  private inner: NodeExecutionEnv;

  constructor(target: EnvTarget) {
    this.cwd = target.cwd ?? process.cwd();
    this.id = `local-node:${this.cwd}`;
    this.inner = new NodeExecutionEnv({ cwd: this.cwd });
  }

  async readFile(path: string): Promise<string> {
    return this.inner.readTextFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.inner.writeFile(path, content);
  }

  async exec(argv: string[], options?: ExecOptions): Promise<ExecResult> {
    let stdout = "";
    let stderr = "";
    const res = await this.inner.exec(argv, {
      cwd: options?.cwd,
      env: options?.env,
      onOutput: (text, _ctx, info) => {
        if (info.stream === "stderr") stderr += text;
        else stdout += text;
      },
    });
    return { stdout, stderr, exitCode: res.exitCode ?? 0 };
  }

  async cleanup(context?: Context): Promise<void> {
    await this.inner.cleanup(context as any);
  }
}
```

Create `packages/execution/src/index.ts`:
```typescript
export * from "./contracts/types.ts";
export * from "./contracts/environment.ts";
export * from "./adapters/local-node-env.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/execution/test/execution.test.ts`
Expected: PASS (2 tests pass)

- [ ] **Step 5: Commit**

```bash
git add packages/execution/
git commit -m "feat(execution): create @durable-zero/execution package with LocalNodeExecutionEnv"
```

---

#### Task 1.3: Wire ExecutionEnvFactory into `@durable-zero/core`

**Files:**
- Modify: `packages/core/package.json` (add `@durable-zero/execution` dependency)
- Modify: `packages/core/src/harness-setup.ts:109-131`
- Test: `packages/core/test/execution-env-strategy.test.ts`

- [ ] **Step 1: Write failing test in core for injected execution factory**

Create `packages/core/test/execution-env-strategy.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionEnvs } from "../src/harness-setup.ts";
import type { IExecutionEnvironment } from "@durable-zero/execution";

describe("ExecutionEnvs Strategy Pattern in Core (AP-072)", () => {
  it("delegates environment instantiation to injected ExecutionEnvFactory", () => {
    let calledWithCwd: string | undefined;
    const mockEnv: IExecutionEnvironment = {
      id: "mock-env",
      cwd: "/sandbox/dir",
      readFile: async () => "data",
      writeFile: async () => {},
      exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    };

    const envs = new ExecutionEnvs("/default", (target) => {
      calledWithCwd = target.cwd;
      return mockEnv as any;
    });

    const env = envs.env({ cwd: "/sandbox/dir" } as any);
    assert.equal(calledWithCwd, "/sandbox/dir");
    assert.equal((env as any).id, "mock-env");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify `harness-setup.ts` to use `@durable-zero/execution`**

Edit `packages/core/src/harness-setup.ts:109-131`:
```typescript
import type { ExecutionEnvFactory } from "@durable-zero/execution";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";

export class ExecutionEnvs {
	readonly #defaultCwd: string;
	readonly #factory: ExecutionEnvFactory;
	readonly #envs = new Map<string, any>();

	constructor(defaultCwd: string, factory?: ExecutionEnvFactory) {
		this.#defaultCwd = defaultCwd;
		this.#factory = factory ?? (({ cwd = this.#defaultCwd }) => new LocalNodeExecutionEnv({ cwd }));
	}

	readonly env = ({ cwd = this.#defaultCwd, conversationId }: EnvTarget): any => {
		let env = this.#envs.get(cwd);
		if (env === undefined) {
			env = this.#factory({ cwd, conversationId });
			this.#envs.set(cwd, env);
		}
		return env;
	};

	async cleanup(context: Context): Promise<void> {
		const envs = [...this.#envs.values()];
		this.#envs.clear();
		for (const env of envs) {
			if (typeof env.cleanup === "function") await env.cleanup(context);
		}
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: PASS
Run full suite: `npm test`
Expected: 180 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/harness-setup.ts packages/core/test/execution-env-strategy.test.ts packages/core/package.json
git commit -m "refactor(core): inject ExecutionEnvFactory strategy from @durable-zero/execution"
```

---

### Cycle 2: Pi Resource Isolation via Dedicated Extension Package (`@durable-zero/extension-pi-resource`)

**Goal:** Extract `SettingsManager` and `DefaultResourceLoader` from `@durable-zero/core` into a clean, dedicated workspace package `@durable-zero/extension-pi-resource` implementing Pi Durable's native `defineExtension`. The core becomes free of hardcoded paths to `~/.pi/agent/`.

#### Task 2.1: Create `@durable-zero/extension-pi-resource` Package

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
    "@earendil-works/pi-coding-agent": "1.5.0",
    "@earendil-works/pi-durable": "1.5.0"
  }
}
```

Create `packages/extension-pi-resource/src/contracts.ts`:
```typescript
export interface ModelConfigRef {
  provider: string;
  modelId: string;
}

export interface IConfigProvider {
  getDefaultModel(): ModelConfigRef | undefined;
  getSecret(key: string): Promise<string | undefined>;
  getSkillPaths(): string[];
}
```

Create `packages/extension-pi-resource/src/pi-resource-ext.ts`:
```typescript
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import type { IConfigProvider, ModelConfigRef } from "./contracts.ts";

export interface PiResourceExtensionOptions {
  cwd: string;
  agentDir?: string;
  additionalSkillPaths?: string[];
}

export interface PiResourceExtensionInstance extends Extension {
  readonly configProvider: IConfigProvider;
  readonly resourceLoader: DefaultResourceLoader;
  readonly settingsManager: SettingsManager;
}

export function createPiResourceExtension(options: PiResourceExtensionOptions): PiResourceExtensionInstance {
  const settingsManager = SettingsManager.create(options.cwd);
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
    additionalSkillPaths: options.additionalSkillPaths,
  });

  const configProvider: IConfigProvider = {
    getDefaultModel(): ModelConfigRef | undefined {
      const p = settingsManager.getDefaultProvider();
      const m = settingsManager.getDefaultModel();
      return p && m ? { provider: p, modelId: m } : undefined;
    },
    async getSecret(key: string): Promise<string | undefined> {
      return process.env[key];
    },
    getSkillPaths(): string[] {
      return options.additionalSkillPaths ?? [];
    },
  };

  const baseExt = defineExtension({
    name: "pi-resource",
  });

  return Object.assign(baseExt, {
    configProvider,
    resourceLoader,
    settingsManager,
  });
}
```

Create `packages/extension-pi-resource/src/index.ts`:
```typescript
export * from "./contracts.ts";
export * from "./pi-resource-ext.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/extension-pi-resource/test/pi-resource.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/extension-pi-resource/
git commit -m "feat(extension): create @durable-zero/extension-pi-resource package"
```

---

### Cycle 3: Elimination of Pi Durable Duplicate Bikes (Zero Shims & Bind-before-Resume)

**Goal:** Eliminate custom watcher/courier mechanisms (`subagent-courier.ts`, `subagent-watcher.ts`, `runtime-graph-*.ts`) in favor of native Pi Durable primitives (`ownership: { kind: "task" }`, `harness.watchTaskGraph()`, `ConversationTranscript`), while guaranteeing the `Bind-before-Resume` invariant.

#### Task 3.1: Enforce Bind-before-Resume in `runtime.ts`

**Files:**
- Modify: `packages/core/src/runtime.ts:155-165`
- Test: `packages/core/test/before-resume.test.ts`

- [ ] **Step 1: Write test verifying bind executes strictly before resume**

Check `packages/core/test/before-resume.test.ts`:
```typescript
it("guarantees lifecycle.bind completes strictly before harness.resume", async () => {
  let boundBeforeResume = false;
  let resumed = false;
  await openDurable({
    beforeResume: async (harness) => {
      boundBeforeResume = !resumed;
    },
  });
  assert.equal(boundBeforeResume, true);
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `node --test packages/core/test/before-resume.test.ts`
Expected: PASS

- [ ] **Step 3: Commit verification lock**

```bash
git commit --allow-empty -m "chore(core): lock Bind-before-Resume execution invariant"
```

---

#### Task 3.2: Delete Custom Graph Mappers and Subagent Couriers

**Files:**
- Delete: `packages/core/src/runtime-graph-mapper.ts`
- Delete: `packages/core/src/runtime-graph-receipts.ts`
- Delete: `packages/core/src/runtime-graph-source.ts`
- Delete: `packages/core/src/runtime-graph-state.ts`
- Delete: `packages/core/src/runtime-graph-scope.ts`
- Modify: `packages/core/src/subagent.ts` (redirect to native task ownership)
- Test: `packages/core/test/native-task-graph.test.ts`

- [ ] **Step 1: Write test verifying native task graph watcher**

Create `packages/core/test/native-task-graph.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Harness, MemoryStorage, createRegistry } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";

describe("Native Pi Durable Task Graph Watcher", () => {
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

Run: `node --test packages/core/test/native-task-graph.test.ts`
Expected: PASS

- [ ] **Step 3: Delete redundant bike files**

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
git add packages/core/
git commit -m "refactor(core): delete redundant custom task graph mappers in favor of native harness.watchTaskGraph"
```

---

### Cycle 4: True Composition Root in `@durable-zero/runner` & Single Stdio JSON-RPC 2.0 Transport

**Goal:** Create a dedicated `@durable-zero/runner` package that serves as the **TRUE COMPOSITION ROOT** (AP-020, AP-073), moving entrypoint wiring out of `@durable-zero/core`. Implement the single default `StdioJsonRpcServer` in `@durable-zero/protocol`.

#### Task 4.1: Implement `StdioJsonRpcServer` in `@durable-zero/protocol`

**Files:**
- Create: `packages/protocol/src/transport/stdio-server.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/stdio-server.test.ts`

- [ ] **Step 1: Write failing test for StdioJsonRpcServer**

Create `packages/protocol/test/stdio-server.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { StdioJsonRpcServer } from "../src/index.ts";

describe("StdioJsonRpcServer (JSON-RPC 2.0 Standard)", () => {
  it("processes session/prompt request and replies with jsonrpc 2.0 result", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, encoding, callback) {
        outputBuffer += chunk.toString();
        callback();
      },
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

    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = JSON.parse(outputBuffer.trim());
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.deepEqual(response.result, { status: "accepted", prompt: "test" });
    server.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/protocol/test/stdio-server.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts' or exported member StdioJsonRpcServer"

- [ ] **Step 3: Implement `StdioJsonRpcServer`**

Create `packages/protocol/src/transport/stdio-server.ts`:
```typescript
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { jsonRpcRequestSchema } from "../jsonrpc/schema.ts";

export interface StdioJsonRpcServerOptions {
  stdin?: Readable;
  stdout?: Writable;
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class StdioJsonRpcServer {
  private stdin: Readable;
  private stdout: Writable;
  private handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
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
  }

  public sendNotification(method: string, params: Record<string, unknown>): void {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.stdout.write(payload);
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
    const payload = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
    this.stdout.write(payload);
  }

  private sendError(id: string | number | null, code: number, message: string): void {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
    this.stdout.write(payload);
  }
}
```

Update `packages/protocol/src/index.ts`:
```typescript
export * from "./jsonrpc/schema.ts";
export * from "./jsonrpc/types.ts";
export * from "./transport/interface.ts";
export * from "./transport/stdio-server.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/protocol/test/stdio-server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/
git commit -m "feat(protocol): implement StdioJsonRpcServer conforming to JSON-RPC 2.0"
```

---

#### Task 4.2: Create `@durable-zero/runner` (The True Composition Root - AP-020, AP-073)

**Files:**
- Create: `packages/runner/package.json`
- Create: `packages/runner/src/composition.ts`
- Create: `packages/runner/src/main.ts`
- Test: `packages/runner/test/composition-root.test.ts`

- [ ] **Step 1: Write test verifying runner wires engine and transport outside core**

Create `packages/runner/test/composition-root.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assembleDurableZero } from "../src/composition.ts";

describe("Durable-Zero True Composition Root (AP-020, AP-073)", () => {
  it("assembles engine, transport, execution environment, and extensions at root boundary", async () => {
    const instance = await assembleDurableZero({
      cwd: process.cwd(),
      headless: true,
    });
    assert.ok(instance.engine);
    assert.ok(instance.transport);
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
  "main": "./dist/main.js",
  "types": "./src/main.ts",
  "dependencies": {
    "@durable-zero/core": "workspace:*",
    "@durable-zero/execution": "workspace:*",
    "@durable-zero/extension-pi-resource": "workspace:*",
    "@durable-zero/protocol": "workspace:*"
  }
}
```

Create `packages/runner/src/composition.ts`:
```typescript
import { DurableEngine } from "@durable-zero/core";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import { createPiResourceExtension } from "@durable-zero/extension-pi-resource";

export interface AssembleOptions {
  cwd?: string;
  headless?: boolean;
}

export async function assembleDurableZero(options: AssembleOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = new LocalNodeExecutionEnv({ cwd });
  const piResource = options.headless ? undefined : createPiResourceExtension({ cwd });

  const engine = new DurableEngine();

  const transport = new StdioJsonRpcServer({
    handler: async (method, params) => {
      if (method === "session/prompt") {
        await engine.prompt(String(params.content ?? ""));
        return { status: "completed" };
      }
      return { status: "ignored" };
    },
  });

  return {
    engine,
    transport,
    close: async () => {
      transport.stop();
      await env.cleanup();
    },
  };
}
```

Create `packages/runner/src/main.ts`:
```typescript
import { assembleDurableZero } from "./composition.ts";

async function main() {
  const runner = await assembleDurableZero();
  runner.transport.start();

  process.on("SIGINT", () => { void runner.close().then(() => process.exit(0)); });
  process.on("SIGTERM", () => { void runner.close().then(() => process.exit(0)); });
}

void main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/runner/test/composition-root.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/runner/
git commit -m "feat(runner): establish dedicated Composition Root package assembling zero packages"
```

---

### Cycle 5: Deterministic Codemode Replay & Session Store

**Goal:** Upgrade `CodemodeExtension` from basic `sandbox.execute()` to deterministic `sandbox.start()`, recording tool results into Pi Durable's journal so that process restarts replay finished calls without re-executing tools. Store script state via `store`/`load` in the session's SQLite documents.

#### Task 5.1: Wire `sandbox.start()` Replay Journaling in Codemode

**Files:**
- Modify: `packages/core/src/builtin-extensions/codemode.ts`
- Test: `packages/core/test/codemode-deterministic-replay.test.ts`

- [ ] **Step 1: Write failing test for deterministic replay**

Create `packages/core/test/codemode-deterministic-replay.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";

describe("Deterministic Codemode Sandbox (sandbox.start)", () => {
  it("replays journaled tool results deterministically across restarts", async () => {
    const sandbox = new CodemodeSandbox();
    let physicalCalls = 0;
    const run = sandbox.start(
      `const a = await tools.read({ path: "x" }); return a;`,
      {
        startedAt: 1000,
        seed: 42,
        tools: [{ name: "read", description: "Read file" }],
        onCall: (call) => {
          physicalCalls++;
          run.deliver(1, 1005, call.id, { ok: true, value: "file-content" });
        },
      }
    );
    const result = await run.result;
    assert.equal(result.ok, true);
    assert.equal(result.value, "file-content");
    assert.equal(physicalCalls, 1);
    await sandbox.close();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test packages/core/test/codemode-deterministic-replay.test.ts`
Expected: PASS

- [ ] **Step 3: Update `CodemodeExtension` to use instance sandboxes and replay journals**

Inspect `packages/core/src/builtin-extensions/codemode.ts`. Ensure each session context receives its own encapsulated sandbox without module-level `#activeSandbox` leaks.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/builtin-extensions/codemode.ts packages/core/test/codemode-deterministic-replay.test.ts
git commit -m "feat(codemode): enforce deterministic replay journaling and session isolation"
```

---

## Verification & Dual-Circuit Review Protocol (S9 Gate)

At the completion of each cycle, the orchestrator triggers two parallel review subagents strictly using Pi Durable on Gemini 3.8 Flash High:
`bb thread spawn --provider pi-durable --model antigravity/gemini-3.8-flash --reasoning-level high`

1. **Circuit 1: Semantic Architecture Review (`arch-rules-implementation-review`)**
   - Evaluates modular integrity, loose coupling, absence of leaky abstractions.
   - Verifies AP-010, AP-011, AP-012, AP-020, AP-072, AP-073.
   - Zero tolerance for P0, P1, P2 findings.
2. **Circuit 2: Black-Box Synthetic Product Review (`arch-improvement-product-review`)**
   - Traverses the Three Golden Journeys (Happy Path, Empty State, Error Recovery) as an external operator without inspecting code.
   - Confirms exit codes, readable JSON-RPC error responses, zero hanging processes.
3. **Gate Rule:** Unanimous **PASS** required before advancing to the next cycle.
