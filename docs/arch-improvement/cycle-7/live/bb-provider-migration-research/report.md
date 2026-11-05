# Architecture & Integration Research: BB Pi Durable Provider → Latest Durable Zero

**Parent thread:** `thr_9yjb93iwmn`  
**Role:** Bounded independent architecture/integration researcher  
**Leased output directory:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/bb-provider-migration-research/`  
**Date:** 2026-11-05  
**Final Status:** Integration **NOT READY** for direct in-place cutover; requires a structured 5-slice migration plan (Slices 0–4).

---

## 1. Executive Summary

This investigation evaluates the exact technical deltas, contract changes, and boundary requirements for `bb-plugin-provider-pi-durable` to consume the refactored, dependency-injected `durable-zero` runtime on branch `cycle-7-runtime-adapter-ioc-migration` (HEAD `1a1a3ac0ac14da6ebccf87aab58ac7c82aad6466`).

### Core Conclusions:
1. **No New Agent Loop Needed:** The existing native Harness loop in `@earendil-works/pi-durable` and the session coordination architecture in `durable-zero` are sound. The integration gaps span five distinct seams: wire transport framing (JSON-RPC 2.0), runner packaging & asset discovery, host-tool reverse RPC continuation (`HostBridge`), admin/session control seams (unmounted `SessionDispatcher`), and readiness/probe contracts. We firmly reject the old audit's proposal to replace the agent loop with an alternative core loop.
2. **Wire Protocol Shift (Custom Framing → Standard JSON-RPC 2.0):** The primary transport incompatibility is between the legacy custom line protocol (`RunnerRpcChannel`, expecting `{ type: "response", id, command, success, data }` and `{ type: "prompt", ... }`) and the modern JSON-RPC 2.0 transport in `durable-zero` (`StdioJsonRpcServer` and `RequestDispatcher`, expecting `{ jsonrpc: "2.0", id, method, params }`).
3. **Runner Packaging & Discovery Realignment:** In the legacy codebase, `runner.js` was packaged inside `packages/core/dist/runner.js`. In the refactored monorepo, the executable CLI is built to `packages/runner/dist/main.js` and library entry to `packages/runner/dist/index.js`. The provider's asset copier (`copy-runner-assets.mjs`) and runner discovery (`runner-lookup.ts`) must be updated to target the new runner package.
4. **Composition Root Seam Closure:** The production runner entrypoint (`packages/runner/src/composition.ts:144-178`) currently mounts an inline 6-method handler rather than the full `createSessionDispatcher` from `packages/runner/src/dispatch/session-dispatcher.ts`, leaving runtime control methods (`session/steer`, `session/compact`, `models/set`, `models/setThinking`, `session/abortTask`) unmounted. Furthermore, `HostBridge` (`packages/runner/src/host/host-bridge.ts:33-85`) is not yet wired into the composition root for model-issued host tool continuations.
5. **Readiness Handshake Alignment:** The provider's `waitForReady()` expects a legacy custom `{ type: "ready" }` frame. Rather than retrofitting legacy frames onto the modern runner, the provider should handshake readiness via standard JSON-RPC (e.g. `session/getState` probe) or an agreed `session/ready` notification.
6. **Persistence Sovereignty:** The provider currently writes directly to `.durable/sessions/<threadId>/control.jsonl` in `server.ts` to abort tasks, and inspects `session.owner.json` directly. These actions must move into first-class RPC commands (`session/abortTask`).

---

## 2. Source Provenance & Pinned Baselines

All conclusions are backed by verified source commits and local paths, recorded in `source-provenance.json`:

| Repository / Asset | Local Path | Branch / Version | Commit / Tag | Status / Dist Notes |
|---|---|---|---|---|
| **durable-zero** | `/Users/vanya/Projects/durable-zero` | `cycle-7-runtime-adapter-ioc-migration` | `1a1a3ac0ac14da6ebccf87aab58ac7c82aad6466` | Production pin `7e12fa59`, test tail `513d3726`. Dist dirty (pre-built assets modified; not rebuilt or reset). |
| **bb-plugin-provider-pi-durable** | `/Users/vanya/Projects/bb-plugin-provider-pi-durable` | `main` | `3d005adbc9ba8f162e1dd682366bd24df1864c70` | Declares `durable-zero#v0.8.1`. Tracked dist committed. Clean git status. |
| **Installed Plugin Cache** | `~/.bb/plugins/cache/git/...` | cache of `bb-plugin-provider-pi-durable` | `3d005adbc9ba8f162e1dd682366bd24df1864c70` | Contains legacy bundled `durable-zero` v0.8.1. |
| **pi upstream** | `/Users/vanya/Projects/pi` | upstream monorepo | `9ee7586a95f5e653ae279c3b8f20938faf3639a1` | Packages: `durable`, `chord`, `ai`, `coding-agent` (1.5.0 baseline). |
| **bb-reference** | `/Users/vanya/Projects/bb-reference` | symlink to `/Applications/bb.app/.../bb-app` | `bb-app@0.48.1` | Desktop BB reference bundle and types. |

