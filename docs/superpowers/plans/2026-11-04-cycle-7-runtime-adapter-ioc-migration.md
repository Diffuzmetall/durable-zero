# Cycle 7: Runtime Adapter Migration & Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a verified end-to-end **Walking Skeleton (Slice 0)** for `durable-zero` using strict Hexagonal Architecture (AP-010) and pure Constructor Dependency Injection (AP-074), incrementally migrate the real agent runtime into `@durable-zero/adapter-pi-durable` as `PiDurableEngine` via the Strangler Fig pattern, unify on strict bidirectional JSON-RPC 2.0 over stdio with Host Tool Calling (`host/toolCall`) and probe mode (`--no-session`), purge `@durable-zero/core` to 100% vendor-agnostic sovereignty, and verify via Triple-Circuit Gate (S9).

**Architecture:** Monorepo package-level Hexagonal Architecture (Ports & Adapters, AP-010). Core defines domain SPIs (`ISessionStore`, `IAgentEngine`, `IModelProvider`, `IExecutionEnvironment`, `ISandboxExtension`, `IResourceLoader`) and high-level FSM coordination (`SessionCoordinator`). All `@earendil-works/*` harness, subagent, and event bridging implementations live strictly in `@durable-zero/adapter-pi-durable`. Client communication uses full-duplex JSON-RPC 2.0 over stdio via `@durable-zero/protocol` and `@durable-zero/runner`, supporting bidirectional host tool calls (`host/toolCall`) without any backward-compatibility compromises.

**Tech Stack:** Node.js 22+ ESM, `@durable-zero/protocol` (JSON-RPC 2.0 stdio server & client), `@durable-zero/core`, `@durable-zero/adapter-pi-durable` (`@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-ai`, `@earendil-works/chord`), `@durable-zero/runner`, Zod, `node:test`.

**Spec:** `docs/superpowers/plans/2026-11-03-durable-zero-sovereign-core-master-plan.md` + Auditor findings (@thread:thr_usuwfbnhx7) + Retro lessons (thr_rfpka9ntjx / session `01a1a651-ede7-73d5-a308-e869f2fb4b43`).

---

## Global Constraints

- **Pure Sovereign Core:** `@durable-zero/core/package.json` must depend only on `@durable-zero/contracts` and `zod`. Zero `@earendil-works/*`, zero SQLite, and zero `@durable-zero/adapter-*` dependencies in Core (AP-010, AP-012).
- **Single Production Runner:** `@durable-zero/runner` (`main.ts`) is the single production Composition Root for `durable-zero serve`. Delete `packages/core/src/runner-server.ts` (AP-020, AP-075).
- **Pure JSON-RPC 2.0 Transport:** Stdio communication uses strict JSON-RPC 2.0. No legacy ad-hoc JSONL or multi-transport fallback (AP-026).
- **Pure Constructor Dependency Injection:** Zero singletons, zero module-level mutable variables. All dependencies flow top-down from Composition Root (AP-074).
- **Walking Skeleton Invariant:** We do NOT do horizontal layer slicing across packages. Task 1-3 establishes Slice 0 (Walking Skeleton) connecting entry point -> runner -> coordinator -> engine -> live model stream, proven by a true black-box E2E test before moving the remaining 45 runtime files (AP-075).
- **Assertion Integrity (Anti-Reward Hacking):** Tests must assert actual state transitions, emitted token deltas, and dependency invocations. Returning synthetic stub IDs (`rec_...`) to satisfy tests is classified as P1 Hollow Implementation (AP-076).
- **Mandatory Test Timeout:** All tests run with `--test-timeout 30000` (AP-028).

---

## Review Focus

