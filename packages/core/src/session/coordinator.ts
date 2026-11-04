import type { PromptAdmissionReceipt, PromptInput, RunnerEvent } from "@durable-zero/contracts";
import type {
	IAgentEngine,
	PromptExecutionOptions,
	SessionStateDTO,
	SessionTranscriptDTO,
	SessionStatsDTO,
} from "./engine.ts";
import type { ISessionStore } from "./store.ts";
import type { IModelProvider } from "../models/provider.ts";
import type { IExecutionEnvironment } from "../tools/execution-env.ts";
import type { SubagentPolicyRecord } from "../policy/types.ts";
import { SessionError } from "../errors.ts";

export type { PromptAdmissionReceipt, PromptInput } from "@durable-zero/contracts";
export type { PromptExecutionOptions as PromptOptions } from "./engine.ts";

export interface IResourceLoader {
	getSystemPrompt?(): Promise<string> | string;
	getContextFiles?(): Array<{ path: string; content: string }>;
	getSkills?(): Array<{ name: string; description: string }>;
}

export interface SessionCoordinatorOptions {
	engine?: IAgentEngine;
	store?: ISessionStore;
	sessionDir?: string;
	modelProvider?: IModelProvider;
	executionEnv?: IExecutionEnvironment;
	resourceLoader?: IResourceLoader;
}

export class SessionCoordinator {
	private readonly engine?: IAgentEngine;
	private readonly store?: ISessionStore;
	public readonly sessionDir?: string;
	private readonly modelProvider?: IModelProvider;
	private readonly executionEnv?: IExecutionEnvironment;
	private readonly resourceLoader?: IResourceLoader;
	private isStarted = false;
	private isClosed = false;
	public isAborted = false;
	private readonly listeners = new Set<(event: unknown) => void>();

	constructor(options: SessionCoordinatorOptions) {
		this.engine = options.engine;
		this.store = options.store;
		this.sessionDir = options.sessionDir;
		this.modelProvider = options.modelProvider;
		this.executionEnv = options.executionEnv;
		this.resourceLoader = options.resourceLoader;
	}

	public async start(): Promise<void> {
		if (this.engine) {
			await this.engine.start(this.sessionDir ?? "");
		} else if (this.store) {
			await this.store.acquireLock();
		}
		this.isStarted = true;
	}

	public async prompt(
		input: PromptInput,
		options?: PromptExecutionOptions,
	): Promise<PromptAdmissionReceipt> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (this.isAborted) {
			throw new SessionError("SESSION_ABORTED", "Session is aborted");
		}
		if (!this.isStarted) {
			throw new SessionError("SESSION_NOT_STARTED", "Session is not started. Call start() before submitting prompts");
		}

		if (typeof input === "string") {
			if (input.trim().length === 0) {
				throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
			}
		} else if (Array.isArray(input)) {
			if (input.length === 0) {
				throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
			}
			const hasValidPart = input.some((p) => {
				if (!p || typeof p !== "object") return false;
				if (p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0) return true;
				if (p.type === "image" && typeof p.data === "string" && typeof p.mimeType === "string") return true;
				return false;
			});
			if (!hasValidPart) {
				throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
			}
		} else {
			throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
		}

		if (this.engine) {
			return await this.engine.submit(input, options);
		}

		const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		return { status: "accepted", id, conversationId: "1" };
	}

	public emitEvent(event: unknown): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	public events(callback: (event: any) => void): () => void {
		let unsubEngine: (() => void) | undefined;
		if (this.engine) {
			unsubEngine = this.engine.events(callback);
		}
		this.listeners.add(callback);
		return () => {
			unsubEngine?.();
			this.listeners.delete(callback);
		};
	}

	public async abort(conversationId?: string): Promise<void> {
		this.isAborted = true;
		if (this.engine) {
			await this.engine.abort(conversationId);
		}
		this.emitEvent({ type: "session/aborted" });
	}

	public async getState(conversationId?: string): Promise<SessionStateDTO | Record<string, unknown>> {
		if (this.engine) {
			return await this.engine.getState(conversationId);
		}
		return {
			isStarted: this.isStarted,
			isAborted: this.isAborted,
			isClosed: this.isClosed,
			sessionDir: this.sessionDir ?? this.store?.sessionDir,
		};
	}

	public async getTranscript(conversationId?: string, limit?: number): Promise<SessionTranscriptDTO> {
		if (this.engine) {
			return await this.engine.getTranscript(conversationId, limit);
		}
		return {
			conversationId: conversationId ?? "1",
			entries: [],
		};
	}

	public async getStats(conversationId?: string): Promise<SessionStatsDTO> {
		if (this.engine) {
			return await this.engine.getStats(conversationId);
		}
		return {
			contextUsage: {
				tokens: null,
				contextWindow: 128000,
			},
		};
	}

	public async setSubagentPolicy(params: unknown): Promise<{ ok: boolean }> {
		if (this.engine) {
			await this.engine.setSubagentPolicy(params as SubagentPolicyRecord);
			return { ok: true };
		}
		if (this.store) {
			await this.store.saveDocument("subagents", "policy_ack", params);
		}
		return { ok: true };
	}

	public async close(): Promise<void> {
		this.isClosed = true;
		this.isStarted = false;
		this.listeners.clear();
		if (this.engine) {
			await this.engine.close();
		}
		if (this.store) {
			await this.store.releaseLock();
			await this.store.close();
		}
	}
}