*Crucial Distinction:* Installed/cache artifacts reflect v0.8.1 / commit `3d005ad`. Per the provider AGENTS.md invariant, installed or cached filesystem artifacts alone do not establish resident runtime generation: in the absence of direct public process descriptors, the active resident runtime generation is formally recorded as `unverified`. We do not assert that all live sessions use this generation. The defects and incompatibilities detailed below represent **projected fresh-source migration failures** that will occur if the provider is directly linked against the new source without the required migration slices.

---

## 3. Four Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Traceability of Injected Dependencies (AP-074, AP-076)
- **`SessionCoordinator` (`packages/core/src/session/coordinator.ts:25-35`):** Injects `IAgentEngine` and `sessionDir`.
  - *Traceability:* `this.engine.start()` invoked in `start()` (line 44); `this.engine.submit()` invoked in `prompt()` (line 81); `this.engine.abort()` invoked in `abort()` (line 98); `this.engine.getState()` in `getState()` (line 110); `this.engine.close()` in `close()` (line 162). **PASS (Genuine Inversion).**
- **`PiDurableEngine` (`packages/adapter-pi-durable/src/engine/pi-durable-engine.ts:45-75`):** Injects `dependencies: PiRuntimeDependencies` (`settingsManager`, `resourceLoader`, `builtins`, `executionEnvFactory` / `nativeExecutionEnvFactory`).
  - *Traceability:* Passed down to `createDurableHarness` in `harness-setup.ts:60-110`; native execution env invoked when creating new sessions. **PASS.**
- **`HostBridge` (`packages/runner/src/host/host-bridge.ts:33-85`):** Injects `requester: HostRequester`.
  - *Traceability:* Calls `this.requester.request("host/toolCall", ...)` on line 50; `this.requester.request("host/interaction", ...)` on line 80.
  - *Violation:* In `packages/runner/src/composition.ts:144-178`, `HostBridge` is **never instantiated or injected** into `PiDurableEngine` or the resource extensions. **[P1] FND-04: Disconnected Seam / Decorative Component.**

### Probe 2: Runtime Completeness & Split-Brain Detection
- **Runner Asset Split-Brain:**
  - `durable-zero/scripts/build.mjs:42-59` compiles runner to `packages/runner/dist/main.js` and `packages/runner/dist/index.js`.
  - `bb-plugin-provider-pi-durable/scripts/copy-runner-assets.mjs:7-14` searches `node_modules/durable-zero/packages/core/dist/runner.js`.
  - `bb-plugin-provider-pi-durable/src/host/runner-lookup.ts:32-38` searches `node_modules/durable-zero/packages/core/dist/runner.js` and `dist/runner.js`.
  - *Finding:* A split-brain exists between the new package layout (`@durable-zero/runner`) and the provider's discovery logic, which points to the abandoned `core/dist/runner.js`. **[P1] FND-03.**