- **Empty Prompt Validation:** Submitting an empty string or whitespace-only prompt throws a typed `SessionError` before dispatching to the engine.
- **Unstarted Session Rejection:** Calling `prompt()` before `coordinator.start()` or after `close()` throws a typed `SessionError` with clear lifecycle explanation.
- **Prompt Cancellation:** Sending `session/cancel` immediately aborts the active engine turn and emits an abort event to the event stream.
- **Host Tool Bridge Dispatch:** Model requesting a host-provided tool (`AskUserQuestion`, `check_ui`) triggers reverse RPC `host/toolCall` and forwards the host's response back into the turn.
- **Headless Probe Mode:** Running `durable-zero serve --no-session` boots the server in probe mode without creating `.durable/sessions` directory or attempting SQLite locking.

---

## Verification of Auditor Findings (@thread:thr_usuwfbnhx7)

Our code inspection confirmed all 5 auditor findings with 100% precision:
1. **Agent Loop Missing:** `SessionCoordinator.prompt()` returns a stub `rec_...` without executing the agent loop (`coordinator.ts:63`).
2. **Coordinator Never Started:** `assembleDurableZero()` constructs `SessionCoordinator` but never calls `await coordinator.start()`, causing any `prompt()` to throw `"Session is not started"`.
3. **Host Tool Bridge Missing:** `assembleDurableZero()` does not support client-hosted tools (`AskUserQuestion`, `check_ui`) or `host/toolCall` reverse RPC.
4. **Probe Mode Missing:** Passing `--no-session` crashes because `assembleDurableZero()` unconditionally resolves `.durable/sessions/default` and attempts SQLite locking.
5. **Runtime Graph Disconnected:** `RuntimeGraphSource` is not forwarded over JSON-RPC 2.0 `session/event` notifications.

---

## Tasks Breakdown

### Task 1: Slice 0 — Domain Port `IAgentEngine` & `SessionCoordinator` Delegation (Core SPI)

**Files:**
- Create: `packages/core/src/session/engine.ts`
- Modify: `packages/core/src/session/coordinator.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/session-coordinator-engine.test.ts`

**Interfaces:**
- Consumes: `ISessionStore`, `PromptOptions`, `PromptAdmissionReceipt`
- Produces: `IAgentEngine` domain interface:
  ```typescript
  export interface IAgentEngine {
    start(sessionDir: string): Promise<void>;
    submit(prompt: string, options?: PromptOptions): Promise<PromptAdmissionReceipt>;
    abort(): Promise<void>;
    getState(): Record<string, unknown>;
    events(listener: (event: unknown) => void): () => void;
    close(): Promise<void>;
  }
  ```

- [ ] **Step 1: Write failing behavioral test for `IAgentEngine` delegation in `SessionCoordinator`**

In `packages/core/test/session-coordinator-engine.test.ts`:
Create `MockAgentEngine implements IAgentEngine` and `MockSessionStore implements ISessionStore`.
Assert that `coordinator.start()` calls `engine.start()`, `coordinator.prompt("hello")` calls `engine.submit("hello")` and returns the engine's admission receipt (NOT a stub `rec_...`), `coordinator.abort()` calls `engine.abort()`, `coordinator.onEvent()` registers with `engine.events()`, and `coordinator.close()` calls `engine.close()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/core/test/session-coordinator-engine.test.ts`
Expected: FAIL with compilation error (`IAgentEngine` does not exist or coordinator does not accept `engine`).

- [ ] **Step 3: Implement `IAgentEngine` and update `SessionCoordinator`**

In `packages/core/src/session/engine.ts`, declare `IAgentEngine`.
In `packages/core/src/session/coordinator.ts`:
Update constructor to accept `engine: IAgentEngine` via Constructor DI.
Replace the random stub ID generator in `prompt()` with:
```typescript
return await this.engine.submit(content, options);
```
Delegate `start()`, `abort()`, `onEvent()`, and `close()` to `this.engine`.
Export `IAgentEngine` from `packages/core/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/core/test/session-coordinator-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/engine.ts packages/core/src/session/coordinator.ts packages/core/src/index.ts packages/core/test/session-coordinator-engine.test.ts
git commit -m "feat(core): declare IAgentEngine SPI port and wire SessionCoordinator delegation via pure DI"
```

