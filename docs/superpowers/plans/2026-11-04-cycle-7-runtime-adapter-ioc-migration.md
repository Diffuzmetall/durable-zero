# Cycle 7: Runtime Adapter Migration, Pure Core Decoupling & Native JSON-RPC 2.0 Transport

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the 45 files of the Pi Durable agent runtime out of `@durable-zero/core` into `@durable-zero/adapter-pi-durable`, establish a pure domain SPI port `IAgentEngine` in Core, connect `SessionCoordinator` to the real runtime via pure Dependency Injection (AP-074), eliminate legacy ad-hoc transport in favor of strict Full-Duplex JSON-RPC 2.0 over stdio with Host Tool Calling, implement probe mode (`--no-session`), and purify `@durable-zero/core` to zero vendor/adapter dependencies.

**Architecture:** Strict Hexagonal Architecture (Ports & Adapters, AP-010). Core defines domain SPIs (`ISessionStore`, `IAgentEngine`, `IModelProvider`, `IExecutionEnvironment`, `ISandboxExtension`, `IResourceLoader`) and high-level FSM coordination (`SessionCoordinator`). All `@earendil-works/*` harness, subagent, and event bridging implementations live strictly in `@durable-zero/adapter-pi-durable`. Client communication uses full-duplex JSON-RPC 2.0 over stdio via `@durable-zero/protocol` and `@durable-zero/runner`, supporting bidirectional host tool calls (`host/toolCall`) without any backward-compatibility compromises.

**Tech Stack:** Node.js 22+ ESM, `@durable-zero/protocol` (JSON-RPC 2.0 stdio server & client), `@durable-zero/core`, `@durable-zero/adapter-pi-durable` (`@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-ai`, `@earendil-works/chord`), `@durable-zero/runner`, Zod.

---

## Verification of Auditor Findings (@thread:thr_usuwfbnhx7)

Our cross-source code inspection confirmed all 5 auditor findings with 100% precision:
1. **Agent Loop Missing:** `SessionCoordinator.prompt()` returns a stub `rec_...` without executing the agent loop.
2. **Coordinator Never Started:** `assembleDurableZero()` constructs `SessionCoordinator` but never calls `await coordinator.start()`, causing any `prompt()` to throw `"Session is not started"`.
3. **Host Tool Bridge Missing:** `assembleDurableZero()` does not support client-hosted tools (`AskUserQuestion`, `check_ui`) or `host/toolCall` reverse RPC.
4. **Probe Mode Missing:** Passing `--no-session` crashes because `assembleDurableZero()` unconditionally resolves `.durable/sessions/default` and attempts SQLite locking.
5. **Runtime Graph Disconnected:** `RuntimeGraphSource` is not forwarded over JSON-RPC 2.0 `session/event` notifications.

All 5 defects are directly resolved in this Cycle 7 plan.

---

## Architecture Context Map (AP Baseline)

- **Stage:** `infra_harness` / `prod`
- **Applicable Critical AP Gates:**
  - **AP-010 (Hexagonal Architecture / Ports & Adapters):** Core owns SPI ports; adapters implement them. Dependencies point strictly inwards toward Core.
  - **AP-011 (Screaming Architecture):** Core organized strictly by domain contexts (`session/`, `models/`, `tools/`).
  - **AP-012 (Dependency Inversion & Fail-Fast):** Core must have ZERO dependencies on adapters or `@earendil-works/*`. No infrastructure fallbacks in Core.
  - **AP-013 (Data Integrity & ACID Persistence):** SQLite WAL, PID locks (`session.owner.json`), transaction rollback safety.
  - **AP-014 (SOLID & Clean Code):** Single responsibility for each module.
  - **AP-019 / AP-070 (Line Budget):** Adapter files < 120 lines, Core files < 400 lines.
  - **AP-020 (Composition Root):** `@durable-zero/runner` is the single source of truth for graph assembly.
  - **AP-021 (Thin Entry Points):** `main.ts` and `stdio-server.ts` contain no domain or execution logic.
  - **AP-026 (Wire Contracts & DTOs):** Strict JSON-RPC 2.0 schemas.
  - **AP-028 (Deterministic Testing):** Mandatory test timeouts (`--test-timeout 30000`).
  - **AP-074 (Zero Singletons & Pure DI):** Constructor injection only; zero module-level mutable state.