### Probe 3: Entry Point Wiring (AP-020, AP-075)
- **CLI Entrypoint (`packages/runner/src/main.ts:5-18`):** Invokes `assembleDurableZero(args)`.
- **Composition Root (`packages/runner/src/composition.ts:144-178`):** Instantiates `StdioJsonRpcServer`.
  - *Finding:* Bypasses `createSessionDispatcher` from `packages/runner/src/dispatch/session-dispatcher.ts:25-148`. Mounts an inline handler with only 6 methods. Methods for steering, compacting, model selection, thinking levels, and task cancellation are absent from the live server. **[P1] FND-06.**

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076)
- **Admission Receipt Authenticity:**
  - Re-evaluating claims of "fake `rec_` admission receipts": In `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts:111-195`, `submit()` calls native `controller.submit(nativeInput, whenBusy)` and extracts `receipt.requestId` (the genuine native Pi Durable submission ID). It retains the `submissionHandle` and correlates `wait()` settlement to emit `turn_complete`. No fake admission ID generation was found.
- **`start()` Lifecycle Authenticity:**
  - `SessionCoordinator.start()` is genuinely implemented on line 40 of `coordinator.ts` and called on line 136 of `composition.ts`.
- **Line Budgets:** All audited `.ts` files in `bb-plugin-provider-pi-durable/src/` remain within standard budgets (< 200 lines).

---

## 4. Inventory of Provider Discovery, Assets & Dependencies

### 4.1. Runner Discovery Ladder
The provider discovers the runner executable via `src/host/paths.ts` and `src/host/runner-lookup.ts`:
1. `process.env.PI_DURABLE_RUNNER_PATH` (explicit override).
2. SQLite DB query on BB's plugin database (`findRunnerFromDb`): extracts `root_dir` of the activated plugin and searches candidate filenames.
3. Host artifact derivation (`dataDirFromHostArtifact`): locates plugin installation root from the bundle location.
4. Plugin cache scan (`findRunnerInCache`): traverses `plugins/cache/git` and `plugins/cache/npm`.
5. Local sibling checkout search (`findRunnerBesideSiblings`): developer fallback for `../durable-zero`.

*Required Change:* Update candidate file lists in `runner-lookup.ts` and `copy-runner-assets.mjs` to include:
- `node_modules/durable-zero/packages/runner/dist/main.js`
- `node_modules/durable-zero/packages/runner/dist/index.js`
- `dist/runner/index.js`

### 4.2. Dependency Import Reachability in Provider

A complete static import analysis of `bb-plugin-provider-pi-durable/src/`, `server.ts`, and `app.tsx` revealed:

