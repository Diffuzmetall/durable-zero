import type { PromptAdmissionReceipt, PromptInput, RunnerEvent } from "@durable-zero/contracts";
import type {
	IAgentEngine,
	PromptExecutionOptions,
	SessionStateDTO,
	SessionTranscriptDTO,
	SessionStatsDTO,
} from "./engine.ts";
import type { SubagentPolicyRecord } from "../policy/types.ts";
import { SessionError } from "../errors.ts";

export type { PromptAdmissionReceipt, PromptInput } from "@durable-zero/contracts";
export type { PromptExecutionOptions as PromptOptions } from "./engine.ts";

export interface SessionCoordinatorOptions {
	engine: IAgentEngine;
	sessionDir: string;
}

export class SessionCoordinator {
	private readonly engine: IAgentEngine;
	public readonly sessionDir: string;
	public isStarted = false;
	public isClosed = false;
	private readonly listeners = new Set<(event: unknown) => void>();

	constructor(options: SessionCoordinatorOptions) {
		if (!options.engine) {
			throw new Error("IAgentEngine is required by SessionCoordinator (AP-010, AP-076)");
		}
		if (!options.sessionDir || typeof options.sessionDir !== "string" || options.sessionDir.trim().length === 0) {
			throw new Error("sessionDir must be a non-empty string (AP-010, AP-074)");
		}
		this.engine = options.engine;
		this.sessionDir = options.sessionDir;
	}

	public async start(): Promise<void> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		await this.engine.start(this.sessionDir);
		this.isStarted = true;
	}

	public async prompt(
		input: PromptInput,
		options?: PromptExecutionOptions,
	): Promise<PromptAdmissionReceipt> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError(
				"SESSION_NOT_STARTED",
				"Session is not started. Call start() before submitting prompts",
			);
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

		return await this.engine.submit(input, options);
	}

	public emitEvent(event: unknown): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	public events(callback: (event: any) => void): () => void {
		const unsubEngine = this.engine.events(callback);
		this.listeners.add(callback);
		return () => {
			unsubEngine();
			this.listeners.delete(callback);
		};
	}

	public async abort(conversationId?: string): Promise<void> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError(
				"SESSION_NOT_STARTED",
				"Session is not started. Call start() before aborting",
			);
		}
		await this.engine.abort(conversationId);
		this.emitEvent({
			type: "session/aborted",
			...(conversationId !== undefined ? { conversationId } : {}),
		});
	}

	public async getState(conversationId?: string): Promise<SessionStateDTO> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError("SESSION_NOT_STARTED", "Session is not started");
		}
		return await this.engine.getState(conversationId);
	}

	public async getTranscript(conversationId?: string, limit?: number): Promise<SessionTranscriptDTO> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError("SESSION_NOT_STARTED", "Session is not started");
		}
		return await this.engine.getTranscript(conversationId, limit);
	}

	public async getStats(conversationId?: string): Promise<SessionStatsDTO> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError("SESSION_NOT_STARTED", "Session is not started");
		}
		return await this.engine.getStats(conversationId);
	}

	public async setSubagentPolicy(params: unknown): Promise<{ ok: boolean }> {
		if (this.isClosed) {
			throw new SessionError("SESSION_CLOSED", "Session is closed");
		}
		if (!this.isStarted) {
			throw new SessionError("SESSION_NOT_STARTED", "Session is not started");
		}
		await this.engine.setSubagentPolicy(params as SubagentPolicyRecord);
		return { ok: true };
	}

	public async close(): Promise<void> {
		if (this.isClosed) return;
		this.isClosed = true;
		this.isStarted = false;
		this.listeners.clear();
		await this.engine.close();
	}
}