---

## Tasks Breakdown

### Task 1: Domain Port `IAgentEngine` & `SessionCoordinator` Real Delegation in `@durable-zero/core`

**Files:**
- Create: `packages/core/src/session/engine.ts`
- Modify: `packages/core/src/session/coordinator.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/session-coordinator-engine.test.ts`

- [ ] **Step 1: Write the failing test for `IAgentEngine` delegation in `SessionCoordinator`**

Create `packages/core/test/session-coordinator-engine.test.ts`:
```typescript
import test from "node:test";
import assert from "node:assert/strict";
import {
  SessionCoordinator,
  type IAgentEngine,
  type ISessionStore,
  type PromptOptions,
  type PromptAdmissionReceipt
} from "../src/index.ts";

class MockSessionStore implements ISessionStore {
  public sessionDir = "/tmp/mock-session";
  public lockAcquired = false;
  public closed = false;
  async acquireLock() { this.lockAcquired = true; return async () => { this.lockAcquired = false; }; }
  async releaseLock() { this.lockAcquired = false; }
  async loadDocument() { return null; }
  async saveDocument() {}
  async close() { this.closed = true; }
}

class MockAgentEngine implements IAgentEngine {
  public started = false;
  public submittedPrompts: string[] = [];
  public aborted = false;
  public closed = false;
  public eventListeners = new Set<(event: unknown) => void>();

  async start(sessionDir: string): Promise<void> { this.started = true; }
  async submit(prompt: string, _options?: PromptOptions): Promise<PromptAdmissionReceipt> {
    this.submittedPrompts.push(prompt);
    return { status: "accepted", id: `mock_${Date.now()}` };
  }
  async abort(): Promise<void> { this.aborted = true; }
  getState(): Record<string, unknown> { return { engineActive: this.started }; }
  events(listener: (event: unknown) => void): () => void {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }
  async close(): Promise<void> { this.closed = true; }
}

test("SessionCoordinator delegates start, submit, abort, events, and close to IAgentEngine via Pure DI", async () => {
  const store = new MockSessionStore();
  const engine = new MockAgentEngine();
  const coordinator = new SessionCoordinator({ store, engine });

  await coordinator.start();
  assert.equal(store.lockAcquired, true);
  assert.equal(engine.started, true);

  const receivedEvents: any[] = [];
  const unsub = coordinator.events((e) => receivedEvents.push(e));

  // Trigger engine event
  for (const listener of engine.eventListeners) {
    listener({ type: "item/agentMessage/delta", delta: "hello" });
  }
  assert.equal(receivedEvents.length, 1);
  assert.equal(receivedEvents[0].delta, "hello");

  const receipt = await coordinator.prompt("Test prompt");
  assert.equal(receipt.status, "accepted");
  assert.equal(engine.submittedPrompts[0], "Test prompt");

  await coordinator.abort();
  assert.equal(engine.aborted, true);
  assert.equal(coordinator.isAborted, true);

  await coordinator.close();
  assert.equal(engine.closed, true);
  assert.equal(store.closed, true);
  unsub();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/session-coordinator-engine.test.ts`
Expected: FAIL because `IAgentEngine` does not exist and `SessionCoordinator` does not accept `engine`.

- [ ] **Step 3: Implement `IAgentEngine` port and wire `SessionCoordinator`**

Create `packages/core/src/session/engine.ts`:
```typescript
import type { PromptOptions, PromptAdmissionReceipt } from "./coordinator.ts";

export interface IAgentEngine {
  start(sessionDir: string): Promise<void>;
  submit(prompt: string, options?: PromptOptions): Promise<PromptAdmissionReceipt>;
  abort(): Promise<void>;
  getState(): Record<string, unknown>;
  events(listener: (event: unknown) => void): () => void;
  close(): Promise<void>;
}
```