| Dependency | Declared In | Imported in `src/`? | Actual Usage Context | Verdict / Migration Action |
|---|---|---|---|---|
| `durable-zero/contracts` | `dependencies` | **YES** (14 files) | Wire types, command schemas, diagnostics | Active contract foundation. Keep & update to latest types. |
| `durable-zero/core` | `dependencies` | **YES** (2 files) | `bb-tools-extension.ts`, `thread-fork.ts` | **Broken Seam:** Target exports moved to `runner` & `adapter-pi-durable`. Fix imports. |
| `@earendil-works/pi-durable` | `dependencies` | **YES** (3 files) | `child-turn-guard.ts`, `session-owner.ts`, `subagent-envelope.ts` | Necessary for native types and child envelope. Keep pinned to 1.5.0. |
| `@earendil-works/pi-ai` | `dependencies` | **YES** (3 files) | `catalog.ts`, `resolver.ts`, `types.ts` | Used for in-process model catalog and policy resolution. Keep. |
| `@earendil-works/pi-coding-agent` | `dependencies` | **YES** (1 file) | `extension-ui-context.ts` | System prompt extraction and types. Keep. |
| `@get-bb/plugin-sdk` | `dependencies` | **YES** (15 files) | Host bridge, App UI, RPC contracts | Core BB plugin framework. Strictly keep. |
| `zod` | `dependencies` | **YES** (5 files) | Policy and tool schema validation | Active runtime schema validator. Keep. |
| `react` / `react-dom` | `devDependencies` | **YES** (15 files) | Runtime graph and settings UI | Frontend UI. Keep. |
| `@earendil-works/chord` | `dependencies` | **NO** | Only in test fixtures & diagnostic script | **P3 Maintainability Smell.** Move to devDependencies or remove in Phase 2. |
| `@earendil-works/pi-codemode` | `dependencies` | **NO** | Only in `scripts/diagnose-codemode.ts` | **P3 Maintainability Smell.** Encapsulated inside durable-zero. Remove in Phase 2. |
| `@earendil-works/pi-schema` | `dependencies` | **NO** | Nowhere in repo | **P3 Dead Dependency.** Safe to remove in Phase 2. |
| `proper-lockfile` | `dependencies` | **NO** | Only tested in `package-integrity.test.ts` | **P3 Dead Dependency.** Lockfile handled by durable-zero. Remove in Phase 2. |
| `quickjs-wasi` | `dependencies` | **NO** | Nowhere in repo | **P3 Dead Dependency.** Bundled in durable-zero runner. Remove in Phase 2. |

---

## 5. End-to-End Architecture Trace

```
[Beyond Boundaries IDE]
        │
        │ (Desktop IPC / JSON-RPC via ProviderBridge)
        ▼
[bb-plugin-provider-pi-durable: host/index.ts]
        │
        ├── SessionRegistry (tracks active thread sessions)
        │
        ▼
[PiThreadSession (src/host/session.ts)]
        │
        ├── DeltaTranslator (maps RunnerEvent -> BB thread/delta)
        ├── ToolCallTracker (handles host_tool_call -> BB UI tools)
        ├── SubagentHandler (mirrors child thread events)
        │
        ▼
[RunnerProcess (src/host/runner-process.ts)]
        │
        │ (Stdio: Child Process spawn of durable-zero runner)
        │ CURRENT WIRE: Legacy custom JSON lines ({ type: "prompt", ... })
        │ TARGET WIRE:  JSON-RPC 2.0 ({ jsonrpc: "2.0", method: "session/prompt", ... })
        ▼
[durable-zero: packages/runner/src/main.ts]
        │
        ▼
[assembleDurableZero (packages/runner/src/composition.ts)]
        │
        ├── StdioJsonRpcServer (packages/protocol/src/transport/stdio-server.ts)
        │       │
        │       ▼
        ├── SessionCoordinator (packages/core/src/session/coordinator.ts)
        │       │
        │       ▼
        └── PiDurableEngine (packages/adapter-pi-durable/src/engine/pi-durable-engine.ts)
                │
                ├── ACID SQLite Storage (packages/adapter-pi-durable/src/session-storage.ts)
                ├── QuickJS Codemode (packages/adapter-codemode/src/codemode.ts)
                └── Upstream Pi Runtime (@earendil-works/pi-durable 1.5.0)
```

---

## 6. Detailed Contract Matrix Analysis

Refer to `contract-matrix.json` for full machine-readable details. The primary feature dynamics are:

1. **Readiness Handshake:**
   - *Current Provider:* `PiThreadSession.start()` awaits `waitForReady(readyPromise)`, listening for a message with `kind: "ready"`.
   - *Current Zero:* `StdioJsonRpcServer` starts listening immediately upon instantiation (`server.start()`), emitting no greeting line.
   - *Resolution:* Provider probes readiness immediately via a lightweight `session/getState` request or awaits an explicit agreed `session/ready` notification.
2. **Prompt & Streaming Admission:**
   - *Current Provider:* Sends `{ type: "prompt", id: "req_1", message: "...", streamingBehavior: "followUp" }`.
   - *Current Zero:* Expects `{ jsonrpc: "2.0", id: 1, method: "session/prompt", params: { content: "...", options: { deliverAs: "followUp" } } }`.
   - *Resolution:* Provider formats standard JSON-RPC 2.0 prompt request.
