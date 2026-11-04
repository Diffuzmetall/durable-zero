# Cycle 7 — Task 1 / Slice 0 Report: Walking Skeleton & Acyclic Closure Relocation

- **Status**: HOLD_FOR_CHECKPOINT (Quiescent — source writes held)
- **Base Commit**: `c714a2f` (Branch: `cycle-7-runtime-adapter-ioc-migration`)
- **Worker**: Implementer (`thr_9yjb93iwmn`)
- **Reservations Respected**:
  - `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md`: Untouched, owned by plan author.
  - `packages/protocol/...`: Untouched, owned by concurrent protocol worker.
  - `docs/arch-improvement/ledger.md`: Untouched, parent is sole ledger writer.

---

## 1. Summary of Delivered Architecture & Code Changes

### Contracts Layer (`@durable-zero/contracts`)
- **Created**: `packages/contracts/src/receipt.ts`
  - Exported `TextContentPart`, `ImageContentPart`, `PromptContentPart`, `PromptInput`, and `PromptAdmissionReceipt` (`status: "accepted"`, native `id: string` from SubmissionId, `conversationId: "1"`).
- **Modified**: `packages/contracts/src/wire-lifecycle.ts`
  - Added additive `turnCompleteSchema` (`type: "turn_complete"`, `status: "completed" | "aborted" | "error"`, `requestId: string`, `error?: string`) and included in `lifecycleSchemas` per Ruling R3.
- **Modified**: `packages/contracts/src/index.ts`
  - Exported `receipt.ts`.

### Pure Sovereign Core Layer (`@durable-zero/core`)
- **Created**: `packages/core/src/session/engine.ts`
  - Defined pure domain SPI `IAgentEngine` with zero `any` and typed DTOs: `PromptExecutionOptions`, `ModelSummaryDTO`, `SessionStateDTO`, `TranscriptEntryDTO`, `SessionTranscriptDTO`, `SessionStatsDTO`.
- **Modified**: `packages/core/src/session/coordinator.ts`
  - Updated to accept `{ engine?: IAgentEngine, store?: ISessionStore, sessionDir?: string }` via pure dependency injection.
  - Enforced validation for non-empty string or image list (`INVALID_PROMPT`).
  - Delegated `prompt()`, `getState()`, `getTranscript()`, `getStats()`, `abort()`, `setSubagentPolicy()` to `IAgentEngine`.
- **Modified**: `packages/core/src/prompt.ts`
  - Split: retained pure domain `PromptOptions`, `DynamicPromptSections`, `DynamicSectionsHolder`, `ResourceLoaderLike` in Core.
  - Removed all `node:fs` and `@earendil-works/*` imports from Core.
- **Modified**: `packages/core/src/errors.ts`
  - Moved pure domain errors (`SessionError`, `DurableHarnessError`, `DurableStorageError`, `SessionNotFoundError`, etc.) directly into Core.
- **Modified**: `packages/core/src/models/provider.ts`
  - Added pure string model normalization utilities `normalizeModelReference` and `formatModelCliArg`.
- **Modified**: `packages/core/src/policy/resolver.ts` & `packages/core/src/policy/types.ts`
  - Removed `@earendil-works/pi-ai` imports; pure TypeScript types for thinking levels and pure `getSupportedThinkingLevels` logic.
- **Modified**: `packages/core/package.json`
  - Reduced dependencies to strictly `@durable-zero/contracts` and `zod` (`^4.6.7`). Removed all adapter, protocol, execution, and `@earendil-works/*` dependencies.
- **Deleted**:
  - `packages/core/src/engine.ts`
  - `packages/core/src/runner-server.ts`
  - `packages/core/src/jsonl.ts`
  - `packages/core/src/cli-args.ts`
  - 45 relocated runtime files moved to `adapter-pi-durable`.

