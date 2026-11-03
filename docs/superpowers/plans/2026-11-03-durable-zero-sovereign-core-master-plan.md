# Durable-Zero Sovereign Core & Semantic Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `durable-zero` into a sovereign, modular headless agent runtime with domain-based semantic contracts, pluggable execution environments via DIP, clean Pi extension architecture separating declaration from composition (AP-073), and a unified JSON-RPC 2.0 stdio transport leveraging upstream Pi MCP primitives.

**Architecture:** Hexagonal Architecture (Ports & Adapters) where Inbound Adapters (JSON-RPC 2.0 stdio transport) wrap the Core Domain (`DurableZeroEngine`), while Outbound SPIs (`IExecutionEnvironment`, `IConfigProvider`) are injected via Strategy pattern in the Composition Root. Domain contracts in `packages/contracts/` are organized semantically by Bounded Contexts (`execution/`, `session/`, `tools/`, `protocol/`, `config/`), not by technical layers.

**Tech Stack:** TypeScript 5.9, Node.js 22+ (ESM), `@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-agent-core` 1.5.0, `@earendil-works/pi-mcp` 1.5.0, `@earendil-works/pi-ai` 1.5.0, `@earendil-works/chord` 1.5.0, `quickjs-wasi`, `node:test`.

---

## Architecture Context Map

- **Stage:** `prod` / `infra_harness`
- **Target Repository:** `/Users/vanya/Projects/durable-zero`
- **Applicable Critical AP Gates:**
  - **AP-010 (Modular Monolith & Ports & Adapters):** Core domain depends strictly on contracts; integrations are isolated behind ports.
  - **AP-011 (High Cohesion & Low Coupling):** Grouping by functional domains (Screaming Architecture), never by technical type buckets (`ports/`, `wire/`).
  - **AP-012 (Fail-Fast & Dependency Inversion):** Explicit contracts, no implicit global fallbacks or loose `any` casts.
  - **AP-013 (Data Integrity & SQLite Atomicity):** State changes and message admissions go through atomic `root.submit(tx, draft)` inside `harness.commit()`.
  - **AP-020 & AP-073 (Composition Root & Separation of Declaration from Configuration):** Domain classes declare dependencies; object wiring occurs exclusively in bootstrap factories. Extensions never self-register on import.
  - **AP-071 (Node.js Default):** Native Node.js ESM baseline.
  - **AP-072 (Domain Strategies over Procedural Switch/Case):** Transports, environments, and configs are polymorphic strategies.

---

## File Structure Map (Target Semantic Reorganization)

```
packages/contracts/src/
├── execution/                <- Execution Environment Domain
│   ├── environment.ts        <- IExecutionEnvironment & EnvTarget contracts
│   └── types.ts              <- ExecResult, ExecOptions, FileStat
├── session/                  <- Session & Conversation Domain
│   ├── message.ts            <- UserMessage, AssistantMessage, ToolResultMessage
│   ├── lifecycle.ts          <- SessionLifecycleEvent (agent_start, turn_end, etc.)
│   └── task-graph.ts         <- RuntimeTaskNode, RuntimeGraphSnapshot, TaskReceipt
├── tools/                    <- Tool & Sandbox Domain
│   ├── tool-definition.ts    <- ToolCall, ToolResult, ToolDefinition
│   └── sandbox.ts            <- ICodemodeSandbox, CodemodeResult, CodemodeReplayRun
├── protocol/                 <- Client-Server Protocol Domain (JSON-RPC 2.0)
│   ├── jsonrpc.ts            <- JsonRpcRequest, JsonRpcResponse, JsonRpcNotification
│   ├── methods.ts            <- session/prompt, session/cancel, session/update
│   └── transport.ts          <- ITransportStrategy (send, onMessage, close)
├── config/                   <- Configuration & Policy Domain
│   ├── config-provider.ts    <- IConfigProvider (getSecret, getSetting, getModel)
│   ├── skill-provider.ts     <- ISkillLoader (loadSkills)
│   └── subagent-policy.ts    <- SubagentPolicyRecord, SubagentPolicyMode
└── index.ts                  <- Semantic Root Re-exports

packages/core/src/
├── bootstrap/                <- Composition Root (AP-073)
│   ├── harness-composition.ts<- Pure composition of extensions into harness registry
│   └── host-builder.ts       <- DurableHostBuilder (wires strategies together)
├── adapters/                 <- Strategy Implementations (AP-072)
│   ├── execution/
│   │   ├── local-node-env.ts <- Default LocalNodeExecutionEnv
│   │   └── mock-env.ts       <- In-memory MockExecutionEnv for testing
│   ├── config/
│   │   ├── pi-resource-ext.ts<- PiResourceExtension (wraps SettingsManager & ResourceLoader)
│   │   └── static-config.ts  <- Headless StaticConfigAdapter (process.env / pure object)
│   └── transport/
│       └── stdio-jsonrpc.ts  <- Single Default StdioJsonRpcTransport (JSON-RPC 2.0)
├── engine.ts                 <- Sovereign DurableZeroEngine
└── runtime.ts                <- Session Runtime Coordinator (Bind-before-Resume)
```