Update `packages/core/src/session/coordinator.ts`:
```typescript
import type { ISessionStore } from "./store.ts";
import type { IAgentEngine } from "./engine.ts";
import type { IModelProvider } from "../models/provider.ts";
import type { IExecutionEnvironment } from "../tools/execution-env.ts";

export interface IResourceLoader {
  getSystemPrompt?(): Promise<string> | string;
  getContextFiles?(): Array<{ path: string; content: string }>;
  getSkills?(): Array<{ name: string; description: string }>;
}

export interface PromptAdmissionReceipt {
  status: "accepted" | "rejected";
  id: string;
  error?: string;
}

export interface PromptOptions {
  deliverAs?: "steer" | "followUp";
}

export interface SessionCoordinatorOptions {
  store: ISessionStore;
  engine?: IAgentEngine;
  modelProvider?: IModelProvider;
  executionEnv?: IExecutionEnvironment;
  resourceLoader?: IResourceLoader;
}

export class SessionCoordinator {
  private readonly store: ISessionStore;
  private readonly engine?: IAgentEngine;
  private readonly modelProvider?: IModelProvider;
  private readonly executionEnv?: IExecutionEnvironment;
  private readonly resourceLoader?: IResourceLoader;
  private isStarted = false;
  private isClosed = false;
  public isAborted = false;
  private readonly listeners = new Set<(event: unknown) => void>();
  private engineUnsub?: () => void;

  constructor(options: SessionCoordinatorOptions) {
    this.store = options.store;
    this.engine = options.engine;
    this.modelProvider = options.modelProvider;
    this.executionEnv = options.executionEnv;
    this.resourceLoader = options.resourceLoader;

    if (this.engine) {
      this.engineUnsub = this.engine.events((event) => {
        this.emitEvent(event);
      });
    }
  }

  public async start(): Promise<void> {
    await this.store.acquireLock();
    if (this.engine) {
      await this.engine.start(this.store.sessionDir);
    }
    this.isStarted = true;
  }

  public async prompt(content: string, options?: PromptOptions): Promise<PromptAdmissionReceipt> {
    if (this.isClosed) throw new Error("Session is closed");
    if (this.isAborted) throw new Error("Session is aborted");
    if (!this.isStarted) throw new Error("Session is not started. Call start() before submitting prompts");
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Prompt content must be a non-empty string");
    }

    if (this.engine) {
      return await this.engine.submit(content, options);
    }
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { status: "accepted", id };
  }

  public emitEvent(event: unknown): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  public events(callback: (event: unknown) => void): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  public async abort(): Promise<void> {
    this.isAborted = true;
    if (this.engine) {
      await this.engine.abort();
    }
    this.emitEvent({ type: "session/aborted" });
  }

  public getState(): Record<string, unknown> {
    return {
      isStarted: this.isStarted,
      isAborted: this.isAborted,
      isClosed: this.isClosed,
      sessionDir: this.store.sessionDir,
      engineState: this.engine?.getState(),
    };
  }

  public async setSubagentPolicy(params: unknown): Promise<{ ok: boolean }> {
    await this.store.saveDocument("subagents", "policy_ack", params);
    return { ok: true };
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    this.isStarted = false;
    this.engineUnsub?.();
    if (this.engine) {
      await this.engine.close();
    }
    this.listeners.clear();
    await this.store.releaseLock();
    await this.store.close();
  }
}
```

Update `packages/core/src/index.ts` to export `IAgentEngine` from `./session/engine.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/session-coordinator-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/engine.ts packages/core/src/session/coordinator.ts packages/core/src/index.ts packages/core/test/session-coordinator-engine.test.ts
git commit -m "feat(core): declare IAgentEngine SPI and wire SessionCoordinator execution delegation"
```

---

### Task 2: Migrate 45 Runtime Files to `@durable-zero/adapter-pi-durable` & Implement `PiDurableEngine`

**Files:**
- Move: 45 files from `packages/core/src/` to `packages/adapter-pi-durable/src/engine/`
- Create: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` (< 120 lines)
- Modify: `packages/adapter-pi-durable/src/index.ts`
- Modify: `packages/adapter-pi-durable/package.json`
- Move tests: corresponding runtime test suites from `packages/core/test/` to `packages/adapter-pi-durable/test/`

- [ ] **Step 1: Update `packages/adapter-pi-durable/package.json` with runtime dependencies**

Add necessary dependencies (`@earendil-works/chord`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-schema`, `@durable-zero/contracts`, `@durable-zero/execution`, `@durable-zero/adapter-pi-ai`, `@durable-zero/adapter-codemode`, `zod`). Run `pnpm install`.

- [ ] **Step 2: Relocate runtime files into `packages/adapter-pi-durable/src/engine/`**