3. **Event Streaming & Block Deltas:**
   - *Current Provider:* Expects raw event JSON objects (`{ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex, delta } }`, `{ type: "message_end", message }`).
   - *Current Zero:* Emits `{ jsonrpc: "2.0", method: "session/event", params: { event: RunnerEvent } }` where `RunnerEvent` adheres to `packages/contracts/src/runner-event.ts` (`message_update` carrying `assistantMessageEvent`, `message_end` carrying `assistantMessageSchema`, `tool_execution_*`, `turn_start`, `turn_end`).
   - *Resolution:* Provider `RunnerRpcChannel` unwraps `params.event` and forwards it to `DeltaTranslator`.
4. **Host Tools Continuation (Reverse RPC):**
   - *Current Provider:* Listens for event `{ type: "host_tool_call", callId, toolName, arguments }` and responds with `{ type: "host_tool_result", callId, result, isError }`.
   - *Current Zero:* Has `HostBridge` (`packages/runner/src/host/host-bridge.ts:33-85`), which issues JSON-RPC requests `{ method: "host/toolCall", params: { toolName, arguments } }` and awaits host responses.
   - *Resolution:* Instantiate owned `HostBridge` in `composition.ts:144+` using `server.request.bind(server)` and inject into dynamic tools extension (no module-level global `activeToolForwarder` state); update provider to handle inbound JSON-RPC requests.
5. **Session Control & Dispatcher Mounting:**
   - Methods `models/set`, `models/setThinking`, `session/steer`, `session/compact`, and `session/abortTask` are implemented in `session-dispatcher.ts` but omitted in `composition.ts:147-177`.
   - *Unsupported Seams:* Note that mounting `createSessionDispatcher` does NOT implement `binding/register`, `binding/list`, `session/fork`, or `tools/register` (which explicitly throw `UnsupportedCapabilityError`). Provider must handle binding and fork via dedicated ports/adapter utilities rather than assuming dispatcher RPC support.
   - *Resolution:* Mount `createSessionDispatcher({ coordinator, engine })` in `composition.ts:144-178` to activate implemented control methods.
6. **Subagent Policy Synchronization:**
   - `composition.ts:166-168` passes `params` directly to `coordinator.setSubagentPolicy(params)`. Downstream `subagent-policy-state.ts:30` runs `subagentPolicyRecordSchema.parse(record)`.
   - *Resolution:* `createSessionDispatcher` unwraps `params.policyRecord ?? params.record ?? params`, ensuring backwards-compatible parameter normalization.
7. **Thread Forking:**
   - Provider imports `forkSessionDatabase` from `"durable-zero/core"`. In the new architecture, it is already exported from `"durable-zero/adapter-pi-durable"` (`packages/adapter-pi-durable/src/index.ts:5`).
   - *Resolution:* Update provider import path to `"durable-zero/adapter-pi-durable"`. `@durable-zero/contracts` remains pure schemas/types and must NOT export concrete database logic.

---

## 7. Boundary Purity & Storage Sovereignty

### 7.1. Persistence Leaks Across the Boundary
1. **Out-of-Band Control File Manipulation:**
   - In `bb-plugin-provider-pi-durable/server.ts:50-65`, `task_abort` resolves the session directory, checks for `session.owner.json`, and appends an abort command to `control.jsonl` on disk.
   - *Violation of AP-021 & AP-032:* The host server bypasses the runner's communication channel and directly alters files in the private session workspace. If durable-zero runs in a container or remote machine, this fails.
   - *Fix:* Replace disk writes with RPC invocation `session/abortTask`.
2. **Direct SQLite Database Manipulation:**
   - In `src/host/thread-fork.ts:15-45`, the host code validates and directly invokes SQLite copying on `session.sqlite`.
   - *Target State:* Route session forking through the runner's `session/fork` RPC method or a strictly typed storage utility that respects SQLite WAL checkpoints.

