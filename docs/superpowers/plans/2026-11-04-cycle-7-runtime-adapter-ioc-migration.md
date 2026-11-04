# Cycle 7: Sovereign Core & Walking Skeleton Migration (Arch Loop v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a verified end-to-end **Walking Skeleton (Slice 0)** for `durable-zero` using strict Hexagonal Architecture (AP-010) and pure Constructor Dependency Injection (AP-074), migrate the agent runtime into `@durable-zero/adapter-pi-durable` via the Strangler Fig pattern, unify on strict bidirectional JSON-RPC 2.0 over stdio with Host Tool Calling (`host/toolCall`) and probe mode (`--no-session`), and purify `@durable-zero/core` to 100% vendor-agnostic sovereignty.

**Architecture Paradigm (Arch Loop v2):**
- **Slice 0 Walking Skeleton Invariant:** We do NOT do horizontal layer slicing across packages. We first prove a 100% end-to-end vertical tracer bullet (CLI -> Runner -> Coordinator -> PiDurableEngine -> Runtime -> Stdout stream), verified by a true black-box E2E test.
- **Strangler Fig Migration:** We migrate the 45 runtime files incrementally around the living skeleton, keeping the E2E test green on every commit.
- **Assertion Integrity (Anti-Reward Hacking):** No tautological tests that merely check `{ status: "accepted" }`. Tests must assert actual side-effects, dependency invocations, and streamed token deltas.
- **Triple-Circuit Gate (S9):** Verification requires Semantic Arch Traceability (Circuit A), True Black-Box Compiled Binary Execution (Circuit B), and Orchestrator Diff Audit (Circuit C).

**Tech Stack:** Node.js 22+ ESM, `@durable-zero/protocol` (JSON-RPC 2.0 stdio server & client), `@durable-zero/core`, `@durable-zero/adapter-pi-durable` (`@earendil-works/pi-durable` 1.5.0, `@earendil-works/pi-ai`, `@earendil-works/chord`), `@durable-zero/runner`, Zod.

---

## Verification of Auditor Findings (@thread:thr_usuwfbnhx7)

Our cross-source code inspection confirmed all 5 auditor findings with 100% precision:
1. **Agent Loop Missing:** `SessionCoordinator.prompt()` returns a stub `rec_...` without executing the agent loop.
2. **Coordinator Never Started:** `assembleDurableZero()` constructs `SessionCoordinator` but never calls `await coordinator.start()`, causing any `prompt()` to throw `"Session is not started"`.
3. **Host Tool Bridge Missing:** `assembleDurableZero()` does not support client-hosted tools (`AskUserQuestion`, `check_ui`) or `host/toolCall` reverse RPC.
4. **Probe Mode Missing:** Passing `--no-session` crashes because `assembleDurableZero()` unconditionally resolves `.durable/sessions/default` and attempts SQLite locking.
5. **Runtime Graph Disconnected:** `RuntimeGraphSource` is not forwarded over JSON-RPC 2.0 `session/event` notifications.

---

## Multi-Agent Context & Execution Protocol (Arch Loop v2)

Based on recent empirical research (Imbue 2026 SWE-bench Pro overreach studies, Stephens 2026 fresh-eyes replay, Superpowers v6.2.0 resume-based fix loops):
1. **Cold Reviewer:** Reviewers run in isolated context with read-only tools (`Read`, `Grep`, `Glob`, `Bash-read`) to prevent confirmation bias and overreach.
2. **Warm Implementer for Fixes (Resume Loop):** When review reveals issues, resume the original implementer session with the structured review findings instead of spawning fresh workers that lack context.
3. **Scoped Re-Review:** Re-reviewers check only the fix diff and previously flagged issues (`re-review-prompt.md`).
4. **Circuit Breaker:** Max 5 review-fix iterations per task before orchestrator escalation.
5. **Reviewer Micro-Fixes:** Reviewers may apply 1-2 line non-architectural micro-fixes (P3 typos, imports) only when an immediate deterministic test suite confirms the fix. Architectural changes (P0/P1/P2) must be resumed on the implementer.

---

## Tasks Breakdown

### Slice 0: Walking Skeleton & End-to-End Vertical Tracer Bullet (Priority 1)