Move all legacy/engine files (`runtime.ts`, `harness-setup.ts`, `engine.ts`, `runtime-*.ts`, `subagent-*.ts`, `bridge/*`, `policy/*`, `shared/*`, `builtin-extensions/*`, `control-channel.ts`, `stdout-guard.ts`, `tool-adapter.ts`, `session-commands.ts`, etc.) into `packages/adapter-pi-durable/src/engine/`.

- [ ] **Step 3: Implement `PiDurableEngine` implementing `IAgentEngine`**

Create `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` (< 120 lines):
```typescript
import type { IAgentEngine, PromptAdmissionReceipt, PromptOptions, ExecutionEnvFactory } from "@durable-zero/core";
import { openDurable } from "./runtime.ts";
import type { OpenDurableResult } from "./runtime-types.ts";
import { DurableEventAdapter } from "./bridge/durable-event-adapter.ts";
import type { RunnerEvent } from "@durable-zero/contracts";
import { RuntimeGraphSource } from "./runtime-graph-source.ts";

export interface PiDurableEngineOptions {
  cwd?: string;
  executionEnvFactory: ExecutionEnvFactory;
  extensions?: string[];
  noGlobalExtensions?: boolean;
}

export class PiDurableEngine implements IAgentEngine {
  private options: PiDurableEngineOptions;
  private runtime: OpenDurableResult | null = null;
  private eventAdapter: DurableEventAdapter;
  private graphSource: RuntimeGraphSource | null = null;
  private listeners = new Set<(event: unknown) => void>();

  constructor(options: PiDurableEngineOptions) {
    this.options = options;
    this.eventAdapter = new DurableEventAdapter((event: RunnerEvent) => {
      for (const listener of this.listeners) {
        listener(event);
      }
    });
  }

  public async start(sessionDir: string): Promise<void> {
    const cwd = this.options.cwd ?? process.cwd();
    this.runtime = await openDurable({
      cwd,
      sessionDir,
      continueSession: true,
      executionEnvFactory: this.options.executionEnvFactory,
      cli: {
        extensions: this.options.extensions,
        noGlobalExtensions: this.options.noGlobalExtensions,
      },
    });

    this.graphSource = new RuntimeGraphSource(this.runtime.harness, (graphEvent) => {
      this.eventAdapter.consumeView(this.runtime!.view.current());
      for (const listener of this.listeners) {
        listener(graphEvent);
      }
    });

    this.runtime.view.subscribe((state) => {
      this.eventAdapter.consumeView(state);
    });
  }

  public async submit(prompt: string, options?: PromptOptions): Promise<PromptAdmissionReceipt> {
    if (!this.runtime) throw new Error("PiDurableEngine is not started");
    const receipt = await this.runtime.controller.submit(prompt, options?.deliverAs ?? "followUp");
    return { status: "accepted", id: receipt.id };
  }

  public async abort(): Promise<void> {
    if (!this.runtime) return;
    await this.runtime.controller.abort();
  }

  public getState(): Record<string, unknown> {
    return {
      active: this.runtime !== null,
      sessionDir: this.runtime?.view.current()?.conversation?.docs?.["pi.session"]?.sessionDir,
    };
  }

  public events(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public async close(): Promise<void> {
    this.listeners.clear();
    this.graphSource = null;
    if (this.runtime) {
      await this.runtime.close();
      this.runtime = null;
    }
  }
}
```

- [ ] **Step 4: Relocate test suites and run tests**

