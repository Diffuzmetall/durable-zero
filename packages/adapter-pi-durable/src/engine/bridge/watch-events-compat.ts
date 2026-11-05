import { NestedCallDoc } from "@earendil-works/pi-durable";
import type { AgentEvent, AgentEventStream, SnapshotEvent } from "./durable-contracts.ts";

function findToolCallInEntries(entries: any[], callId: string): { toolName?: string; args?: Record<string, unknown> } {
	if (!Array.isArray(entries)) return {};
	for (let j = entries.length - 1; j >= 0; j--) {
		const prevMsg = entries[j]?.model?.[0];
		if (prevMsg?.role === "assistant" && Array.isArray(prevMsg.content)) {
			const call = prevMsg.content.find((c: any) => c.type === "toolCall" && (c.id === callId || c.callId === callId));
			if (call) {
				return {
					toolName: call.name,
					args: (call.arguments && typeof call.arguments === "object") ? call.arguments : {},
				};
			}
		}
	}
	return {};
}

/** Compatibility shim for watchEvents over native conversation.watch in Pi 1.5.0 */
export async function watchEvents(
	harness: any,
	conversationId: any,
	context: any,
): Promise<AgentEventStream> {
	let conversation = await harness.conversation(conversationId, context);
	if (!conversation) {
		if (conversationId === 1 || conversationId === "1" || conversationId === undefined) {
			conversation = await harness.root(context);
		} else {
			throw new Error(`Conversation not found: ${conversationId}`);
		}
	}
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
			const emittedToolStarts = new Set<string>();
			const emittedToolEnds = new Set<string>();
			const seenNestedTools = new Map<string, any>();
			let currentGenerationId: string | undefined;
			const seenTextByIndex = new Map<number, string>();
			const seenThinkingByIndex = new Map<number, string>();

			watch.start(async (call: any, ctx: any) => {
				const val = call?.value ?? call;
				if (!val) return;
				const events: AgentEvent[] = [];

				// Track live generation text and thinking deltas from pi.live.generation
				const gen = val.docs?.["pi.live"]?.generation;
				if (gen) {
					const genId = `${gen.attempt ?? 0}`;
					if (genId !== currentGenerationId) {
						currentGenerationId = genId;
						seenTextByIndex.clear();
						seenThinkingByIndex.clear();
					}

					const genContent = gen.message?.content;
					if (Array.isArray(genContent)) {
						const changes: Array<{
							type: "text_delta" | "thinking_delta";
							contentIndex: number;
							delta: string;
						}> = [];

						for (let i = 0; i < genContent.length; i++) {
							const block = genContent[i];
							if (block?.type === "text" && typeof block.text === "string") {
								const prev = seenTextByIndex.get(i) ?? "";
								if (block.text.length > prev.length && block.text.startsWith(prev)) {
									const delta = block.text.slice(prev.length);
									seenTextByIndex.set(i, block.text);
									changes.push({ type: "text_delta", contentIndex: i, delta });
								} else if (block.text !== prev && block.text.length > 0) {
									seenTextByIndex.set(i, block.text);
									changes.push({ type: "text_delta", contentIndex: i, delta: block.text });
								}
							} else if (block?.type === "thinking" && typeof block.thinking === "string") {
								const prev = seenThinkingByIndex.get(i) ?? "";
								if (block.thinking.length > prev.length && block.thinking.startsWith(prev)) {
									const delta = block.thinking.slice(prev.length);
									seenThinkingByIndex.set(i, block.thinking);
									changes.push({ type: "thinking_delta", contentIndex: i, delta });
								} else if (block.thinking !== prev && block.thinking.length > 0) {
									seenThinkingByIndex.set(i, block.thinking);
									changes.push({ type: "thinking_delta", contentIndex: i, delta: block.thinking });
								}
							}
						}

						if (changes.length > 0) {
							events.push({
								type: "message_update",
								usage: val.docs?.["pi.usage"] ?? {},
								changes,
							} as any);
						}
					}
				} else {
					currentGenerationId = undefined;
					seenTextByIndex.clear();
					seenThinkingByIndex.clear();
				}

				// Track direct live tools from pi.live
				const liveTools = val.docs?.["pi.live"]?.tools ?? [];
				for (const t of liveTools) {
					if (t.callId && !emittedToolStarts.has(t.callId)) {
						let toolName = t.name ?? "tool";
						let args: Record<string, unknown> = {};

						const genContent = val.docs?.["pi.live"]?.generation?.message?.content;
						if (Array.isArray(genContent)) {
							const match = genContent.find((c: any) => c.type === "toolCall" && (c.id === t.callId || c.callId === t.callId));
							if (match) {
								if (match.name) toolName = match.name;
								if (match.arguments && typeof match.arguments === "object") args = match.arguments;
							}
						}
						if (Object.keys(args).length === 0) {
							const fromEntries = findToolCallInEntries(val.entries, t.callId);
							if (fromEntries.toolName) toolName = fromEntries.toolName;
							if (fromEntries.args) args = fromEntries.args;
						}
						emittedToolStarts.add(t.callId);
						events.push({
							type: "tool_execution_start",
							toolCallId: t.callId,
							toolName,
							args,
						});
					}
					if (t.callId && t.status === "running" && typeof t.output === "string") {
						events.push({
							type: "tool_execution_update",
							toolCallId: t.callId,
							toolName: t.name ?? "tool",
							output: { set: t.output },
							details: t.details,
							diagnostics: t.diagnostics,
						});
					}
				}

				// Track nested tools from pi.live
				const nested = val.docs?.["pi.live"]?.nestedTools ?? [];
				for (const n of nested) {
					if (n.callId && !seenNestedTools.has(n.callId)) {
						seenNestedTools.set(n.callId, n);
					}
					if (n.callId && !emittedToolStarts.has(n.callId)) {
						emittedToolStarts.add(n.callId);
						const toolName = n.name ?? n.toolName ?? "tool";
						events.push({
							type: "tool_execution_start",
							toolCallId: n.callId,
							toolName,
							taskId: n.taskId,
							parentToolCallId: n.parentCallId,
							parentTaskId: n.parentTaskId,
							args: (n.arguments && typeof n.arguments === "object") ? n.arguments : {},
						});
					}
					if (n.callId && n.status === "running" && typeof n.output === "string") {
						events.push({
							type: "tool_execution_update",
							toolCallId: n.callId,
							toolName: n.name ?? n.toolName ?? "tool",
							parentToolCallId: n.parentCallId,
							parentTaskId: n.parentTaskId,
							output: { set: n.output },
							details: n.details,
							diagnostics: n.diagnostics,
						});
					}
					if (n.callId && n.status === "done" && !emittedToolEnds.has(n.callId)) {
						emittedToolEnds.add(n.callId);
						const toolName = n.name ?? n.toolName ?? "tool";
						let nestedResult: any;
						if (n.parentTaskId && typeof harness.snapshot === "function") {
							const key = n.callId.split("/").pop();
							try {
								const stored = await harness.snapshot(NestedCallDoc, n.parentTaskId, key, context);
								nestedResult = stored?.result;
							} catch {}
						}
						events.push({
							type: "tool_execution_end",
							toolCallId: n.callId,
							toolName,
							taskId: n.taskId,
							parentToolCallId: n.parentCallId,
							parentTaskId: n.parentTaskId,
							result: nestedResult ?? {
								isError: Boolean(n.summary?.isError ?? n.summary?.error ?? n.isError),
								output: n.output,
								details: n.details,
							},
							args: (n.arguments && typeof n.arguments === "object") ? n.arguments : {},
						});
					}
				}

				// Check any nested tools that finished when live.nestedTools cleared
				if (!val.docs?.["pi.live"]?.nestedTools && seenNestedTools.size > 0) {
					for (const [callId, n] of seenNestedTools) {
						if (!emittedToolEnds.has(callId)) {
							emittedToolEnds.add(callId);
							const toolName = n.name ?? n.toolName ?? "tool";
							events.push({
								type: "tool_execution_end",
								toolCallId: callId,
								toolName,
								taskId: n.taskId,
								parentToolCallId: n.parentCallId,
								parentTaskId: n.parentTaskId,
								result: n.result ?? {
									isError: Boolean(n.summary?.isError ?? n.summary?.error ?? n.isError),
									output: n.output,
									details: n.details,
								},
								args: (n.arguments && typeof n.arguments === "object") ? n.arguments : {},
							});
						}
					}
				}

				if (val.entries?.length && val.entries.length > seenEntriesCount) {
					for (let i = seenEntriesCount; i < val.entries.length; i++) {
						const entry = val.entries[i];
						const modelMsg = entry?.model?.[0];

						if (modelMsg?.role === "assistant" && Array.isArray(modelMsg.content)) {
							for (const part of modelMsg.content) {
								if (part.type === "toolCall" && part.id && !emittedToolStarts.has(part.id)) {
									emittedToolStarts.add(part.id);
									events.push({
										type: "tool_execution_start",
										toolCallId: part.id,
										toolName: part.name ?? "tool",
										args: (part.arguments && typeof part.arguments === "object") ? part.arguments : {},
									});
								}
							}
						}

						if (modelMsg?.role === "toolResult") {
							let toolName = modelMsg.toolName ?? "tool";
							let toolArgs: Record<string, unknown> = {};
							const found = findToolCallInEntries(val.entries, modelMsg.toolCallId ?? String(entry.id));
							if (found.toolName && !modelMsg.toolName) toolName = found.toolName;
							if (found.args) toolArgs = found.args;

							const callId = modelMsg.toolCallId ?? String(entry.id);
							if (!emittedToolStarts.has(callId)) {
								emittedToolStarts.add(callId);
								events.push({
									type: "tool_execution_start",
									toolCallId: callId,
									toolName,
									args: toolArgs,
								});
							}
							if (!emittedToolEnds.has(callId)) {
								emittedToolEnds.add(callId);
								events.push({
									type: "tool_execution_end",
									toolCallId: callId,
									toolName,
									entry,
									args: toolArgs,
								});
							}
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
