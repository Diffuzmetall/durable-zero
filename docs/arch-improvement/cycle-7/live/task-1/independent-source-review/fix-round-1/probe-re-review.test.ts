import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { SessionCoordinator } from "../../../../../../../packages/core/src/session/coordinator.ts";
import { DurableEventAdapter } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts";
import { DurableChildEventAdapter } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts";
import { assembleDurableZero } from "../../../../../../../packages/runner/src/composition.ts";
import type { RunnerEvent } from "../../../../../../../packages/adapter-pi-durable/src/engine/bridge/contracts.ts";

test("PROBE 1 (REMEDIATED FND-T1-01): Root abort and child abort allow subsequent prompts", async () => {
	let submitCalls = 0;
	let abortCalls: Array<string | undefined> = [];
	const mockEngine = {
		start: async () => {},
		submit: async (input: any) => {
			submitCalls++;
			return { status: "accepted" as const, id: `sub-${submitCalls}`, conversationId: "1" };
		},
		abort: async (convId?: string) => {
			abortCalls.push(convId);
		},
		getState: async () => ({} as any),
		getTranscript: async () => ({ conversationId: "1", entries: [] }),
		getStats: async () => ({ contextUsage: { tokens: null, contextWindow: 0 } }),
		setSubagentPolicy: async () => {},
		events: () => () => {},
		close: async () => {},
	};

	const coord = new SessionCoordinator({
		engine: mockEngine,
		sessionDir: "/tmp/probe-session-fix",
	});

	await coord.start();

	// 1. Submit prompt 1
	const rec1 = await coord.prompt("Prompt 1");
	assert.equal(rec1.status, "accepted");
	assert.equal(submitCalls, 1);

	// 2. Abort active turn
	await coord.abort();
	assert.equal(abortCalls.length, 1);
	assert.equal(abortCalls[0], undefined);

	// 3. Submit prompt 2 after abort: MUST SUCCEED (no sticky bricking)
	const rec2 = await coord.prompt("Prompt 2 after abort");
	assert.equal(rec2.status, "accepted");
	assert.equal(submitCalls, 2);

	// 4. Abort child conversation
	await coord.abort("child-conv-99");
	assert.equal(abortCalls.length, 2);
	assert.equal(abortCalls[1], "child-conv-99");

	// 5. Submit prompt 3 on root: MUST STILL SUCCEED
	const rec3 = await coord.prompt("Prompt 3 after child abort");
	assert.equal(rec3.status, "accepted");
	assert.equal(submitCalls, 3);

	await coord.close();
});

test("PROBE 2 (REMEDIATED FND-T1-02): Real contentIndex and partial block mapping preserved", () => {
	const emitted: RunnerEvent[] = [];
	const adapter = new DurableEventAdapter((event) => {
		emitted.push(event);
	});

	// Multi-part update: thinking at index 0, text at index 1
	adapter.handleEvent(
		{
			type: "message_update",
			usage: {},
			changes: [
				{
					type: "thinking_delta",
					contentIndex: 0,
					delta: "Pondering...",
				},
				{
					type: "text_delta",
					contentIndex: 1,
					delta: "First text block",
				},
			],
		} as any,
		{} as any,
	);

	const updates = emitted.filter((e) => e.type === "message_update") as Array<{
		type: "message_update";
		assistantMessageEvent: { type: string; contentIndex: number; delta?: string; content?: string };
	}>;

	assert.equal(updates.length, 3, "thinking_delta (idx 0), thinking_end (idx 0), and text_delta (idx 1)");

	const thinkingUpdate = updates[0].assistantMessageEvent;
	assert.equal(thinkingUpdate.type, "thinking_delta");
	assert.equal(thinkingUpdate.contentIndex, 0);

	const thinkingEnd = updates[1].assistantMessageEvent;
	assert.equal(thinkingEnd.type, "thinking_end");
	assert.equal(thinkingEnd.contentIndex, 0);

	const textUpdate = updates[2].assistantMessageEvent;
	assert.equal(textUpdate.type, "text_delta");
	assert.equal(textUpdate.contentIndex, 1, "Real contentIndex 1 preserved for text_delta!");

	// Verify internal Map structure
	const internalBlocks = (adapter as any).contentBlocks as Map<number, { type: string; text?: string; thinking?: string }>;
	assert.ok(internalBlocks instanceof Map);
	assert.equal(internalBlocks.get(0)?.type, "thinking");
	assert.equal(internalBlocks.get(0)?.thinking, "Pondering...");
	assert.equal(internalBlocks.get(1)?.type, "text");
	assert.equal(internalBlocks.get(1)?.text, "First text block");
});

