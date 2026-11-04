import type {
	IAgentEngine,
	PromptAdmissionReceipt,
	PromptInput,
	PromptExecutionOptions,
	RunnerEvent,
	SessionStateDTO,
	SessionTranscriptDTO,
	SessionStatsDTO,
	SubagentPolicyRecord,
} from "../../src/session/engine.ts";

export class MockAgentEngine implements IAgentEngine {
	public isStarted = false;
	public isClosed = false;
	public abortedConversations: string[] = [];
	public abortedTasks: number[] = [];
	public submissions: Array<{ input: PromptInput; options?: PromptExecutionOptions }> = [];
	public subagentPolicies: SubagentPolicyRecord[] = [];
	private listeners = new Set<(event: RunnerEvent) => void>();
	public sessionDir: string = "";
	private nextId = 1;

	public async start(sessionDir: string): Promise<void> {
		this.isStarted = true;
		this.sessionDir = sessionDir;
	}

	public async submit(
		input: PromptInput,
		options?: PromptExecutionOptions,
	): Promise<PromptAdmissionReceipt> {
		this.submissions.push({ input, options });
		const id = `sub_${this.nextId++}`;
		return {
			status: "accepted",
			id,
			conversationId: options?.conversationId ?? "1",
		};
	}

	public async abort(conversationId?: string): Promise<void> {
		this.abortedConversations.push(conversationId ?? "1");
	}

	public async abortTask(taskId: number): Promise<void> {
		this.abortedTasks.push(taskId);
	}

	public async compact(_instructions?: string): Promise<void> {}

	public async setSubagentPolicy(record: SubagentPolicyRecord): Promise<void> {
		this.subagentPolicies.push(record);
	}

	public async setModel(_model: { provider: string; modelId: string }): Promise<void> {}

	public async setThinkingLevel(_level: string): Promise<void> {}

	public async getState(conversationId?: string): Promise<SessionStateDTO> {
		return {
			sessionId: "mock-session",
			cwd: process.cwd(),
			activeConversationId: conversationId ?? "1",
			models: [],
			entryCount: this.submissions.length,
		};
	}

	public async getTranscript(
		conversationId?: string,
		_limit?: number,
	): Promise<SessionTranscriptDTO> {
		return {
			conversationId: conversationId ?? "1",
			entries: [],
		};
	}

	public async getStats(_conversationId?: string): Promise<SessionStatsDTO> {
		return {
			contextUsage: {
				tokens: 100,
				contextWindow: 128000,
			},
		};
	}

	public events(listener: (event: RunnerEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public emit(event: RunnerEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	public async close(): Promise<void> {
		this.isClosed = true;
		this.isStarted = false;
		this.listeners.clear();
	}
}
