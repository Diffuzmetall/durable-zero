import type { PromptAdmissionReceipt, PromptInput, RunnerEvent } from "@durable-zero/contracts";
import type { SubagentPolicyRecord } from "../policy/types.ts";

export interface PromptExecutionOptions {
	readonly deliverAs?: "steer" | "followUp";
	readonly conversationId?: string;
}

export interface ModelSummaryDTO {
	readonly provider: string;
	readonly modelId: string;
	readonly name?: string;
	readonly contextWindow?: number;
}

export interface SessionStateDTO {
	readonly sessionId: string;
	readonly cwd: string;
	readonly activeConversationId: string; // Canonical "1" for root
	readonly activeModel?: { readonly provider: string; readonly modelId: string };
	readonly thinkingLevel?: string;
	readonly models: readonly ModelSummaryDTO[];
	readonly entryCount: number; // total entries in conversation.entries()
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
	readonly contextUsage: {
		readonly tokens: number | null;
		readonly contextWindow: number;
	};
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
