import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DurableEventAdapter } from "../src/engine/bridge/durable-event-adapter.ts";
import type { AgentEvent, MessageChange } from "../src/engine/bridge/durable-contracts.ts";

describe("FND-T1-02: ContentIndex preservation in DurableEventAdapter", () => {
	it("preserves real contentIndex for thinking and multi-block text deltas (no hardcoded 0 collapse)", () => {
		const emitted: any[] = [];
		const adapter = new DurableEventAdapter((event) => {
			emitted.push(event);
		});

		// Simulate event with:
		// block 0: thinking
		// block 1: text block 1
		// block 2: text block 2
		const changes: MessageChange[] = [
			{ type: "thinking_start", contentIndex: 0, block: { type: "thinking", thinking: "pondering..." } as any },
			{ type: "thinking_delta", contentIndex: 0, delta: "deep thoughts" },
			{ type: "text_start", contentIndex: 1, block: { type: "text", text: "Answer block 1" } as any },
			{ type: "text_delta", contentIndex: 1, delta: " continuation 1" },
			{ type: "text_start", contentIndex: 2, block: { type: "text", text: "Answer block 2" } as any },
			{ type: "text_delta", contentIndex: 2, delta: " continuation 2" },
		];

		const batch: AgentEvent[] = [
			{ type: "run_start" } as any,
			{ type: "message_update", changes } as any,
		];

		adapter.handleBatch(batch, {} as any);

		const updates = emitted.filter((e) => e.type === "message_update");
		assert.ok(updates.length >= 4, `Expected at least 4 updates, got ${updates.length}`);

		// Thinking events must have contentIndex: 0
		const thinkingEvents = updates.filter((u) => u.assistantMessageEvent.type.startsWith("thinking"));
		assert.ok(thinkingEvents.length > 0);
		for (const te of thinkingEvents) {
			assert.equal(te.assistantMessageEvent.contentIndex, 0);
		}

		// Text block 1 events MUST have contentIndex: 1
		const text1Events = updates.filter((u) =>
			u.assistantMessageEvent.type === "text_delta" &&
			(u.assistantMessageEvent.delta.includes("Answer block 1") || u.assistantMessageEvent.delta.includes("continuation 1"))
		);
		assert.ok(text1Events.length > 0, "Expected text 1 events");
		for (const t1 of text1Events) {
			assert.equal(t1.assistantMessageEvent.contentIndex, 1, `Expected contentIndex 1, got ${t1.assistantMessageEvent.contentIndex}`);
		}

		// Text block 2 events MUST have contentIndex: 2
		const text2Events = updates.filter((u) =>
			u.assistantMessageEvent.type === "text_delta" &&
			(u.assistantMessageEvent.delta.includes("Answer block 2") || u.assistantMessageEvent.delta.includes("continuation 2"))
		);
		assert.ok(text2Events.length > 0, "Expected text 2 events");
		for (const t2 of text2Events) {
			assert.equal(t2.assistantMessageEvent.contentIndex, 2, `Expected contentIndex 2, got ${t2.assistantMessageEvent.contentIndex}`);
		}
	});
});
