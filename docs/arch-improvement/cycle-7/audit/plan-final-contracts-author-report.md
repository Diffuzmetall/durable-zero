# Plan Final Contracts Author Report — Cycle 7 Candidate 76145d4

- **Candidate SHA:** `76145d4d7841fdd878d2da7557c084efa74a98d5`
- **Branch:** `cycle-7-runtime-adapter-ioc-migration`
- **Author Thread:** Current plan author thread on provider `pi`
- **Parent / Orchestrator:** `thr_9yjb93iwmn`
- **Current Status:** Candidate DRAFT updated and committed. Task 1 / Slice 0 implementation authorized for separate worker `thr_tcbhyv8p4r` under ledger rulings `c714a2f`. Plan author is in HOLD state; no global S7/S9 PASS claimed.

---

## 1. Dispositions of the Four Load-Bearing Contract Issues

### Issue 1: Real Dependency Injection Through `openDurable` & `runtime-loader`
- **Plan Locations:** Canonical Design Amendment §4; Task 1 Step 4–6; Inventory items 17–21, 54, 56.
- **Contract & Signatures:**
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

  export interface OpenDurableOptions {
    readonly cwd?: string;
    readonly continueSession?: boolean;
    readonly session?: string;
    readonly sessionDir?: string;
    readonly cli?: OpenDurableCliOptions;
    readonly dependencies: PiRuntimeDependencies;
    readonly beforeResume?: (harness: Harness) => Promise<void>;
  }
  ```
- **Forwarding Path & Resource Ownership:**
  - `Composition Root` (`packages/runner/src/composition.ts`) creates concrete infrastructure adapters (`LocalNodeExecutionEnv`, `HostBridge`, `createCodemodeBuiltinExtension()`, `createPiResourceExtension()`) and bundles them into `PiRuntimeDependencies`.
  - `PiDurableEngine` passes `dependencies` into `openDurable({ sessionDir, cwd, cli, dependencies })`.
  - `loadHarnessEnvironment` consumes injected `modelRuntime` (or `ModelRuntime.create()`), registers any `nativeProviders`, consumes `settingsManager`, `resourceLoader`, `codingRegistry`, and passes them into `Harness.open(storage, { models, registry, settings, env, onReport }, runtimeContext)`.
  - Single teardown path: `closeRuntimeResources` cleans once without double-disposing externally injected instances.
  - Distinguishes model catalogue/resolver `IModelProvider` (domain SPI in `core/src/models/provider.ts`) from native `Models` / `ModelRuntime` interface consumed by `HarnessOptions.models`.
  - Extension DAG is strictly acyclic: `contracts` $\to$ `core` $\to$ `adapter-pi-durable` $\to$ `adapter-codemode` $\to$ `runner` $\to$ `cli`.

### Issue 2: Typed Pure Domain Ports & DTOs (Zero `any`)
- **Plan Locations:** Canonical Design Amendment §4; Task 1 Step 4.
- **Contract & Signatures:**
  - `PromptAdmissionReceipt` lives in `packages/contracts/src/receipt.ts` and is exported from `@durable-zero/contracts`:
    ```typescript
    export interface PromptAdmissionReceipt {
      readonly status: "accepted";
      readonly id: string; // Native SubmissionId from Harness
      readonly conversationId: string; // Canonical "1" for root
      readonly sequence?: number;
    }
    ```
  - Domain SPI `IAgentEngine` in `packages/core/src/session/engine.ts`:
    ```typescript
    export interface TextContentPart { readonly type: "text"; readonly text: string; }
    export interface ImageContentPart { readonly type: "image"; readonly data: string; readonly mimeType: string; }
    export type PromptContentPart = TextContentPart | ImageContentPart;
    export type PromptInput = string | readonly PromptContentPart[];

    export interface PromptExecutionOptions {
      readonly deliverAs?: "steer" | "followUp";
      readonly conversationId?: string;
    }

    export interface SessionStateDTO {
      readonly sessionId: string;
      readonly cwd: string;
      readonly activeConversationId: string; // Canonical "1" for root
      readonly activeModel?: { readonly provider: string; readonly modelId: string };
      readonly thinkingLevel?: string;
      readonly models: readonly ModelSummaryDTO[];
      readonly entryCount: number; // total paginated entries in conversation.entries()
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
      readonly contextUsage: { readonly tokens: number | null; readonly contextWindow: number; };
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
  - Zero `any` in public proposed engine and coordinator interfaces.

### Issue 3: Images / Target / Cancel Semantics & Native Identity
- **Plan Locations:** Review Focus #1, #3; Task 1 Step 1, 4, 5; Task 4 Step 4.
- **Contract & Assertions:**
  - **Native Root Identity:** `ROOT_CONVERSATION_ID = 1` in native SDK. Exposed as canonical wire string `"1"` across all public DTOs and responses; no unsupported `"root"` string alias.
  - **Prompt Validation:** Accepts non-empty string, pure image list (`ImageContentPart[]`), or mixed text+images. Rejects empty string and empty array with `SessionError("INVALID_PROMPT")`.
  - **Target Resolution:** Root (`!conversationId || conversationId === "1"`) dispatches via `controller.submit(nativeInput, deliverAs)`. Child (`conversationId !== "1"`) dispatches via `harness.conversation(conversationId).submit({ type: "input", content: nativeInput, whenBusy })`.
  - **Unified Vocabulary:** Unambiguous `session/abort` consistently (replaces `session/cancel`).
  - **Abort Target:** Root aborts via `controller.abort()`; child aborts via `conv.abort(runtimeContext, { background: true })`.
  - **Control Channel:** `control.jsonl` fs-watched channel is permanently removed; superseded by standard JSON-RPC `session/abortTask`.

### Issue 4: Deterministic External Model Seam & Restart Readback
- **Plan Locations:** Canonical Design Amendment §4; Task 1 Step 1, 5, 6; Task 2 Step 1; Ruling R5.
- **Contract & Assertions:**
  - **Production Purity:** Production `composition.ts` does NOT import test fixtures or branch on `mock` providers.
  - **Public Extension Route:** Test provider loads via standard CLI argument `--extension packages/runner/test/fixtures/scripted-provider-extension.ts --provider scripted-e2e --model echo`.
  - **Seam Implementation:** Scripted provider extension registers provider via `api.registerProvider(provider)`. Provider implements `@earendil-works/pi-ai` `Provider` interface (`getModels()`, `streamSimple()`) using `createAssistantMessageEventStream` from `@earendil-works/pi-ai/utils/event-stream`.
  - **Streaming Events:** Uses canonical `RunnerEvent` structure (`message_update.assistantMessageEvent.delta`). Additive `turn_complete` is correlated to native `Submission.wait()` settlement.
  - **Restart Readback:** Paged `conversation.entries({}, limit, cursor, context)` returns native `EntryRecord`s. Readback before and after restart compares stable `userEntryId`, `assistantEntryId`, and identical user and assistant text. Total `entryCount` paginates all entries.

---

## 2. Upstream Source Citations

- `@earendil-works/pi-durable/dist/types.js:2`: `export const ROOT_CONVERSATION_ID = 1;`
- `@earendil-works/pi-durable/dist/harness/types.d.ts:614-660`: `HarnessOptions.models: Models | (() => Models)`, `Harness.open(storage, options, context)`.
- `@earendil-works/pi-durable/dist/harness/types.d.ts:744-810`: `Conversation.submit(submission, context): Promise<Submission>`, `Conversation.entries(query, limit, cursor, context): Promise<Page<EntryRecord, Cursor>>`, `Conversation.abort(context, options)`.
- `@earendil-works/pi-ai/dist/models.d.ts`: `interface Provider<TApi>` with `getModels()`, `stream()`, `streamSimple()`.
- `@earendil-works/pi-ai/dist/utils/event-stream.d.ts`: `createAssistantMessageEventStream()`.
- `@earendil-works/pi-coding-agent/dist/core/model-runtime.d.ts`: `ModelRuntime` implements `Models`, provides `registerNativeProvider(provider)`.
- `packages/core/src/runtime-loader.ts:54-61, 75-95`: Extension runtime loads CLI extension paths and consumes `pendingNativeProviderRegistrations` into `ModelRuntime`.

---

## 3. Validation Performed

1. `git diff --cached --check`: Zero trailing whitespace, zero conflict markers.
2. `git diff --cached --stat`: Only `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md` modified (277 insertions, 76 deletions).
3. Documentation-only commit `76145d4` on branch `cycle-7-runtime-adapter-ioc-migration`.
4. Worktree status: Clean worktree, no unstaged or rogue file edits.

---

## 4. Status of Tasks & Residual Risks

- **Task 1 (Slice 0):** Frozen architecture and contracts; S7 selected-slice gate passed under parent rulings R1–R7; execution authorized in parallel subthread `thr_tcbhyv8p4r`.
- **Tasks 2–6:**
  - Task 2 (Host Bridge): Scope coherent; pending Task 1 completion.
  - Task 3 (Probe Mode): Scope coherent; pending Task 1 completion.
  - Task 4 (Conformance & Capability Dispatch): Scope coherent; contracts schemas ready for full method dispatch.
  - Task 5 (Pure Core Decoupling): AST boundary checks and package.json cleanup ready.
  - Task 6 (Triple-Circuit S9 Gate): Pending full cycle execution; no global S7/S9 PASS claimed.
- **Residual Risks:**
  - Implementation of Task 1 must strictly follow R1–R7 (especially canonical `message_update.assistantMessageEvent.delta` format and paginated `conversation.entries()` query).
  - No public git push performed (per instructions).