---

### Task 2: Slice 0 — `PiDurableEngine` Adapter Facade in `@durable-zero/adapter-pi-durable`

**Files:**
- Create: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
- Modify: `packages/adapter-pi-durable/src/index.ts`
- Test: `packages/adapter-pi-durable/test/pi-durable-engine.test.ts`

**Interfaces:**
- Consumes: `IAgentEngine` (from `@durable-zero/core`), existing runtime (`openDurable` from `packages/core/src/runtime.ts`)
- Produces: `PiDurableEngine implements IAgentEngine` (<120 LOC)

- [ ] **Step 1: Write failing integration test for `PiDurableEngine`**

In `packages/adapter-pi-durable/test/pi-durable-engine.test.ts`:
Assert that `PiDurableEngine` implements `IAgentEngine`, boots with `start(tmpDir)`, accepts `submit("say hello")`, and forwards events to registered listeners.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/adapter-pi-durable/test/pi-durable-engine.test.ts`
Expected: FAIL with "Cannot find module '.../pi-durable-engine.ts'".

- [ ] **Step 3: Implement `PiDurableEngine` facade**

In `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`:
Implement `PiDurableEngine implements IAgentEngine`.
In `start(sessionDir)`: invoke existing `openDurable({ sessionDir, ... })` and save the handle.
In `submit(prompt, options)`: delegate to `handle.submitPrompt(prompt, options)`.
In `abort()`: delegate to `handle.abort()`.
In `events(listener)`: subscribe to `handle.onEvent(listener)`.
In `close()`: call `handle.close()`.
Export `PiDurableEngine` from `packages/adapter-pi-durable/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/adapter-pi-durable/test/pi-durable-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapter-pi-durable/src/engine/pi-durable-engine.ts packages/adapter-pi-durable/src/index.ts packages/adapter-pi-durable/test/pi-durable-engine.test.ts
git commit -m "feat(adapter-pi-durable): implement PiDurableEngine implementing IAgentEngine SPI"
```

---

### Task 3: Slice 0 — Wiring Composition Root, Single CLI Runner & Living E2E Skeleton

**Files:**
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Modify: `packages/cli/bin/durable-zero.js`
- Test: `packages/runner/test/e2e-walking-skeleton.test.ts`

**Interfaces:**
- Consumes: `PiDurableEngine`, `SessionCoordinator`, `StdioJsonRpcServer`
- Produces: Fully assembled, executable Walking Skeleton responding over stdio JSON-RPC 2.0 with real stream deltas.

- [ ] **Step 1: Write True Black-Box Walking Skeleton E2E Test**

In `packages/runner/test/e2e-walking-skeleton.test.ts`:
Spawn `packages/cli/bin/durable-zero.js serve --session <tempDir>` via `child_process.spawn`.
Send JSON-RPC 2.0 request via stdin:
```json
{"jsonrpc": "2.0", "id": 1, "method": "session/prompt", "params": {"content": "Respond with OK"}}
```
Read stdout stream: assert that a valid JSON-RPC response with `result.status === "accepted"` arrives, AND assert that at least one `session/event` notification arrives with text delta before process exit or abort.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/runner/test/e2e-walking-skeleton.test.ts`
Expected: FAIL (coordinator never started, or CLI running legacy runner).

- [ ] **Step 3: Wire Composition Root and CLI entry point**