---

## 8. Headless / Backendless Zero Toolkit Evaluation

The user intent envisions Zero as a modular, headless/backendless toolkit where components can be swapped independently:
- **Codemode Adapter (`@durable-zero/adapter-codemode`):** Successfully decoupled. Uses QuickJS WASI sandbox without depending on host UI.
- **Model Adapter (`@durable-zero/adapter-pi-ai`):** Wraps Pi AI models cleanly behind `IModelProvider`. However, no direct non-Pi model provider (e.g. direct OpenAI/Anthropic SDK adapter) exists yet in source.
- **Execution Environment (`@durable-zero/execution`):** The `IExecutionEnvironment` SPI is defined, and `NodeExecutionEnv` from `@earendil-works/pi-durable` is adapted via `CoreExecutionEnvAdapter`.
- **Remaining Coupling in Runner:**
  - `packages/runner/src/composition.ts:32-47` hardcodes `SettingsManager`, `DefaultResourceLoader`, `createMcpExtension`, and `getAgentDir` from `@earendil-works/pi-coding-agent`.
  - For true generic toolkit reuse, `assembleDurableZero` should accept an optional `IResourceLoader` and `IConfigProvider` via its options interface, defaulting to Pi's implementations when omitted.

---

## 9. Migration Roadmap (Five Bounded Slices)

See `migration-slices.md` for full implementation details:

- **Slice 0: Source Seams & Asset Discovery Repair** (P1)
  - Verify `durable-zero/scripts/build.mjs` outputs `packages/runner/dist/main.js` and `packages/runner/dist/index.js`.
  - Pure contracts invariant: do NOT export concrete database code from pure contracts. `forkSessionDatabase` is ALREADY exported from `@durable-zero/adapter-pi-durable`.
  - Update `bb-plugin-provider-pi-durable/src/host/thread-fork.ts` import from `"durable-zero/core"` to `"durable-zero/adapter-pi-durable"`.
  - Update `copy-runner-assets.mjs` and `runner-lookup.ts` in provider to discover `packages/runner/dist/main.js`.
- **Slice 1: Runner Composition Root & Dispatcher Mounting in durable-zero** (P1)
  - Mount `createSessionDispatcher` in `packages/runner/src/composition.ts:144-178` (activates `session/steer`, `session/compact`, `session/abortTask`, `models/set`, `models/setThinking`, and parameter unwrapping for `subagent/setPolicy`).
  - Account for intentionally unsupported seams: `binding/register`, `binding/list`, `session/fork`, and `tools/register` throw `UnsupportedCapabilityError`.
  - Instantiate and wire owned `HostBridge` (`packages/runner/src/host/host-bridge.ts:33-85`) in `assembleDurableZero` using `server.request.bind(server)`. Pass to dynamic tools extension (no module-level global state).
  - Use standard `session/getState` JSON-RPC request for bounded readiness probing (optional agreed notification).
- **Slice 2: Provider Transport Migration to JSON-RPC 2.0** (P1)
  - Refactor `RunnerRpcChannel` and `RunnerProcess` to send and receive JSON-RPC 2.0.
  - Probe readiness via `session/getState` in `PiThreadSession.start()`.
  - Update `PiThreadSession` method calls (`prompt`, `steer`, `compact`, `setModel`, `setThinkingLevel`, `getStats`).
  - Unwrap `session/event` notifications in `DeltaTranslator`, consuming real event schemas (`message_update` with `assistantMessageEvent.text_delta`, `message_end`).
  - Handle inbound `host/toolCall` and `host/interaction` requests over stdio.
- **Slice 3: Boundary Purity & Storage Decoupling** (P2)
  - Replace `control.jsonl` writes in `server.ts` with `session/abortTask` RPC.
  - Triage dead dependencies in provider `package.json` (`chord`, `pi-codemode`, `proper-lockfile`, `quickjs-wasi`) and update integrity test assertions.
