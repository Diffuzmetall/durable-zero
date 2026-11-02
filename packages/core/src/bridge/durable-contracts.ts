/**
 * Durable SQLite Document Schemas & Type Guards (AP-026, AP-029).
 */

export interface AgentDocument {
	model?: { provider?: string; modelId?: string };
}

export interface UsageDocument {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	totalTokens?: number;
	models?: Record<string, unknown>;
	tools?: Record<string, unknown>;
	cost?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		total?: number;
	};
	[key: string]: unknown;
}

export interface ToolArgumentsDocument {
	[key: string]: unknown;
}

export interface ToolCallBlock {
	type: string;
	id?: string;
	callId?: string;
	arguments?: Record<string, unknown>;
	[key: string]: unknown;
}

export type ConversationEntryRecord = import("@earendil-works/pi-durable").EntryRecord;
export type NestedToolExecutionResult = import("@earendil-works/pi-durable").NestedToolExecutionResult;

export interface ContentBlock {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	arguments?: unknown;
	[key: string]: unknown;
}

export interface ToolSlotRecord {
	callId: string | number;
	output?: unknown;
	details?: unknown;
	[key: string]: unknown;
}

export type MessageChange =
	| { type: "text_start" | "thinking_start" | "toolcall_start"; contentIndex: number; block: ContentBlock }
	| { type: "text_delta" | "thinking_delta"; contentIndex: number; delta: string }
	| { type: "toolcall_delta"; contentIndex: number; path: readonly (string | number)[]; delta: string }
	| { type: "block"; contentIndex: number; block: ContentBlock }
	| { type: "message"; message: unknown };

export type ToolEventCall = {
	toolCallId: string;
	toolName: string;
	taskId?: string | number;
	parentToolCallId?: string;
	parentTaskId?: string | number;
};

export type SnapshotEvent = {
	type: "snapshot";
	entries: readonly ConversationEntryRecord[];
	run?: { inputs: readonly (string | number)[] };
	generation?: {
		attempt: number;
		message?: unknown;
		retry?: { at: number; error: string };
		deferred?: { pollAt: number };
	};
	tools: readonly ToolSlotRecord[];
	nestedTools: readonly ToolSlotRecord[];
	compactions: readonly unknown[];
	compactionFailure?: unknown;
	inbox: readonly unknown[];
	agent: unknown;
	usage: unknown;
};

export type AgentEvent =
	| SnapshotEvent
	| { type: "run_start"; inputs: readonly (string | number)[] }
	| { type: "run_end"; inputs: readonly (string | number)[] }
	| { type: "turn_start" }
	| { type: "turn_end" }
	| { type: "message_start"; message: unknown }
	| { type: "message_update"; usage: unknown; changes: readonly MessageChange[] }
	| { type: "message_end"; entry: ConversationEntryRecord }
	| ({ type: "tool_execution_start"; args: Record<string, unknown> } & ToolEventCall)
	| ({
			type: "tool_execution_update";
			output?: { trimStart?: number; append?: string } | { set: string };
			details?: unknown;
			diagnostics?: readonly unknown[];
	  } & ToolEventCall)
	| ({ type: "tool_execution_end"; entry?: ConversationEntryRecord; result?: NestedToolExecutionResult } & ToolEventCall)
	| { type: "inbox_update"; items: readonly unknown[] }
	| { type: "submission"; record: unknown }
	| { type: "auto_retry_start"; attempt: number; at: number; errorMessage: string }
	| { type: "auto_retry_end"; attempt: number }
	| { type: "deferred_poll"; pollAt: number }
	| { type: "entry_appended"; entry: ConversationEntryRecord }
	| { type: "agent_changed"; agent: unknown }
	| { type: "usage_changed"; usage: unknown }
	| { type: "task_failed"; taskId: string | number; kind: string; message: string }
	| { type: "compaction_start"; taskId: string | number; reason: unknown; blocking: boolean }
	| { type: "compaction_end"; taskId: string | number; reason: unknown; error?: string };

export interface AgentEventStream {
	readonly snapshot: SnapshotEvent;
	start(listener: (events: readonly AgentEvent[], context: unknown) => Promise<void>): void;
	stop(): Promise<unknown>;
}

/** Compatibility shim for watchEvents over native conversation.watch in Pi 1.5.0 */
export async function watchEvents(
	harness: any,
	conversationId: any,
	context: any,
): Promise<AgentEventStream> {
	const conversation = await harness.conversation(conversationId, context);
	if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
	const watch = await conversation.watch(context);
	const initial = watch.value;
	const snapshot: SnapshotEvent = {
		type: "snapshot",
		entries: initial?.entries ?? [],
		...(initial?.docs?.["pi.live"]?.run ? { run: { inputs: initial.docs["pi.live"].run.inputs } } : {}),
		tools: initial?.docs?.["pi.live"]?.tools ?? [],
		nestedTools: initial?.docs?.["pi.live"]?.nestedTools ?? [],
		compactions: initial?.docs?.["pi.live"]?.compactions ?? [],
		inbox: [],
		agent: initial?.docs?.["pi.agent"] ?? {},
		usage: initial?.docs?.["pi.usage"] ?? {},
	};

	return {
		snapshot,
		start(listener) {
			let seenEntriesCount = initial?.entries?.length ?? 0;
			watch.start(async (call: any, ctx: any) => {
				const val = call?.value ?? call;
				if (!val) return;
				const events: AgentEvent[] = [];
				if (val.entries?.length && val.entries.length > seenEntriesCount) {
					for (let i = seenEntriesCount; i < val.entries.length; i++) {
						const entry = val.entries[i];
						const modelMsg = entry?.model?.[0];
						if (modelMsg?.role === "toolResult") {
							let toolName = modelMsg.toolName ?? "tool";
							if (!modelMsg.toolName) {
								for (let j = i - 1; j >= 0; j--) {
									const prevMsg = val.entries[j]?.model?.[0];
									if (prevMsg?.role === "assistant" && Array.isArray(prevMsg.content)) {
										const call = prevMsg.content.find((c: any) => c.type === "toolCall" && c.id === modelMsg.toolCallId);
										if (call?.name) {
											toolName = call.name;
											break;
										}
									}
								}
							}
							events.push({
								type: "tool_execution_end",
								toolCallId: modelMsg.toolCallId ?? String(entry.id),
								toolName,
								entry,
							});
						}
						events.push({ type: "entry_appended", entry });
					}
					seenEntriesCount = val.entries.length;
				}
				if (events.length > 0) {
					await listener(events, ctx);
				}
			});
		},
		async stop() {
			return watch.stop(context);
		},
	};
}

export interface LiveToolSlotRecord {
	id?: string | number;
	callId?: string;
	args?: Record<string, unknown>;
	[key: string]: unknown;
}

export function isAgentDocument(doc: unknown): doc is AgentDocument {
	return typeof doc === "object" && doc !== null;
}

export function isUsageDocument(doc: unknown): doc is UsageDocument {
	return typeof doc === "object" && doc !== null;
}

export function isToolCallBlock(block: unknown): block is ToolCallBlock {
	return typeof block === "object" && block !== null && (block as ToolCallBlock).type === "toolCall";
}

export function isConversationEntryRecord(entry: unknown): entry is ConversationEntryRecord {
	return typeof entry === "object" && entry !== null;
}
