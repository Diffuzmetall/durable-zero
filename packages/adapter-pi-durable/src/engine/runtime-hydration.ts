import { LiveDoc, InboxDoc, type Conversation, type ConversationId, type ConversationView, type Cursor, type Harness, type TaskGraph } from "@earendil-works/pi-durable";
import { SubagentsDoc, type SubagentsState } from "./subagent-docs.ts";
import { firstInput, type ConversationSummary, type RuntimeReadBinding, runtimeContext } from "./runtime-types.ts";

export function hydrateSessionActiveTools(
	rootAgent: { readonly tools?: readonly { readonly name: string }[] | undefined },
	activeEnvState: { readonly setActiveTools?: (tools: string[]) => void },
): void {
	if (Array.isArray(rootAgent.tools)) {
		activeEnvState.setActiveTools?.(rootAgent.tools.map((t) => t.name));
	}
}

export async function createConversationBinding(
	conversation: Conversation,
	ctx: typeof runtimeContext = runtimeContext,
): Promise<RuntimeReadBinding<ConversationView>> {
	if (typeof (conversation as any).viewState === "function") {
		return (conversation as any).viewState(ctx);
	}
	const watch = await conversation.watch(ctx);
	let currentVal = watch.value;
	const subscribers = new Set<(val: ConversationView) => void>();
	watch.start(async (call: any) => {
		if (call && "value" in call) {
			currentVal = call.value;
			for (const sub of subscribers) sub(call.value);
		}
	});
	return {
		get value() { return currentVal; },
		subscribe(listener) {
			subscribers.add(listener);
			return () => subscribers.delete(listener);
		},
		dispose() {
			void watch.stop();
		},
	};
}

export async function createTaskGraphBinding(
	harness: Harness,
	ctx: typeof runtimeContext = runtimeContext,
): Promise<RuntimeReadBinding<TaskGraph>> {
	if (typeof (harness as any).taskGraph === "function") {
		return (harness as any).taskGraph(ctx);
	}
	const watch = await harness.watchTaskGraph(ctx);
	let currentVal = watch.value;
	const subscribers = new Set<(val: TaskGraph) => void>();
	watch.start(async (call: any) => {
		if (call && "value" in call) {
			currentVal = call.value;
			for (const sub of subscribers) sub(call.value);
		}
	});
	return {
		get value() { return currentVal; },
		subscribe(listener) {
			subscribers.add(listener);
			return () => subscribers.delete(listener);
		},
		dispose() {
			void watch.stop();
		},
	};
}

export function applySubagentSummaries(input: readonly ConversationSummary[], parentId: ConversationId, doc: Readonly<SubagentsState>): ConversationSummary[] {
	return input.map(row => {
		const found = Object.entries(doc.agents).find(([, agent]) => agent.conversationId === row.id);
		if (!found) return row;
		const [key, agent] = found;
		const sending = doc.sending?.reports.some(report => report.name === agent.name) ?? false;
		return { ...row, key, parentId, label: agent.name, title: agent.task, role: agent.role,
			ownerTaskId: agent.ownerTaskId, reporter: agent.reporter,
			deliveryPending: sending || (doc.outbox?.some(report => report.name === agent.name) ?? false),
			hold: sending ? doc.deliveryHold?.reason : undefined };
	});
}

export async function loadSummaries(harness: Harness, rootId: ConversationId): Promise<ConversationSummary[]> {
	let summaries: ConversationSummary[] = [];
	const groups: Array<{ id: ConversationId; doc: Readonly<SubagentsState> }> = [];
	let cursor: Cursor | undefined;
	do {
		const page = await harness.commit((tx) => tx.scanConversations({}, 256, cursor), runtimeContext);
		for (const { id } of page.items) {
			const [input, live, inbox, doc] = await Promise.all([
				firstInput(harness, id), harness.snapshot(LiveDoc, id, runtimeContext),
				harness.snapshot(InboxDoc, id, runtimeContext), harness.snapshot(SubagentsDoc, id, runtimeContext),
			]);
			summaries.push({ id, label: id === rootId ? "main" : `subagent ${id}`, ...input,
				...(live === undefined ? {} : { live }), ...(inbox === undefined ? {} : { inbox }) });
			if (doc) groups.push({ id, doc });
		}
		cursor = page.next;
	} while (cursor !== undefined);
	for (const { id, doc } of groups) summaries = applySubagentSummaries(summaries, id, doc);
	return summaries;
}