**Goal:** Connect the entire stack end-to-end (CLI -> Runner -> SessionCoordinator -> PiDurableEngine -> openDurable -> JSON-RPC stdio) without moving files yet, and prove real prompt execution with a true black-box E2E test.

**Files:**
- Create: `packages/core/src/session/engine.ts` (Domain SPI `IAgentEngine`)
- Modify: `packages/core/src/session/coordinator.ts` (Wire `IAgentEngine` via Constructor DI)
- Modify: `packages/core/src/index.ts`
- Create: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` (Facade implementing `IAgentEngine` delegating to existing runtime)
- Modify: `packages/runner/src/composition.ts` (Instantiate `PiDurableEngine`, call `coordinator.start()`)
- Modify: `packages/cli/bin/durable-zero.js` (Point `serve` to `runner/src/main.ts`)
- Test: `packages/core/test/session-coordinator-engine.test.ts`
- Test: `packages/runner/test/e2e-walking-skeleton.test.ts` (Real black-box CLI test)

- [ ] **Step 0.1: Write failing unit test for `IAgentEngine` in `SessionCoordinator`**
  Assert that `coordinator.prompt()` actually delegates to `engine.submit()`, and that `start`, `abort`, `events`, `close` are all delegated.

- [ ] **Step 0.2: Implement `IAgentEngine` interface in `packages/core/src/session/engine.ts`**
  Define `IAgentEngine` with `start`, `submit`, `abort`, `getState`, `events`, `close`.

- [ ] **Step 0.3: Update `SessionCoordinator` to delegate to `IAgentEngine`**
  Replace the stub generator in `coordinator.ts:63` with `return await this.engine.submit(content, options)`. Forward `events` and lifecycle calls.

- [ ] **Step 0.4: Implement `PiDurableEngine` in `@durable-zero/adapter-pi-durable`**
  Create `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` implementing `IAgentEngine` (<120 lines). It wraps the existing runtime session and forwards prompt submissions.

- [ ] **Step 0.5: Wire Composition Root in `@durable-zero/runner`**
  In `packages/runner/src/composition.ts`:
  - Wire `PiDurableEngine` into `SessionCoordinator`.
  - Add `await coordinator.start()` right after initialization.
  - Forward `coordinator.onEvent` to `server.sendNotification("session/event", event)`.

- [ ] **Step 0.6: Wire CLI `bin/durable-zero.js` to run the new runner**
  In `packages/cli/bin/durable-zero.js`, change `serve` to launch `@durable-zero/runner`.

- [ ] **Step 0.7: Write and verify the True Black-Box Walking Skeleton E2E Test**
  Create `packages/runner/test/e2e-walking-skeleton.test.ts`:
  Spawns `bin/durable-zero serve --session <tempDir>` via `child_process.spawn`.
  Sends JSON-RPC 2.0 `session/prompt` request.
  Asserts that JSON-RPC 2.0 response arrives with admission receipt AND `session/event` notifications stream through stdio.

---

### Slice 1: Strangler Fig Migration of Runtime Files to Adapter

**Goal:** With the Walking Skeleton E2E test continuously passing, incrementally move the 45 runtime files from `packages/core/src/` to `packages/adapter-pi-durable/src/engine/`.

**Files:**
- Move: `packages/core/src/runtime.ts` $\to$ `packages/adapter-pi-durable/src/engine/runtime.ts`
- Move: `packages/core/src/subagent-*` $\to$ `packages/adapter-pi-durable/src/engine/subagents/`
- Move: `packages/core/src/bridge/*` $\to$ `packages/adapter-pi-durable/src/engine/bridge/`
- Move: `packages/core/src/runtime-graph-source.ts` $\to$ `packages/adapter-pi-durable/src/engine/runtime-graph-source.ts`
- Move: `packages/core/src/session-*.ts` (SQLite lock/WAL internals) $\to$ `packages/adapter-pi-durable/src/storage/`

- [ ] **Step 1.1: Migrate Subagents & Bridge directories**
  Move `subagent-*` and `bridge/*` to `packages/adapter-pi-durable/src/engine/`. Update relative import paths. Run test suite.

- [ ] **Step 1.2: Migrate Runtime Controller & Runtime Graph**
  Move `runtime.ts`, `runtime-controller.ts`, `runtime-graph-source.ts` to `packages/adapter-pi-durable/src/engine/`. Update imports in `PiDurableEngine`.

- [ ] **Step 1.3: Migrate SQLite lock and WAL storage files**
  Move `session-lock-eviction.ts`, `session-storage.ts`, `session-fork.ts` into `packages/adapter-pi-durable/src/storage/`.

- [ ] **Step 1.4: Verify Walking Skeleton E2E test remains GREEN**
  Run `npm test` across all packages and run `packages/runner/test/e2e-walking-skeleton.test.ts`.

---

### Slice 2: Pure Core Sovereignty & Dependency Decoupling

**Goal:** Strip `@durable-zero/core` of all vendor and adapter dependencies, leaving strictly `@durable-zero/contracts` and `zod`.

**Files:**
- Modify: `packages/core/package.json`
- Remove: `packages/core/src/runner-server.ts` (legacy monolithic runner)
- Verify: `grep -rn "@earendil-works" packages/core/src` returns 0.

- [ ] **Step 2.1: Purge adapter dependencies from `packages/core/package.json`**
  Remove `@durable-zero/adapter-pi-durable`, `@durable-zero/adapter-pi-ai`, `@durable-zero/adapter-codemode`, `@durable-zero/execution` from `packages/core/package.json`.

- [ ] **Step 2.2: Delete legacy `runner-server.ts` from Core**
  Remove `packages/core/src/runner-server.ts`.

- [ ] **Step 2.3: Verify zero boundary leaks in Core**
  Run automated check:
  `grep -rn "@earendil-works" packages/core/src` must produce 0 lines.
  `grep -rn "@durable-zero/adapter-" packages/core/src` must produce 0 lines.

- [ ] **Step 2.4: Run all Core unit tests in pure isolation**
  Run `node --test packages/core/test/*.test.ts`.

---

### Slice 3: Bidirectional Host Tool Bridge & Probe Mode

**Goal:** Implement client-hosted tool delegation (`host/toolCall`) and headless diagnostics probe mode (`--no-session`) in `@durable-zero/runner`.

**Files:**
- Modify: `packages/runner/src/composition.ts`
- Modify: `packages/runner/src/main.ts`
- Test: `packages/runner/test/host-tool-bridge.test.ts`
- Test: `packages/runner/test/probe-mode.test.ts`

- [ ] **Step 3.1: Implement Bidirectional Host Tool Bridge**
  In `packages/runner/src/composition.ts`, wire a tool provider that forwards calls to client tools via `server.request("host/toolCall", { toolName, args })` over stdio JSON-RPC 2.0.

- [ ] **Step 3.2: Implement `--no-session` Probe Mode**
  In `packages/runner/src/composition.ts`: when `options.noSession` is true, bypass SQLite database resolution and session locking. Provide catalog and health check capabilities without touching disk.

- [ ] **Step 3.3: Write integration tests for Host Tool Bridge and Probe Mode**
  Verify reverse RPC tool execution and verify `--no-session` boots in <100ms without creating SQLite files.

---

### Slice 4: Triple-Circuit Verification Gate (S9) & Ledger Update

**Goal:** Run independent architectural and product audits on the final compiled artifacts, followed by personal orchestrator diff inspection.

- [ ] **Step 4.1: Circuit A — Semantic Architectural Audit**
  Audit against AP rules. Answer the 3 mandatory semantic probes:
  1. Port Invocation: Prove exact file:line where `IAgentEngine` is invoked.
  2. Production Wiring: Prove `bin/durable-zero.js` calls `packages/runner`.
  3. Runtime Completeness: Confirm 0 un-migrated runtime files in `core`.

- [ ] **Step 4.2: Circuit B — True Black-Box Product Audit**
  Run compiled binary `dist/bin/durable-zero.js serve` via bash.
  Execute Happy Path (`session/prompt`), Empty State, and Error Recovery journeys.
  Verify actual streamed agent response, not a stub receipt.

- [ ] **Step 4.3: Circuit C — Orchestrator Diff Gate**
  Orchestrator personally audits `git diff origin/main..HEAD --stat` and key implementation files before authorizing merge.

- [ ] **Step 4.4: Update Markdown Ledger**
  Record Cycle 7 outcomes in `docs/arch-improvement/ledger.md`.