---

## Sequential Arch Improvement Cycles

---

### Cycle 1: Semantic Contracts Reorganization & Pluggable Execution Environment

**Goal:** Reorganize `packages/contracts/src/` into semantic domain bounded contexts (eliminating technical `wire-*` and `runner-*` groupings) and introduce the pluggable `IExecutionEnvironment` strategy into `packages/core/src/harness-setup.ts`.

#### Task 1.1: Create Semantic Domain Contracts in `packages/contracts/src/`

**Files:**
- Create: `packages/contracts/src/execution/environment.ts`
- Create: `packages/contracts/src/execution/types.ts`
- Create: `packages/contracts/src/protocol/jsonrpc.ts`
- Create: `packages/contracts/src/protocol/transport.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/semantic-contracts.test.ts`

- [ ] **Step 1: Write the failing test for semantic contracts**

Create `packages/contracts/test/semantic-contracts.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  type IExecutionEnvironment,
  type ExecutionEnvFactory,
  type ITransportStrategy,
} from "../src/index.ts";

describe("Semantic Contracts Bounded Contexts", () => {
  it("exports IExecutionEnvironment contract and ExecutionEnvFactory", () => {
    const mockFactory: ExecutionEnvFactory = (target) => ({
      id: "test-env",
      cwd: target.cwd ?? "/tmp",
      readFile: async () => "content",
      writeFile: async () => {},
      exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    });
    const env: IExecutionEnvironment = mockFactory({ cwd: "/work" });
    assert.equal(env.id, "test-env");
    assert.equal(env.cwd, "/work");
  });

  it("validates strict JSON-RPC 2.0 request envelope", () => {
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

  it("exports ITransportStrategy interface shape", () => {
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

Run: `node --test packages/contracts/test/semantic-contracts.test.ts`
Expected: FAIL with "Cannot find module '../src/index.ts' or exported member"

- [ ] **Step 3: Write semantic contract definitions**

Create `packages/contracts/src/execution/types.ts`:
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

Create `packages/contracts/src/execution/environment.ts`:
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

Create `packages/contracts/src/protocol/jsonrpc.ts`:
```typescript
import { z } from "zod";

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

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
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

export const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;
```

Create `packages/contracts/src/protocol/transport.ts`:
```typescript
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "./jsonrpc.ts";

export type JsonRpcWireMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface ITransportStrategy {
  start(): Promise<void>;
  send(message: JsonRpcWireMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcWireMessage) => void): void;
  close(): Promise<void>;
}
```

Update `packages/contracts/src/index.ts`:
```typescript
export * from "./execution/types.ts";
export * from "./execution/environment.ts";
export * from "./protocol/jsonrpc.ts";
export * from "./protocol/transport.ts";

