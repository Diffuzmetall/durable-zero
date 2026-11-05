import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DurableChildEventAdapter } from "../src/engine/bridge/durable-child-event-adapter.ts";
import type { RunnerEvent } from "../src/engine/bridge/contracts.ts";

describe("FND-T1-10: DurableChildEventAdapter Per-Content-Index Catchup and Turn Isolation", () => {
	it("multi-turn: already-complete text emits NO duplicate delta on message_end across turns", () => {
		const emitted: RunnerEvent[] = [];
		const adapter = new DurableChildEventAdapter(
			(ev) => emitted.push(ev),
			"parent-call-1",
			"child-1",
		);

		// === TURN 1 ===
		adapter.handleEvent({
			type: "run_start",
		} as any);

		adapter.handleEvent({
			type: "message_update",
			usage: {},
			changes: [{ type: "text_delta", contentIndex: 0, delta: "Turn 1 output" }],
		} as any);

		adapter.handleEvent({
			type: "message_end",
			entry: {
				id: "entry-1",
				kind: "pi.assistant",
				model: [{ role: "assistant", content: [{ type: "text", text: "Turn 1 output" }] }],
			},
		} as any);

		// === TURN 2 ===
		adapter.handleEvent({
			type: "run_start",
		} as any);

		adapter.handleEvent({
			type: "message_update",
			usage: {},
			changes: [{ type: "text_delta", contentIndex: 0, delta: "Turn 2 output" }],
		} as any);

		adapter.handleEvent({
			type: "message_end",
			entry: {
				id: "entry-2",
				kind: "pi.assistant",
				model: [{ role: "assistant", content: [{ type: "text", text: "Turn 2 output" }] }],
			},
		} as any);

		const textDeltas = emitted
			.filter((e) => e.type === "message_update")
			.map((e: any) => e.assistantMessageEvent)
			.filter((ame) => ame?.type === "text_delta");

		// Exactly 2 deltas total: one for Turn 1, one for Turn 2. NO DUPLICATE on message_end!
		assert.equal(textDeltas.length, 2, `Expected exactly 2 deltas, got ${textDeltas.length}`);
		assert.equal(textDeltas[0].delta, "Turn 1 output");
		assert.equal(textDeltas[1].delta, "Turn 2 output");
	});

	it("partial tail catchup: emits ONLY missing suffix at the correct non-zero contentIndex with parentRef correlation", () => {
		const emitted: RunnerEvent[] = [];
		const adapter = new DurableChildEventAdapter(
			(ev) => emitted.push(ev),
			"parent-call-42",
			"child-99",
		);

		adapter.handleEvent({ type: "run_start" } as any);

		// Stream thinking at index 0, and partial text at index 1
		adapter.handleEvent({
			type: "message_update",
			usage: {},
			changes: [
				{ type: "thinking_delta", contentIndex: 0, delta: "Pondering..." },
				{ type: "text_delta", contentIndex: 1, delta: "Hello " },
			],
		} as any);

		// message_end arrives with full content: thinking at 0, "Hello world" at 1
		adapter.handleEvent({
			type: "message_end",
			entry: {
				id: "entry-1",
				kind: "pi.assistant",
				model: [
					{
						role: "assistant",
						content: [
							{ type: "thinking", thinking: "Pondering..." },
							{ type: "text", text: "Hello world" },
						],
					},
				],
			},
		} as any);

		const updateEvents = emitted.filter((e) => e.type === "message_update") as Array<{
			type: "message_update";
			assistantMessageEvent: { type: string; contentIndex: number; delta?: string; content?: string };
			parentRef?: string;
			conversationId?: string | number;
		}>;

		// Verify parentRef and conversationId on all updates
		for (const ev of updateEvents) {
			assert.equal(ev.parentRef, "parent-call-42");
			assert.equal(ev.conversationId, "child-99");
		}

		// Catchup text delta must be ONLY the missing suffix "world" at contentIndex: 1
		const textDeltas = updateEvents.filter((u) => u.assistantMessageEvent.type === "text_delta");
		assert.equal(textDeltas.length, 2, `Expected 2 text deltas (initial + catchup), got ${textDeltas.length}`);
		assert.equal(textDeltas[0].assistantMessageEvent.contentIndex, 1);
		assert.equal(textDeltas[0].assistantMessageEvent.delta, "Hello ");

		assert.equal(textDeltas[1].assistantMessageEvent.contentIndex, 1, "Catchup delta must use contentIndex 1");
		assert.equal(textDeltas[1].assistantMessageEvent.delta, "world", "Catchup delta must be missing suffix only");
	});

	it("malformed/empty content: does not manufacture undefined text or throw", () => {
		const emitted: RunnerEvent[] = [];
		const adapter = new DurableChildEventAdapter(
			(ev) => emitted.push(ev),
			"parent-call-1",
		);

		adapter.handleEvent({ type: "run_start" } as any);

		// message_end with non-array or missing content
		adapter.handleEvent({
			type: "message_end",
			entry: {
				id: "entry-1",
				kind: "pi.assistant",
				model: [{ role: "assistant", content: null as any }],
			},
		} as any);

		const textDeltas = emitted
			.filter((e) => e.type === "message_update")
			.map((e: any) => e.assistantMessageEvent)
			.filter((ame) => ame?.type === "text_delta");

		assert.equal(textDeltas.length, 0, "Must not emit text_delta for empty/malformed content");
	});
});
