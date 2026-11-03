import type { ISessionStore } from "./store.ts";
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
	modelProvider?: IModelProvider;
	executionEnv?: IExecutionEnvironment;
	resourceLoader?: IResourceLoader;
}

export class SessionCoordinator {
	private readonly store: ISessionStore;
	private readonly modelProvider?: IModelProvider;
	private readonly executionEnv?: IExecutionEnvironment;
	private readonly resourceLoader?: IResourceLoader;
	private isStarted = false;
	private isClosed = false;
	public isAborted = false;
	private readonly listeners = new Set<(event: unknown) => void>();

	constructor(options: SessionCoordinatorOptions) {
		this.store = options.store;
		this.modelProvider = options.modelProvider;
		this.executionEnv = options.executionEnv;
		this.resourceLoader = options.resourceLoader;
	}

	public async start(): Promise<void> {
		await this.store.acquireLock();
		this.isStarted = true;
	}

	public async prompt(content: string, _options?: PromptOptions): Promise<PromptAdmissionReceipt> {
		if (this.isClosed) {
			throw new Error("Session is closed");
		}
		if (this.isAborted) {
			throw new Error("Session is aborted");
		}
		if (!this.isStarted) {
			throw new Error("Session is not started. Call start() before submitting prompts");
		}
		if (typeof content !== "string" || content.trim().length === 0) {
			throw new Error("Prompt content must be a non-empty string");
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
		return () => {
			this.listeners.delete(callback);
		};
	}

	public async abort(): Promise<void> {
		this.isAborted = true;
		this.emitEvent({ type: "session/aborted" });
	}

	public getState(): Record<string, unknown> {
		return {
			isStarted: this.isStarted,
			isAborted: this.isAborted,
			isClosed: this.isClosed,
			sessionDir: this.store.sessionDir,
		};
	}

	public async setSubagentPolicy(params: unknown): Promise<{ ok: boolean }> {
		await this.store.saveDocument("subagents", "policy_ack", params);
		return { ok: true };
	}

	public async close(): Promise<void> {
		this.isClosed = true;
		this.isStarted = false;
		this.listeners.clear();
		await this.store.releaseLock();
		await this.store.close();
	}
}