### Adapter Layer (`@durable-zero/adapter-pi-durable`)
- **Relocated**: Complete runtime closure moved to `packages/adapter-pi-durable/src/engine/` (bridge/, builtin-extensions/, shared/, subagent modules, runtime controllers, graph source).
- **Created**: `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
  - Implements `IAgentEngine` with real `openDurable({ sessionDir, cwd, cli, dependencies })`.
  - Normalizes prompts to native inputs.
  - Correlates native `Submission.wait()` settlement to emit typed `turn_complete` events per R3.
  - Paginates `conv.entries()` across pages to compute authoritative `entryCount` per R2.
  - Reads typed `EntryRecord` entries mapping user/assistant text for `getTranscript()`.
- **Modified**: `packages/adapter-pi-durable/src/engine/runtime-types.ts`
  - Declared `PiRuntimeDependencies` (`executionEnvFactory`, optional `hostBridge`, `modelRuntime`, `nativeProviders`, `resourceLoader`, `settingsManager`, `builtins`, `dynamicSections`, `prompt`).
- **Modified**: `packages/adapter-pi-durable/src/engine/runtime-loader.ts`
  - Consumes `dependencies: PiRuntimeDependencies` with zero singleton dependencies.
- **Modified**: `packages/adapter-pi-durable/src/engine/harness-setup.ts`
  - Removed concrete import and registration of `createCodemodeBuiltinExtension` to eliminate adapter-to-adapter circular dependency per R1.
- **Modified**: `packages/adapter-pi-durable/package.json`
  - Added `@durable-zero/contracts`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-schema`, `quickjs-wasi`, `zod`.
- **Modified**: `packages/adapter-codemode/package.json` & `packages/extension-pi-resource/package.json`
  - Added dependency on `@durable-zero/adapter-pi-durable`.

### Runner Composition Root (`@durable-zero/runner` & CLI)
- **Modified**: `packages/runner/src/composition.ts`
  - Assembles `PiDurableEngine` with `PiRuntimeDependencies` (`LocalNodeExecutionEnv`, `createCodemodeBuiltinExtension()`, etc.).
  - Serves via `StdioJsonRpcServer` with full JSON-RPC 2.0 dispatch for `session/prompt`, `session/abort`, `session/getState`, `session/getTranscript`, `session/getStats`, `session/setSubagentPolicy`.
  - Supports `-32601` (`Method not found`) via `JsonRpcMethodNotFoundError` integration hook.
- **Modified**: `packages/runner/src/main.ts`
  - Exports callable `export async function main(argv: string[] = process.argv.slice(2)): Promise<void>` with single-signal cleanup.
- **Modified**: `packages/runner/src/cli-args.ts`
  - Parses `--session`, `--session-dir`, `--cwd`, `--provider`, `--model`, `--thinking`, `--extension`, `--skills`, `--no-global-extensions`.
- **Modified**: `packages/cli/bin/durable-zero.js`
  - Wires `command === "serve"` to dynamically invoke runner's `main(argv.slice(1))`.
- **Modified**: `scripts/build.mjs`
  - Dropped building legacy `runner-server.ts`.

---

## 2. Test & Build Status

- **Build Result**: `node scripts/build.mjs` -> **PASS** (all 9 packages + runner CLI compile cleanly with sourcemaps).
- **RED Test Artifact**: `/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/cycle7-task-1-red.log`
  - Captures baseline failure of `packages/runner/test/e2e-walking-skeleton.test.ts`.
- **Test Fixtures Created**:
  - `packages/runner/test/fixtures/scripted-provider-extension.ts`: Real coding-agent extension registering `scripted-e2e` echo provider.
  - `packages/runner/test/e2e-walking-skeleton.test.ts`: Black-box subprocess E2E testing prompt admission, streaming text deltas, `turn_complete` terminal settlement, transcript readback, SIGTERM exit 0, and restart with entry persistence.

---

## 3. Quiescence & Checkpoint State

- **Source writes are now completely HELD.**
- No subagents spawned; no commits, branches, or pushes executed.
- Ready for parent to take coherent checkpoint/push of the tree.
