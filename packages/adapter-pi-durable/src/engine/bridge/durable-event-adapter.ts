import type { AgentEvent, SnapshotEvent } from "./durable-contracts.ts";
import type { DurableView } from "../runtime-types.ts";
import type { RunnerEvent, AssistantMessage, AssistantMessageUsage } from "./contracts.ts";
import { resolveTurnSummary, findSubmissionFault } from "./turn-summary.ts";
import { ToolEventProjector } from "./tool-result-extractor.ts";
import { DurableChildEventAdapter } from "./durable-child-event-adapter.ts";

export { resolveToolCallArgs } from "./tool-args-resolver.ts";

interface RawAssistantEntryMessage {
	role?: string;
	content?: AssistantMessage["content"];
	stopReason?: AssistantMessage["stopReason"];
	usage?: AssistantMessageUsage;
	[key: string]: unknown;
}

/**
 * Transforms native @earendil-works/pi-durable AgentEvents into canonical RunnerEvent stream.
 * Relies directly on the first-party transactional watchEvents stream.
 */
export class DurableEventAdapter {
	private readonly output: (event: RunnerEvent) => void;
	private readonly resolveContextWindow?: (provider?: string, modelId?: string) => number | undefined;
	private readonly submissions = new Map<string | number, { status: string; reason?: string; detail?: string }>();
	private readonly activeToolNames = new Map<string | number, string>();
	private readonly toolProjector = new ToolEventProjector();
	private lastTaskError?: string;
	private lastAssistantMessage?: AssistantMessage;
	private lastCheckpointId?: string;
	private readonly contentBlocks = new Map<number, { type: "text" | "thinking"; text?: string; thinking?: string }>();
	private activeThinkingIndex?: number;

	constructor(output: (event: RunnerEvent) => void, resolveContextWindow?: (p?: string, m?: string) => number | undefined) {
		this.output = output;
		this.resolveContextWindow = resolveContextWindow;
	}

	private closeThinkingIfNeeded(): void {
		if (this.activeThinkingIndex === undefined) return;
		const idx = this.activeThinkingIndex;
		this.activeThinkingIndex = undefined;
		const content = this.contentBlocks.get(idx)?.thinking ?? "";
		this.output({ type: "message_update", assistantMessageEvent: { type: "thinking_end", contentIndex: idx, content } });
	}

	private resolveParentRef(parentToolCallId?: string | number): string | undefined {
		if (parentToolCallId === undefined) return undefined;
		const name = this.activeToolNames.get(parentToolCallId);
		if (name === "codemode" || (name !== undefined && name !== "subagent" && name !== "agent_spawn" && name !== "agent_spawn_graph")) return undefined;
		return String(parentToolCallId);
	}

	public createChildAdapter(parentCallId: string, conversationId?: string | number): DurableChildEventAdapter {
		return new DurableChildEventAdapter(this.output, parentCallId, conversationId);
	}

	private emitTerminal(type: "turn_end" | "agent_end", current: DurableView, inputs?: readonly (string | number)[]): void {
		this.closeThinkingIfNeeded();
		const fault = type === "agent_end" ? findSubmissionFault(inputs, this.submissions, this.lastTaskError) : undefined;
		const summary = resolveTurnSummary(current, this.contentBlocks, this.lastAssistantMessage, this.resolveContextWindow, fault);
		if (summary.lastCheckpointId) this.lastCheckpointId = summary.lastCheckpointId;
		const isAborted = summary.isAborted;
		const isError = summary.isError && !isAborted;
		const base = {
			contextWindow: summary.cw,
			...(this.lastCheckpointId && { providerCheckpointId: this.lastCheckpointId }),
			...(summary.cumulativeUsage && { cumulativeUsage: summary.cumulativeUsage }),
			...(isAborted && { aborted: true, stopReason: "aborted" }),
			...(isError && { stopReason: "error", ...(summary.errorMessage && { errorMessage: summary.errorMessage }) }),
		};
		if (type === "turn_end") this.output({ type: "turn_end", message: summary.finalMsg, ...base });
		else this.output({ type: "agent_end", messages: [summary.finalMsg], ...base });
	}

	public handleBatch(batch: readonly AgentEvent[], current: DurableView): void {
		for (const ev of batch) {
			if (ev.type === "task_failed") this.lastTaskError = (ev as any).message;
			else if (ev.type === "submission" && (ev as any).record?.id !== undefined) this.submissions.set((ev as any).record.id, (ev as any).record);
		}
		for (const ev of batch) this.handleEvent(ev, current);
	}