In `packages/runner/src/composition.ts`:
- Instantiate `PiDurableEngine` with `store.sessionDir`.
- Pass `engine` to `new SessionCoordinator({ store, engine, ... })`.
- Explicitly call `await coordinator.start()` before returning.
- Subscribe `coordinator.onEvent(evt => server.sendNotification("session/event", evt))`.
In `packages/cli/bin/durable-zero.js`:
- In `command === "serve"`: change entry point from `../../core/src/runner-server.ts` to `../../runner/dist/main.js` (or `runner/src/main.ts` in dev).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/runner/test/e2e-walking-skeleton.test.ts`
Expected: PASS. **The Walking Skeleton is now 100% verified and alive end-to-end!**

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/composition.ts packages/runner/src/main.ts packages/cli/bin/durable-zero.js packages/runner/test/e2e-walking-skeleton.test.ts
git commit -m "feat(runner): wire PiDurableEngine and coordinator.start into Composition Root, prove Walking Skeleton E2E"
```

---

### Task 4: Slice 1 — Strangler Fig Runtime File Migration to Adapter

**Files:**
- Move from `packages/core/src/` to `packages/adapter-pi-durable/src/engine/`:
  - `subagents/*`
  - `bridge/*`
  - `runtime.ts`
  - `runtime-controller.ts`
  - `runtime-graph-source.ts`
- Move from `packages/core/src/` to `packages/adapter-pi-durable/src/storage/`:
  - `session-lock-eviction.ts`
  - `session-storage.ts`
  - `session-fork.ts`