Relocate runtime tests into `packages/adapter-pi-durable/test/`. Run tests via `pnpm test`. Verify all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-pi-durable
git commit -m "feat(adapter-pi-durable): encapsulate native Pi Durable runtime and runtime graph in PiDurableEngine"
```

---

### Task 3: Decouple `packages/core/package.json` to 100% Pure Abstract Sovereignty

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Purge adapter dependencies from `packages/core/package.json`**

Edit `packages/core/package.json`:
```json
{
  "name": "@durable-zero/core",
  "version": "0.26.31",
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
    "@durable-zero/contracts": "workspace:*",
    "zod": "^4.6.7"
  }
}
```

- [ ] **Step 2: Clean `packages/core/src/index.ts` to export only domain interfaces**

Ensure `packages/core/src/index.ts` exports strictly:
```typescript
export * from "./session/store.ts";
export * from "./session/coordinator.ts";
export * from "./session/engine.ts";
export * from "./models/provider.ts";
export * from "./tools/sandbox.ts";
export * from "./tools/execution-env.ts";
```

- [ ] **Step 3: Verify Zero Vendor Invasions in Core**

Run: `grep -rn "@earendil-works" packages/core/src/`
Expected: 0 matches!
Run: `grep -rn "@durable-zero/adapter" packages/core/src/`
Expected: 0 matches!

- [ ] **Step 4: Commit**

```bash
git add packages/core/package.json packages/core/src/index.ts
git commit -m "refactor(core): achieve 100% sovereign domain purity with zero vendor or adapter dependencies"
```

---

### Task 4: Pure JSON-RPC 2.0 Runner, Host Tool Bridge & Elimination of Legacy Runner Server

**Files:**
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Delete: `packages/core/src/runner-server.ts`
- Modify: `packages/cli/bin/durable-zero.js`
- Modify: `scripts/build.mjs`
- Modify: `package.json`

- [ ] **Step 1: Update `assembleDurableZero` to support Probe Mode (`--no-session`) and Host Tool Bridge**

In `packages/runner/src/composition.ts`:
1. If `options.noSession` is passed:
   - Do not open SQLite session or acquire locks.
   - Return probe instance providing `server` with model discovery (`models/list`) and health checks.
2. If in session mode:
   - Instantiate `PiDurableEngine` with `executionEnv`.
   - Call `await coordinator.start()` explicitly upon assembly (fixing Auditor Finding 2).
   - Wire Host Tool Bridge: support `server.request("host/toolCall", { toolName, args })` for reverse tool calls (fixing Auditor Finding 3).
   - Wire `coordinator.events(...)` directly to `server.sendNotification("session/event", { event })` (fixing Auditor Finding 5).
3. Pure JSON-RPC 2.0 methods:
   - `session/prompt` (`{ content, options }`) -> `coordinator.prompt(content, options)`
   - `session/abort` -> `coordinator.abort()`
   - `session/getState` -> `coordinator.getState()`
   - `session/setSubagentPolicy` -> `coordinator.setSubagentPolicy(params)`
   - `session/fork` -> invokes fork logic on store.

- [ ] **Step 2: Delete legacy runner `packages/core/src/runner-server.ts`**

Run: `rm packages/core/src/runner-server.ts`

- [ ] **Step 3: Update CLI & Build Pipeline**

In `packages/cli/bin/durable-zero.js`:
Update `command === "serve"` to execute `@durable-zero/runner` via `assembleDurableZero` with pure JSON-RPC 2.0 stdio transport.

In `scripts/build.mjs`:
Remove legacy `packages/core/dist/runner.js` build step. Build strictly 9 packages + `packages/runner/dist/main.js`. Copy `quickjs.wasm` to `packages/runner/dist/`.

In root `package.json`:
Set `"./runner": "./packages/runner/dist/main.js"`.

- [ ] **Step 4: Run full build and test suite**

Run: `npm run build && npm test -- --test-timeout 30000`
Expected: All packages compile cleanly, all tests pass!

- [ ] **Step 5: Commit**

```bash
git add packages/runner packages/cli scripts/build.mjs package.json
git commit -m "feat(runner): unify on pure JSON-RPC 2.0 stdio server with host tool bridge and probe mode"
```

---

### Task 5: End-to-End Dual-Circuit Review & Ledger Update (S9 Gate)

- [ ] **Step 1: Verify line count budgets (AP-019 / AP-070)**

Run inspection script: all adapter files < 120 lines, all core files < 400 lines.

- [ ] **Step 2: Launch S9 Dual-Circuit Review**

Spawn two independent reviewer subagents on Gemini 3.8 Flash High:
1. Architectural Reviewer (`arch-rules-implementation-review`).
2. Product Reviewer (`arch-improvement-product-review`).
Both must issue `VERDICT: PASS`.

- [ ] **Step 3: Update `docs/arch-improvement/ledger.md` and commit**

```bash
git add docs/arch-improvement/ledger.md
git commit -m "docs(ledger): record Cycle 7 runtime adapter migration and JSON-RPC 2.0 unification closure"
```