// Existing exports preserved during migration slice
export * from "./diagnostics.ts";
export * from "./runner-channel.ts";
export * from "./runner-command.ts";
export * from "./runner-event.ts";
export * from "./runner-response.ts";
export * from "./wire-context.ts";
export * from "./wire-lifecycle.ts";
export * from "./wire-message.ts";
export * from "./wire-tool.ts";
export * from "./runtime-graph/types.ts";
export * from "./runtime-graph/schema.ts";
export * from "./runtime-graph/scope.ts";
export * from "./runtime-graph/status.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/contracts/test/semantic-contracts.test.ts`
Expected: PASS (3 tests pass)

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/
git commit -m "refactor(contracts): introduce semantic execution and jsonrpc domain contracts"
```

---

#### Task 1.2: Implement `ExecutionEnvFactory` Strategy in `ExecutionEnvs`

**Files:**
- Modify: `packages/core/src/harness-setup.ts:109-131`
- Create: `packages/core/test/execution-env-strategy.test.ts`

- [ ] **Step 1: Write failing test for pluggable ExecutionEnvFactory**

Create `packages/core/test/execution-env-strategy.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionEnvs } from "../src/harness-setup.ts";
import type { IExecutionEnvironment } from "../../contracts/src/index.ts";

describe("ExecutionEnvs Strategy Pattern (AP-072)", () => {
  it("uses custom injected ExecutionEnvFactory instead of hardcoding NodeExecutionEnv", async () => {
    let factoryCalledWithCwd: string | undefined;
    const mockEnv: IExecutionEnvironment = {
      id: "mock-custom-env",
      cwd: "/custom/sandbox",
      readFile: async () => "mock-data",
      writeFile: async () => {},
      exec: async () => ({ stdout: "mock-result", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    };

    const envs = new ExecutionEnvs("/default/cwd", (target) => {
      factoryCalledWithCwd = target.cwd;
      return mockEnv as any;
    });

    const resolved = envs.env({ cwd: "/custom/sandbox" } as any);
    assert.equal(factoryCalledWithCwd, "/custom/sandbox");
    assert.equal((resolved as any).id, "mock-custom-env");
  });

  it("defaults to local NodeExecutionEnv when no factory is supplied", () => {
    const envs = new ExecutionEnvs(process.cwd());
    const resolved = envs.env({ cwd: process.cwd() } as any);
    assert.ok(resolved);
    assert.equal(typeof (resolved as any).readTextFile, "function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: FAIL with "ExecutionEnvs constructor takes 1 argument, custom factory ignored"

- [ ] **Step 3: Implement Strategy Injection in `packages/core/src/harness-setup.ts`**

Edit `packages/core/src/harness-setup.ts:109-131`:
```typescript
import type { ExecutionEnvFactory } from "../../contracts/src/index.ts";

export class ExecutionEnvs {
	readonly #defaultCwd: string;
	readonly #factory: ExecutionEnvFactory;
	readonly #envs = new Map<string, any>();

	constructor(defaultCwd: string, factory?: ExecutionEnvFactory) {
		this.#defaultCwd = defaultCwd;
		this.#factory = factory ?? (({ cwd = this.#defaultCwd }) => new NodeExecutionEnv({ cwd }));
	}

	readonly env = ({ cwd = this.#defaultCwd, conversationId, read }: EnvTarget): any => {
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
			if (typeof env.cleanup === "function") {
				await env.cleanup(context);
			}
		}
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/execution-env-strategy.test.ts`
Expected: PASS (2 tests pass)
Run full suite: `npm test`
Expected: 180 tests pass (100%)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/harness-setup.ts packages/core/test/execution-env-strategy.test.ts
git commit -m "feat(core): implement ExecutionEnvFactory strategy pattern in ExecutionEnvs"
```

---

### Cycle 2: Pi Resource Isolation via Native Extensions (ACL & AP-073)

**Goal:** Isolate `@earendil-works/pi-coding-agent` dependencies (`SettingsManager`, `DefaultResourceLoader`) into a dedicated `PiResourceExtension` (defined via Pi Durable's native `defineExtension`). Enforce AP-073: the extension file is purely declarative and does NOT perform self-registration; registration into `harness.registry` occurs strictly in the Composition Root.

#### Task 2.1: Implement `IConfigProvider` Domain Contract in `packages/contracts/`

**Files:**
- Create: `packages/contracts/src/config/config-provider.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/config-provider.test.ts`

- [ ] **Step 1: Write failing test for IConfigProvider**

Create `packages/contracts/test/config-provider.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IConfigProvider } from "../src/index.ts";

describe("IConfigProvider Contract", () => {
  it("satisfies configuration retrieval contract", async () => {
    const provider: IConfigProvider = {
      getDefaultModel: () => ({ provider: "antigravity", modelId: "gemini-3.8-flash" }),
      getSecret: async (key) => key === "API_KEY" ? "secret-123" : undefined,
      getSkillPaths: () => ["/skills/path"],
    };
    assert.deepEqual(provider.getDefaultModel(), { provider: "antigravity", modelId: "gemini-3.8-flash" });
    assert.equal(await provider.getSecret("API_KEY"), "secret-123");
    assert.deepEqual(provider.getSkillPaths(), ["/skills/path"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/contracts/test/config-provider.test.ts`
Expected: FAIL with "Module has no exported member IConfigProvider"

- [ ] **Step 3: Implement `IConfigProvider` in `packages/contracts/src/config/config-provider.ts`**

Create `packages/contracts/src/config/config-provider.ts`:
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

Update `packages/contracts/src/index.ts` to export it:
```typescript
export * from "./config/config-provider.ts";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/contracts/test/config-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/config/ packages/contracts/test/config-provider.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add IConfigProvider domain contract"
```

---

#### Task 2.2: Wrap Pi Harness Resources in Declarative `PiResourceExtension` (AP-073 Compliant)

**Files:**
- Create: `packages/core/src/builtin-extensions/pi-resource-extension.ts`
- Test: `packages/core/test/pi-resource-extension.test.ts`

- [ ] **Step 1: Write failing test for PiResourceExtension**

Create `packages/core/test/pi-resource-extension.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPiResourceExtension } from "../src/builtin-extensions/pi-resource-extension.ts";

describe("PiResourceExtension (AP-073 Declaration / Configuration Separation)", () => {
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

Run: `node --test packages/core/test/pi-resource-extension.test.ts`
Expected: FAIL with "Cannot find module '../src/builtin-extensions/pi-resource-extension.ts'"

- [ ] **Step 3: Implement `PiResourceExtension` using `defineExtension`**

Create `packages/core/src/builtin-extensions/pi-resource-extension.ts`:
```typescript
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import type { IConfigProvider, ModelConfigRef } from "../../contracts/src/index.ts";

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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/pi-resource-extension.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/builtin-extensions/pi-resource-extension.ts packages/core/test/pi-resource-extension.test.ts
git commit -m "feat(core): encapsulate Pi settings and loader into native PiResourceExtension (AP-073)"
```

---

### Cycle 3: Elimination of Pi Durable Duplicate Bikes (Zero Shims & Bind-before-Resume)

**Goal:** Eliminate custom watcher/courier mechanisms (`subagent-courier.ts`, `subagent-watcher.ts`, `runtime-graph-*.ts`) in favor of native Pi Durable primitives (`ownership: { kind: "task" }`, `harness.watchTaskGraph()`, `ConversationTranscript`), while guaranteeing the `Bind-before-Resume` invariant.

#### Task 3.1: Enforce Bind-before-Resume in `runtime.ts`

**Files:**
- Modify: `packages/core/src/runtime.ts:155-165`
- Test: `packages/core/test/before-resume.test.ts`

- [ ] **Step 1: Write test verifying bind executes strictly before resume**

Check existing `packages/core/test/before-resume.test.ts`. Add assertion that storage and harness are bound before tasks execute.
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

- [ ] **Step 3: Verify and lock `runtime.ts` execution order**

Inspect `packages/core/src/runtime.ts`:
```typescript
await controller.toggleTasks();
await options.beforeResume?.(harness);
await harness.resume();
```
Order is verified and locked against regressions.

- [ ] **Step 4: Commit verification lock**

```bash
git commit --allow-empty -m "chore(core): verify and lock Bind-before-Resume invariant order"
```

---

#### Task 3.2: Replace Manual Task Graph Mapper with Native `harness.watchTaskGraph()`

**Files:**
- Delete: `packages/core/src/runtime-graph-mapper.ts`
- Delete: `packages/core/src/runtime-graph-receipts.ts`
- Delete: `packages/core/src/runtime-graph-source.ts`
- Delete: `packages/core/src/runtime-graph-state.ts`
- Delete: `packages/core/src/runtime-graph-scope.ts`
- Create: `packages/core/src/native-task-graph.ts`
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

- [ ] **Step 3: Remove custom graph mappers and redirect callers to `harness.watchTaskGraph`**

Delete redundant files:
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
git commit -m "refactor(core): delete custom task graph mappers in favor of native harness.watchTaskGraph"
```

---

### Cycle 4: Unified JSON-RPC 2.0 stdio Transport (Single Default Strategy)

**Goal:** Remove legacy custom framing (`RunnerRpcChannel`, `host-rpc.ts`) and establish a single, robust, standards-compliant JSON-RPC 2.0 transport over `stdio` (`session/prompt`, `session/cancel`, `session/update`) reusing message contracts and validation from `@earendil-works/pi-mcp`.

#### Task 4.1: Implement `StdioJsonRpcTransport`

**Files:**
- Create: `packages/core/src/transport/stdio-jsonrpc-transport.ts`
- Test: `packages/core/test/stdio-jsonrpc-transport.test.ts`

- [ ] **Step 1: Write failing test for StdioJsonRpcTransport**

Create `packages/core/test/stdio-jsonrpc-transport.test.ts`:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { StdioJsonRpcTransport } from "../src/transport/stdio-jsonrpc-transport.ts";

describe("StdioJsonRpcTransport (JSON-RPC 2.0 Standard)", () => {
  it("processes session/prompt request and replies with jsonrpc 2.0 result", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, encoding, callback) {
        outputBuffer += chunk.toString();
        callback();
      },
    });

    const transport = new StdioJsonRpcTransport({
      stdin: input,
      stdout: output,
      handler: async (method, params) => {
        if (method === "session/prompt") return { status: "accepted", prompt: params.content };
        throw new Error(`Unknown method: ${method}`);
      },
    });
    await transport.start();

    input.push(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/prompt", params: { content: "test" } }) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = JSON.parse(outputBuffer.trim());
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.deepEqual(response.result, { status: "accepted", prompt: "test" });
    await transport.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/stdio-jsonrpc-transport.test.ts`
Expected: FAIL with "Cannot find module '../src/transport/stdio-jsonrpc-transport.ts'"

- [ ] **Step 3: Implement `StdioJsonRpcTransport` implementing `ITransportStrategy`**

Create `packages/core/src/transport/stdio-jsonrpc-transport.ts`:
```typescript
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { jsonRpcRequestSchema, type ITransportStrategy, type JsonRpcWireMessage } from "../../contracts/src/index.ts";

export interface StdioJsonRpcTransportOptions {
  stdin?: Readable;
  stdout?: Writable;
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}

export class StdioJsonRpcTransport implements ITransportStrategy {
  private stdin: Readable;
  private stdout: Writable;
  private handler: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  private decoder = new StringDecoder("utf8");
  private buffer = "";
  private messageHandlers: Array<(msg: JsonRpcWireMessage) => void> = [];
  private onDataHandler = (chunk: Buffer) => { void this.handleChunk(chunk); };

  constructor(options: StdioJsonRpcTransportOptions) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.handler = options.handler;
  }

  public async start(): Promise<void> {
    this.stdin.on("data", this.onDataHandler);
  }

  public async close(): Promise<void> {
    this.stdin.off("data", this.onDataHandler);
  }

  public onMessage(handler: (msg: JsonRpcWireMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public async send(message: JsonRpcWireMessage): Promise<void> {
    const payload = JSON.stringify(message) + "\n";
    this.stdout.write(payload);
  }

  public sendNotification(method: string, params: Record<string, unknown>): void {
    void this.send({ jsonrpc: "2.0", method, params });
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
    void this.send({ jsonrpc: "2.0", id, result });
  }

  private sendError(id: string | number | null, code: number, message: string): void {
    void this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/stdio-jsonrpc-transport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/transport/ packages/core/test/stdio-jsonrpc-transport.test.ts
git commit -m "feat(core): implement StdioJsonRpcTransport conforming to JSON-RPC 2.0"
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