- Modify: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` (update internal paths)

**Interfaces:**
- Consumes: Pi SDK (`@earendil-works/*`) inside adapter
- Produces: Complete operational agent runtime isolated in `@durable-zero/adapter-pi-durable`.

- [ ] **Step 1: Move Subagents and Event Bridge into Adapter**

Move `packages/core/src/subagent-*` and `packages/core/src/bridge/*` into `packages/adapter-pi-durable/src/engine/`.
Update relative import paths within the adapter.
Run `node --test packages/runner/test/e2e-walking-skeleton.test.ts` to confirm skeleton remains green.

- [ ] **Step 2: Move Runtime Controller and Storage Internals into Adapter**

Move `packages/core/src/runtime.ts`, `packages/core/src/runtime-controller.ts`, `packages/core/src/runtime-graph-source.ts` to `packages/adapter-pi-durable/src/engine/`.
Move `packages/core/src/session-lock-eviction.ts`, `packages/core/src/session-storage.ts`, `packages/core/src/session-fork.ts` to `packages/adapter-pi-durable/src/storage/`.
Update `PiDurableEngine` to import directly from `./runtime.ts`.

- [ ] **Step 3: Run full monorepo test suite and E2E verification**

Run: `pnpm test` across monorepo and `node --test packages/runner/test/e2e-walking-skeleton.test.ts`
Expected: ALL test suites PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/ packages/adapter-pi-durable/
git commit -m "refactor(adapter-pi-durable): complete Strangler Fig migration of runtime and storage files from core"
```

---

### Task 5: Slice 2 — Core Dependency Purge & Sovereign Decoupling

**Files:**
- Modify: `packages/core/package.json`
- Remove: `packages/core/src/runner-server.ts`
- Test: Core boundary isolation script

**Interfaces:**
- Consumes: Only `@durable-zero/contracts` and `zod`
- Produces: 100% sovereign, vendor-agnostic `@durable-zero/core` package.

- [ ] **Step 1: Purge adapter dependencies from `packages/core/package.json`**

Remove:
- `@durable-zero/adapter-pi-durable`
- `@durable-zero/adapter-pi-ai`
- `@durable-zero/adapter-codemode`
- `@durable-zero/execution`
- Any `@earendil-works/*` packages from `packages/core/package.json`.

- [ ] **Step 2: Delete legacy `runner-server.ts`**

Delete `packages/core/src/runner-server.ts` and ensure no lingering files in `packages/core/src/` import adapters or native packages.

- [ ] **Step 3: Run boundary verification check**

Run:
```bash
grep -rn "@earendil-works" packages/core/src/ || true
grep -rn "@durable-zero/adapter-" packages/core/package.json || true
```
Expected: ZERO lines matching.

- [ ] **Step 4: Run Core unit tests in pure isolation**

Run: `node --test packages/core/test/*.test.ts`
Expected: PASS (all unit tests run with in-memory stores/mocks in < 100ms).

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "chore(core): purge adapter and vendor dependencies, achieving 100% sovereign core"
```

---

### Task 6: Slice 3 — Bidirectional Host Tool Bridge & Headless Probe Mode

**Files:**
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Test: `packages/runner/test/host-tool-bridge.test.ts`
- Test: `packages/runner/test/probe-mode.test.ts`

**Interfaces:**
- Consumes: `StdioJsonRpcServer.request("host/toolCall", ...)`
- Produces: Reverse RPC host tool execution and non-locking probe mode for `--no-session`.

- [ ] **Step 1: Write failing tests for Host Tool Bridge and Probe Mode**

In `packages/runner/test/host-tool-bridge.test.ts`:
Verify that invoking a host tool triggers `server.request("host/toolCall", { toolName, args })` and awaits the host's JSON-RPC response.
In `packages/runner/test/probe-mode.test.ts`:
Verify that running with `--no-session` boots the server without creating `.durable/sessions` directory or creating SQLite database files.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test packages/runner/test/host-tool-bridge.test.ts packages/runner/test/probe-mode.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Host Tool Bridge and Probe Mode**

In `packages/runner/src/composition.ts`:
Implement `HostToolBridge` forwarding tool execution to client via `server.request("host/toolCall", { toolName, args })`.
If `options.noSession === true`, bypass `openSessionStorage` and SQLite locking; instantiate a lightweight probe coordinator.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test packages/runner/test/host-tool-bridge.test.ts packages/runner/test/probe-mode.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runner/src/ packages/runner/test/
git commit -m "feat(runner): implement bidirectional host/toolCall bridge and --no-session probe mode"
```

---

### Task 7: Slice 4 — Triple-Circuit Verification Gate (S9) & Ledger Finalization

**Files:**
- Verify: Circuit A (`arch-rules-implementation-review`)
- Verify: Circuit B (`arch-improvement-product-review`)
- Verify: Circuit C (Orchestrator Diff Gate)
- Modify: `docs/arch-improvement/ledger.md`

- [ ] **Step 1: Circuit A — Semantic Architecture Audit**
  Audit code against AP-010..AP-076. Answer the 4 Mandatory Semantic Probes:
  1. *Dependency Traceability:* Cite file:line where `IAgentEngine` is invoked in `coordinator.ts`.
  2. *Runtime Completeness:* Confirm 0 dangling legacy operational files in `packages/core/src/`.
  3. *Entry Point Wiring:* Cite file:line in `packages/cli/bin/durable-zero.js` calling `@durable-zero/runner`.
  4. *Anti-Gaming Check:* Confirm all classes contain real domain orchestration, not hollow stubs.

- [ ] **Step 2: Circuit B — True Black-Box Product Audit**
  Execute compiled binary `dist/bin/durable-zero.js serve` via child_process/bash:
  - Happy Path Journey: `session/prompt` returns token stream and completed turn.
  - Empty State Journey: `--no-session` boots probe mode cleanly.
  - Error Recovery Journey: Invalid JSON-RPC request returns standard JSON-RPC 2.0 error `-32600`.

- [ ] **Step 3: Circuit C — Orchestrator Diff Gate**
  Lead orchestrator inspects `git diff origin/main..HEAD --stat` and key files (`coordinator.ts`, `pi-durable-engine.ts`, `composition.ts`) to independently certify implementation completeness.

- [ ] **Step 4: Record Cycle 7 in Ledger**
  Update `docs/arch-improvement/ledger.md` with Cycle 7 delivery record and commit.

```bash
git add docs/arch-improvement/ledger.md
git commit -m "docs(ledger): record Cycle 7 completion with Triple-Circuit Gate verification"
```