- **Slice 4: Hermetic Acceptance & E2E Validation** (P0 Verification)
  - Execute end-to-end walking skeleton test using synthetic model fixture: boot -> prompt -> streaming (`message_update` text_delta) -> reverse tool call (`host/toolCall`) -> abort (`session/abortTask`) -> clean exit.

---

## 10. Hermetic Acceptance Plan & Guardrails

To prevent flakiness and enforce strict architectural isolation:
1. **No External Network / Live LLMs:** Tests must use the existing hermetic scripted provider fixture (`packages/runner/test/fixtures/scripted-provider-extension.ts`).
2. **Bounded Execution Deadlines:**
   - Synchronous unit tests: ≤ 5 seconds.
   - Component & RPC tests: ≤ 30 seconds.
   - Full end-to-end runner subprocess tests: hard bound ≤ 120 seconds with unconditional process cleanup (`SIGTERM` followed by `SIGKILL` after 4s).
3. **No Database Contamination:** Every test run must use an isolated temporary directory via `fs.mkdtemp()`. Tests must never touch `~/.bb/` or `~/Projects/.durable/`.
4. **Anti-Hang Invariants:** Stdio streams must be closed explicitly on test teardown; no `process.exit()` force-quits to disguise hanging timers or unclosed sockets.

---

## 11. Architecture Verification & Evaluation

*Scope Discipline:* This is an architecture and integration research evaluation, NOT an implementation sign-off. Inspected source facts, proposed design choices, and unexecuted live execution gates are strictly distinguished below.

### Inspected Source Facts (Verified Invariants in Current Source):
- **AP-010 / AP-020 (Modular Architecture & Clean Composition Root):** `SessionCoordinator` (`packages/core/src/session/coordinator.ts:25-35`) injects `IAgentEngine` cleanly via constructor.
- **AP-012 (Fail-Fast & Explicit Error Contracts):** Protocol layer enforces typed JSON-RPC errors (`JsonRpcMethodNotFoundError`, `JsonRpcInvalidParamsError`, `SessionError`).
- **AP-013 (Data Integrity):** SQLite ACID transaction management and WAL checkpointing are retained in `@durable-zero/adapter-pi-durable`.
- **AP-019 (Modularity & Line Budgets):** All examined source files in `src/` remain modular (< 200 lines).
- **AP-074 / AP-076 (Dependency Traceability & Anti-Gaming):** `SessionCoordinator.start()` and `PiDurableEngine.submit()` are genuine, active execution paths returning native submission receipts; no fake admission IDs or hollow stubs exist.

### Evaluated Design Choices for Proposed Plan:
- **No Concrete DB Leaks into Pure Contracts (AP-010, AP-026):** `forkSessionDatabase` remains in `adapter-pi-durable`; `@durable-zero/contracts` contains only pure schemas and interfaces.
- **No Global Module State for Reverse RPC (AP-074, AP-076):** Rejects restoring global `activeToolForwarder` / `setHostToolForwarder`. Mandates an owned `HostBridge` instance injected through the composition root.
- **Realistic Dispatcher Seam Scope (AP-075):** Acknowledges that mounting `createSessionDispatcher` leaves `binding/register`, `binding/list`, `session/fork`, and `tools/register` as typed `UnsupportedCapabilityError`, and plans explicit handling accordingly.
- **No Invented Readiness SLAs (AP-059):** Relies on standard public `session/getState` JSON-RPC probing rather than inventing mandatory frames or unverified 500ms bounds.

### Unexecuted Verification Gates (Pending Implementation):
- Live JSON-RPC 2.0 communication between provider host and runner process.
- Bidirectional stdio reverse-tool continuation roundtrip (`host/toolCall`).
- End-to-end streaming delta translation against refactored runner events.

VERDICT: INTEGRATION NOT READY (BLOCKED ON SLICES 0–2 IMPLEMENTATION)
