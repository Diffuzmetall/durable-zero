import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { SessionCoordinator } from "../../../../../../../packages/core/src/session/coordinator.ts";
import { DurableEventAdapter } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts";
import { DurableChildEventAdapter } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts";
import { assembleDurableZero } from "../../../../../../../packages/runner/src/composition.ts";
import type { RunnerEvent } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/contracts.ts";

test("PROBE 1 (VERIFIED FIXED FND-T1-10): Child adapter multi-turn emits ZERO duplicate deltas on message_end", () => {
	const childEmitted: RunnerEvent[] = [];
	const childAdapter = new DurableChildEventAdapter(
		(ev) => childEmitted.push(ev),
		"parent-call-1",
		"child-1",
	);

	// Turn 1: stream text, then message_end
	childAdapter.handleEvent({ type: "run_start" } as any);
	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [{ type: "text_delta", contentIndex: 0, delta: "Turn 1 output" }],
	} as any);
	childAdapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-1",
			kind: "pi.assistant",
			model: [{ role: "assistant", content: [{ type: "text", text: "Turn 1 output" }] }],
		},
	} as any);

	// Turn 2: stream text, then message_end
	childAdapter.handleEvent({ type: "turn_start" } as any);
	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [{ type: "text_delta", contentIndex: 0, delta: "Turn 2 output" }],
	} as any);
	childAdapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-2",
			kind: "pi.assistant",
			model: [{ role: "assistant", content: [{ type: "text", text: "Turn 2 output" }] }],
		},
	} as any);

	const textDeltas = childEmitted
		.filter((e) => e.type === "message_update")
		.map((e: any) => e.assistantMessageEvent)
		.filter((ame) => ame?.type === "text_delta");

	// In Round 1, this failed with length 3 (duplicate "Turn 2 output" on message_end).
	// Now with per-block suffix catchup: exactly 2 deltas total (one per turn, zero duplicates).
	assert.equal(textDeltas.length, 2, "Verified: exactly 2 deltas, zero duplicates across turns");
	assert.equal(textDeltas[0].delta, "Turn 1 output");
	assert.equal(textDeltas[1].delta, "Turn 2 output");
});

test("PROBE 2 (VERIFIED FIXED FND-T1-10): Child adapter partial tail catchup emits ONLY missing suffix at actual index", () => {
	const childEmitted: RunnerEvent[] = [];
	const childAdapter = new DurableChildEventAdapter(
		(ev) => childEmitted.push(ev),
		"parent-task-7",
		"child-conv-88",
	);

	childAdapter.handleEvent({ type: "run_start" } as any);

	// Streaming only sent partial prefix "Hello " at contentIndex: 2
	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [
			{ type: "text_delta", contentIndex: 2, delta: "Hello " },
		],
	} as any);

	// message_end arrives with final complete text "Hello world!" at contentIndex: 2
	childAdapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-3",
			kind: "pi.assistant",
			model: [
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "Pondering..." },
						{ type: "thinking", thinking: "Deep thought" },
						{ type: "text", text: "Hello world!" },
					],
				},
			],
		},
	} as any);

	const textDeltas = childEmitted
		.filter((e) => e.type === "message_update")
		.map((e: any) => e.assistantMessageEvent)
		.filter((ame) => ame?.type === "text_delta");

	assert.equal(textDeltas.length, 2, "Expected initial streaming delta + catchup suffix delta");
	assert.equal(textDeltas[0].contentIndex, 2);
	assert.equal(textDeltas[0].delta, "Hello ");

	assert.equal(textDeltas[1].contentIndex, 2, "Catchup delta emitted at correct block index 2");
	assert.equal(textDeltas[1].delta, "world!", "Catchup delta is ONLY the missing suffix");
});

test("PROBE 3 (VERIFIED FIXED FND-T1-11): Parent DurableEventAdapter message_end reconstructs content cleanly without stale currentText", () => {
	const emitted: RunnerEvent[] = [];
	const adapter = new DurableEventAdapter((event) => {
		emitted.push(event);
	});

	adapter.handleEvent({ type: "run_start" } as any);

	// Stream thinking at 0, text at 1
	adapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [
			{ type: "thinking_delta", contentIndex: 0, delta: "Reasoning here..." },
			{ type: "text_delta", contentIndex: 1, delta: "Answer text here" },
		],
	} as any);

	// Entry without model[0].content array
	adapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-99",
			kind: "pi.assistant",
			model: [{ role: "assistant" }], // no content array
		},
	} as any);

	const endEvt = emitted.find((e) => e.type === "message_end") as any;
	assert.ok(endEvt);
	assert.ok(Array.isArray(endEvt.message.content));
	assert.equal(endEvt.message.content.length, 2);
	assert.equal(endEvt.message.content[0].type, "thinking");
	assert.equal(endEvt.message.content[0].thinking, "Reasoning here...");
	assert.equal(endEvt.message.content[1].type, "text");
	assert.equal(endEvt.message.content[1].text, "Answer text here");

	// Verify no stale currentText property attached to adapter
	assert.equal((adapter as any).currentText, undefined);
	assert.equal((adapter as any).currentThinking, undefined);
});

test("PROBE 4: Bounded assembly teardown with custom engine and owned streams", async () => {
	let customStarted = false;
	let customClosed = false;

	const customEngine = {
		start: async () => {
			customStarted = true;
		},
		submit: async () => ({ status: "accepted" as const, id: "1", conversationId: "1" }),
		abort: async () => {},
		getState: async () => ({} as any),
		getTranscript: async () => ({ conversationId: "1", entries: [] }),
		getStats: async () => ({ contextUsage: { tokens: null, contextWindow: 0 } }),
		setSubagentPolicy: async () => {},
		events: () => () => {},
		close: async () => {
			customClosed = true;
		},
	};

	const inStream = new PassThrough();
	const outStream = new PassThrough();
	let instance: any;

	try {
		instance = await assembleDurableZero({
			sessionDir: "/tmp/custom-engine-probe-r2",
			engine: customEngine as any,
			stdin: inStream,
			stdout: outStream,
		});

		assert.equal(customStarted, true);
		assert.equal(instance.engine, customEngine);
	} finally {
		if (instance) {
			await instance.close();
		}
		inStream.destroy();
		outStream.destroy();
	}
	assert.equal(customClosed, true);
});