	public handleEvent(event: AgentEvent, current: DurableView): void {
		switch (event.type) {
			case "snapshot": {
				const snap = event as SnapshotEvent & { view?: DurableView };
				const entries = snap.view?.conversation?.entries ?? snap.entries ?? current?.conversation?.entries;
				const tail = entries?.at(-1);
				if (tail?.id !== undefined) this.lastCheckpointId = String(tail.id);
				this.toolProjector.seedFromSnapshot(snap.tools, snap.nestedTools);
				break;
			}

			case "run_start": {
				this.lastTaskError = undefined;
				this.contentBlocks.clear();
				this.activeThinkingIndex = undefined;
				this.lastAssistantMessage = undefined;
				this.activeToolNames.clear();
				this.toolProjector.clear();
				this.output({ type: "agent_start" });
				break;
			}

			case "turn_start": {
				this.output({ type: "turn_start" });
				break;
			}

			case "message_update": {
				for (const change of event.changes) {
					const idx = typeof change.contentIndex === "number" ? change.contentIndex : 0;
					const thinkDelta = change.type === "thinking_delta" ? change.delta : (change.type === "thinking_start" && change.block.type === "thinking" && change.block.thinking) ? change.block.thinking : undefined;
					const textDelta = change.type === "text_delta" ? change.delta : (change.type === "text_start" && change.block.type === "text" && change.block.text) ? change.block.text : undefined;
					if (thinkDelta) {
						this.activeThinkingIndex = idx;
						const block = this.contentBlocks.get(idx) ?? { type: "thinking", thinking: "" };
						block.thinking = (block.thinking ?? "") + thinkDelta;
						this.contentBlocks.set(idx, block);
						this.output({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: idx, delta: thinkDelta } });
					} else if (textDelta) {
						this.closeThinkingIfNeeded();
						const block = this.contentBlocks.get(idx) ?? { type: "text", text: "" };
						block.text = (block.text ?? "") + textDelta;
						this.contentBlocks.set(idx, block);
						this.output({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: idx, delta: textDelta } });
					}
				}
				break;
			}

			case "tool_execution_start": {
				this.closeThinkingIfNeeded();
				this.activeToolNames.set(event.toolCallId, event.toolName);
				const parentRef = this.resolveParentRef(event.parentToolCallId);
				this.output({ type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args ?? {}, ...(parentRef !== undefined ? { parentRef } : {}) });
				break;
			}
			case "tool_execution_update": {
				const update = this.toolProjector.projectToolUpdate(event, this.resolveParentRef(event.parentToolCallId));
				if (update) this.output(update);
				break;
			}
			case "tool_execution_end": {
				this.output(this.toolProjector.projectToolEnd(event, this.resolveParentRef(event.parentToolCallId)));
				break;
			}
			case "message_end": {
				this.closeThinkingIfNeeded();
				const modelItem = event.entry?.model?.[0];
				const msg = (typeof modelItem === "object" && modelItem !== null) ? (modelItem as RawAssistantEntryMessage) : undefined;
				if (msg?.role === "assistant") {
					const errMsg = typeof msg.errorMessage === "string" ? msg.errorMessage : undefined;
					const stopReason = msg.stopReason ?? (errMsg ? "error" : "stop");
					let content = msg.content ?? [{ type: "text", text: this.currentText }];
					if (content.length === 0 && (stopReason === "error" || errMsg)) {
						content = [{ type: "text", text: errMsg ? `⚠️ ${errMsg}` : "An error occurred during turn generation." }];
					}
					this.lastAssistantMessage = {
						role: "assistant",
						content,
						stopReason,
						...(errMsg ? { errorMessage: errMsg } : {}),
						usage: msg.usage,
					};
					this.output({ type: "message_end", message: this.lastAssistantMessage });
					this.currentText = "";
					this.currentThinking = "";
				}
				break;
			}
			case "task_failed":
				this.lastTaskError = (event as any).message;
				break;
			case "submission":
				if ((event as any).record?.id !== undefined) this.submissions.set((event as any).record.id, (event as any).record);
				break;
			case "compaction_start":
				this.output({ type: "compaction_start", reason: event.reason === "threshold" ? "threshold" : "manual" });
				break;
			case "compaction_end":
				this.output({ type: "compaction_end", reason: event.reason === "threshold" ? "threshold" : "manual", aborted: false });
				break;
			case "turn_end":
				this.emitTerminal("turn_end", current);
				break;
			case "run_end":
				this.toolProjector.clear();
				this.emitTerminal("agent_end", current, (event as any).inputs);
				break;
			case "auto_retry_start":
				this.output({ type: "auto_retry_start", attempt: event.attempt, ...(event.at !== undefined ? { at: event.at } : {}), ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}) });
				break;
			case "auto_retry_end":
				this.output({ type: "auto_retry_end", attempt: event.attempt });
				break;
		}
	}
}
