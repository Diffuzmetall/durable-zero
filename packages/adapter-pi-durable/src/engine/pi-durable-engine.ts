import { ROOT_CONVERSATION_ID, type Cursor } from "@earendil-works/pi-durable";
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";
import type {
	IAgentEngine,
	PromptAdmissionReceipt,
	PromptInput,
	PromptExecutionOptions,
	RunnerEvent,
	SessionStateDTO,
	SessionTranscriptDTO,
	TranscriptEntryDTO,
	SessionStatsDTO,
	SubagentPolicyRecord,
} from "@durable-zero/core";
import { SessionError } from "@durable-zero/core";
import { openDurable } from "./runtime.ts";
import {
	runtimeContext,
	type OpenDurableOptions,
	type OpenDurableResult,
	type PiRuntimeDependencies,
} from "./runtime-types.ts";
import { parseConversationId } from "./conversation-id.ts";
import { DurableEventAdapter } from "./bridge/durable-event-adapter.ts";
import { startSubagentWatcher, type SubagentWatcherController } from "./subagent-watcher.ts";
import { RuntimeGraphSource } from "./runtime-graph-source.ts";

export interface PiDurableEngineOptions {
	sessionDir?: string;
	session?: string;
	cwd?: string;
	continueSession?: boolean;
	cli?: OpenDurableOptions["cli"];
	dependencies: PiRuntimeDependencies;
}

export class PiDurableEngine implements IAgentEngine {
	private readonly options: PiDurableEngineOptions;
	private instance: OpenDurableResult | null = null;
	private eventAdapter: DurableEventAdapter;
	private watcher?: SubagentWatcherController;
	private graphSource?: RuntimeGraphSource;
	private unsubscribeView?: () => void;
	private readonly listeners = new Set<(event: RunnerEvent) => void>();
	public sessionDir: string = "";

	constructor(options: PiDurableEngineOptions) {
		this.options = options;
		this.eventAdapter = new DurableEventAdapter((event: RunnerEvent) => {
			this.emitEvent(event);
		});
	}