test("PROBE 3 (REMEDIATED FND-T1-03 & FND-T1-08): SessionCoordinator constructor & single lock", () => {
	const mockEngine = {
		start: async () => {},
		submit: async () => ({ status: "accepted" as const, id: "1", conversationId: "1" }),
		abort: async () => {},
		getState: async () => ({} as any),
		getTranscript: async () => ({ conversationId: "1", entries: [] }),
		getStats: async () => ({ contextUsage: { tokens: null, contextWindow: 0 } }),
		setSubagentPolicy: async () => {},
		events: () => () => {},
		close: async () => {},
	};

	assert.throws(
		() => new SessionCoordinator({ engine: mockEngine } as any),
		/sessionDir must be a non-empty string/,
	);

	const coord = new SessionCoordinator({
		engine: mockEngine,
		sessionDir: "/tmp/single-lock-test",
	});

	assert.equal((coord as any).store, undefined);
	assert.equal((coord as any).modelProvider, undefined);
	assert.equal((coord as any).executionEnv, undefined);
	assert.equal((coord as any).resourceLoader, undefined);
});

test("PROBE 4 (REMEDIATED FND-T1-05): Custom injected engine does not eagerly create native defaults", async () => {
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
			sessionDir: "/tmp/custom-engine-probe",
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

test("PROBE 5 (PROVEN DEFECT in DurableChildEventAdapter): Unsynchronized currentText causes duplicate full delta on turn 2", () => {
	const childEmitted: RunnerEvent[] = [];
	const childAdapter = new DurableChildEventAdapter(
		(ev) => childEmitted.push(ev),
		"parent-call-1",
		"child-1",
	);

	// Turn 1 message_end executes: this.currentText is undefined, so no catchup delta, and sets this.currentText = ""
	childAdapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-1",
			kind: "pi.assistant",
			model: [{ role: "assistant", content: [{ type: "text", text: "Turn 1 output" }] }],
		},
	} as any);

	// Now in Turn 2: stream deltas
	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [
			{
				type: "text_delta",
				contentIndex: 0,
				delta: "Turn 2 output",
			},
		],
	} as any);

	// Now Turn 2 message_end arrives with completed content: "Turn 2 output"
	// Because this.currentText was set to "" at the end of Turn 1 and NEVER updated during message_update:
	// fullText.startsWith(this.currentText) is true ("Turn 2 output".startsWith(""))
	// fullText.length > this.currentText.length is true (13 > 0)
	// IT EMITS A SECOND DUPLICATE DELTA FOR THE ENTIRE STRING "Turn 2 output" AT contentIndex: 0!
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

	// PROVEN BEHAVIOR:
	// First delta was streamed during message_update: "Turn 2 output"
	// Second delta was duplicate emitted during message_end because currentText was stuck at "": "Turn 2 output"
	assert.equal(textDeltas.length, 2, "DUPLICATE text_delta emitted on turn 2!");
	assert.equal(textDeltas[0].delta, "Turn 2 output");
	assert.equal(textDeltas[1].delta, "Turn 2 output", "CONFIRMED DEFECT: message_end emitted duplicate full text");
	assert.equal(textDeltas[1].contentIndex, 0, "CONFIRMED DEFECT: message_end hardcoded contentIndex 0");
});