	private emitEvent(event: RunnerEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	public async start(sessionDir: string): Promise<void> {
		this.sessionDir = sessionDir || this.options.sessionDir || this.options.session || process.cwd();
		this.instance = await openDurable({
			cwd: this.options.cwd ?? process.cwd(),
			sessionDir: this.sessionDir,
			session: this.options.session,
			continueSession: this.options.continueSession,
			cli: this.options.cli,
			dependencies: this.options.dependencies,
			executionEnvFactory: this.options.dependencies?.executionEnvFactory,
		});

		this.watcher = await startSubagentWatcher(
			this.instance.harness,
			this.eventAdapter,
			() => this.instance!.view.current(),
		);

		this.graphSource = new RuntimeGraphSource(
			this.instance.view,
			{ rootConversationId: ROOT_CONVERSATION_ID },
			{ harness: this.instance.harness as any },
		);
		this.graphSource.subscribe((snapshot) => {
			this.emitEvent({
				type: "runtime_graph_snapshot",
				snapshot,
			} as any);
		});

		this.unsubscribeView = this.instance.view.subscribe(() => {
			// view updated
		});
	}

	public async submit(
		input: PromptInput,
		options?: PromptExecutionOptions,
	): Promise<PromptAdmissionReceipt> {
		if (!this.instance) {
			throw new SessionError("SESSION_NOT_STARTED", "Engine not started");
		}

		let nativeInput: string | (TextContent | ImageContent)[];
		if (typeof input === "string") {
			nativeInput = input;
		} else {
			nativeInput = input.map((part) => {
				if (part.type === "text") {
					return { type: "text", text: part.text };
				}
				return { type: "image", data: part.data, mimeType: part.mimeType };
			});
		}

		const whenBusy = options?.deliverAs ?? "followUp";
		const convId = options?.conversationId ? parseConversationId(options.conversationId) : ROOT_CONVERSATION_ID;

		let requestId: string;
		let conversationId: string;

		if (convId === ROOT_CONVERSATION_ID) {
			const receipt = await this.instance.controller.submit(nativeInput, whenBusy);
			requestId = receipt.requestId;
			conversationId = "1";
		} else {
			const conv = await this.instance.harness.conversation(convId, runtimeContext);
			if (!conv) {
				throw new SessionError("CONVERSATION_NOT_FOUND", `Conversation not found: ${convId}`);
			}
			const submission = await conv.submit({ type: "input", content: nativeInput, whenBusy }, runtimeContext);
			requestId = String(submission.id);
			conversationId = String(convId);
		}

		// Correlate native Submission.wait() settlement to emit turn_complete (R3)
		const numId = Number(requestId);
		if (!isNaN(numId)) {
			void this.instance.harness.submission(numId, runtimeContext).then((submission) => {
				if (!submission) return;
				void submission
					.wait(runtimeContext)
					.then((settled) => {
						let status: "completed" | "aborted" | "error" = "completed";
						let errorMsg: string | undefined;
						if (settled.status === "unanswered") {
							if (settled.reason === "aborted") {
								status = "aborted";
							} else {
								status = "error";
								errorMsg = settled.reason;
							}
						}
						this.emitEvent({
							type: "turn_complete",
							status,
							requestId,
							error: errorMsg,
							conversationId: parseConversationId(conversationId),
						} as any);
					})
					.catch((err) => {
						this.emitEvent({
							type: "turn_complete",
							status: "error",
							requestId,
							error: err instanceof Error ? err.message : String(err),
							conversationId: parseConversationId(conversationId),
						} as any);
					});
			}).catch(() => {});
		}

		return {
			status: "accepted",
			id: requestId,
			conversationId,
		};
	}

	public async abort(conversationId?: string): Promise<void> {
		if (!this.instance) return;
		const convId = conversationId ? parseConversationId(conversationId) : ROOT_CONVERSATION_ID;
		if (convId === ROOT_CONVERSATION_ID) {
			await this.instance.controller.abort();
		} else {
			const conv = await this.instance.harness.conversation(convId, runtimeContext);
			await conv?.abort(runtimeContext, { background: true });
		}
	}

	public async abortTask(taskId: number): Promise<void> {
		if (!this.instance) return;
		await this.instance.harness.abortTask(taskId as any, runtimeContext);
	}

	public async compact(instructions?: string): Promise<void> {
		if (!this.instance) return;
		await this.instance.controller.compact(instructions);
	}

	public async setSubagentPolicy(record: SubagentPolicyRecord): Promise<void> {
		if (!this.instance) return;
		await this.instance.subagentPolicyHolder.setRecord(record);
	}

	public async setModel(model: { provider: string; modelId: string }): Promise<void> {
		if (!this.instance) return;
		await this.instance.controller.setModel(model);
	}

	public async setThinkingLevel(level: string): Promise<void> {
		if (!this.instance) return;
		await this.instance.controller.setThinkingLevel(level as any);
	}

	public async getState(conversationId?: string): Promise<SessionStateDTO> {
		if (!this.instance) {
			throw new SessionError("SESSION_NOT_STARTED", "Engine not started");
		}
		const convId = conversationId ? parseConversationId(conversationId) : ROOT_CONVERSATION_ID;
		const conv = await this.instance.harness.conversation(convId, runtimeContext);
		if (!conv) {
			throw new SessionError("CONVERSATION_NOT_FOUND", `Conversation not found: ${convId}`);
		}

		let entryCount = 0;
		let cursor: Cursor | undefined = undefined;
		do {
			const page = await conv.entries({}, 100, cursor, runtimeContext);
			entryCount += page.items.length;
			cursor = page.next;
		} while (cursor !== undefined);

		const viewSnapshot = this.instance.view.current();
		const agentState = (viewSnapshot.conversation.docs["pi.agent"] ?? {}) as any;

		return {
			sessionId: viewSnapshot.session.id,
			cwd: viewSnapshot.session.cwd,
			activeConversationId: String(conv.id),
			activeModel: agentState.model
				? { provider: agentState.model.provider, modelId: agentState.model.modelId }
				: undefined,
			thinkingLevel: agentState.thinkingLevel,
			models: viewSnapshot.models.map((m) => ({
				provider: m.provider,
				modelId: m.modelId,
				name: m.name,
				contextWindow: m.contextWindow,
			})),
			entryCount,
		};
	}

	public async getTranscript(conversationId?: string, limit?: number): Promise<SessionTranscriptDTO> {
		if (!this.instance) {
			throw new SessionError("SESSION_NOT_STARTED", "Engine not started");
		}
		const convId = conversationId ? parseConversationId(conversationId) : ROOT_CONVERSATION_ID;
		const conv = await this.instance.harness.conversation(convId, runtimeContext);
		if (!conv) {
			throw new SessionError("CONVERSATION_NOT_FOUND", `Conversation not found: ${convId}`);
		}

		const page = await conv.entries({ order: "ascending" }, limit ?? 100, undefined, runtimeContext);
		const entries: TranscriptEntryDTO[] = [];

		for (const item of page.items) {
			let role: "user" | "assistant" | "system" | "tool" | undefined;
			let text: string | undefined;

			if (item.kind === "pi.user") {
				role = "user";
				const msg = (item.model as any)?.[0];
				if (msg) {
					text =
						typeof msg.content === "string"
							? msg.content
							: Array.isArray(msg.content)
								? msg.content.map((c: any) => c.text ?? "").join("")
								: undefined;
				}
			} else if (item.kind === "pi.assistant") {
				role = "assistant";
				const msg = (item.model as any)?.[0];
				if (msg) {
					text =
						typeof msg.content === "string"
							? msg.content
							: Array.isArray(msg.content)
								? msg.content.map((c: any) => c.text ?? "").join("")
								: undefined;
				}
			}

			entries.push({
				id: String(item.id),
				conversationId: String(conv.id),
				kind: item.kind,
				role,
				text,
			});
		}

		return {
			conversationId: String(conv.id),
			entries,
		};
	}

	public async getStats(conversationId?: string): Promise<SessionStatsDTO> {
		if (!this.instance) {
			throw new SessionError("SESSION_NOT_STARTED", "Engine not started");
		}
		const convId = conversationId ? parseConversationId(conversationId) : ROOT_CONVERSATION_ID;
		const conv = await this.instance.harness.conversation(convId, runtimeContext);
		if (!conv) {
			throw new SessionError("CONVERSATION_NOT_FOUND", `Conversation not found: ${convId}`);
		}
		const agent = await conv.agent(runtimeContext);
		let contextWindow = 0;
		if (agent.model) {
			const m = this.instance.modelRuntime.getModel(agent.model.provider, agent.model.modelId);
			if (m?.contextWindow) {
				contextWindow = m.contextWindow;
			}
		}
		let tokens: number | null = null;
		try {
			const usage = await this.instance.harness.usage(runtimeContext);
			if (typeof (usage as any)?.totalTokens === "number") {
				tokens = (usage as any).totalTokens;
			}
		} catch {
			// usage not yet recorded
		}
		return {
			contextUsage: {
				tokens,
				contextWindow,
			},
		};
	}

	public events(listener: (event: RunnerEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public async close(): Promise<void> {
		this.listeners.clear();
		this.unsubscribeView?.();
		this.graphSource?.teardown();
		this.watcher?.close();
		if (this.instance) {
			await this.instance.close();
			this.instance = null;
		}
	}
}
