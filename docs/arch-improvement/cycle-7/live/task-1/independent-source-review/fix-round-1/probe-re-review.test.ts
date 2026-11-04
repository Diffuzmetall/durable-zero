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

test("PROBE 2 (REMEDIATED FND-T1-02): Real contentIndex preserved in DurableEventAdapter & ChildAdapter", () => {
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

	// Also verify child adapter
	const childEmitted: RunnerEvent[] = [];
	const childAdapter = new DurableChildEventAdapter(
		(ev) => childEmitted.push(ev),
		"parent-call-1",
		"child-1",
	);

	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [
			{
				type: "text_delta",
				contentIndex: 3,
				delta: "Child block 3",
			},
		],
	} as any);

	const childUpdates = childEmitted.filter((e) => e.type === "message_update") as Array<{
		type: "message_update";
		assistantMessageEvent: { type: string; contentIndex: number; delta?: string };
	}>;
	assert.equal(childUpdates.length, 1);
	assert.equal(childUpdates[0].assistantMessageEvent.contentIndex, 3, "Child adapter preserved contentIndex 3!");
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

	// Constructor fails if sessionDir is missing
	assert.throws(
		() => new SessionCoordinator({ engine: mockEngine } as any),
		/sessionDir must be a non-empty string/,
	);

	const coord = new SessionCoordinator({
		engine: mockEngine,
		sessionDir: "/tmp/single-lock-test",
	});

	// Check that coordinator does not hold store or decorative properties
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

	const instance = await assembleDurableZero({
		sessionDir: "/tmp/custom-engine-probe",
		engine: customEngine as any,
		stdin: inStream,
		stdout: outStream,
	});

	assert.equal(customStarted, true);
	assert.equal(instance.engine, customEngine);

	await instance.close();
	assert.equal(customClosed, true);
	inStream.destroy();
	outStream.destroy();
});

test("PROBE 5 (RESIDUAL RISK AUDIT in DurableEventAdapter message_end): Stale this.currentText reference", () => {
	const emitted: RunnerEvent[] = [];
	const adapter = new DurableEventAdapter((event) => {
		emitted.push(event);
	});

	// If entry.model[0] has content, it is preserved
	adapter.handleEvent(
		{
			type: "message_end",
			entry: {
				id: "100",
				kind: "pi.assistant",
				model: [{ role: "assistant", content: [{ type: "text", text: "Verified Content" }] }],
			},
		} as any,
		{} as any,
	);

	const endEvt = emitted.find((e) => e.type === "message_end") as any;
	assert.ok(endEvt);
	assert.equal(endEvt.message.content[0].text, "Verified Content");

	// BUT if entry.model[0].content is undefined, it falls back to this.currentText which is undefined!
	const emitted2: RunnerEvent[] = [];
	const adapter2 = new DurableEventAdapter((event) => {
		emitted2.push(event);
	});
	// Feed deltas
	adapter2.handleEvent(
		{
			type: "message_update",
			changes: [{ type: "text_delta", contentIndex: 0, delta: "Delta text" }],
		} as any,
		{} as any,
	);
	adapter2.handleEvent(
		{
			type: "message_end",
			entry: {
				id: "101",
				kind: "pi.assistant",
				model: [{ role: "assistant" }], // content omitted
			},
		} as any,
		{} as any,
	);

	const endEvt2 = emitted2.find((e) => e.type === "message_end") as any;
	assert.ok(endEvt2);
	// Notice: endEvt2.message.content[0].text is undefined because this.currentText was deleted from the class
	assert.equal(
		endEvt2.message.content[0].text,
		undefined,
		"AUDIT CONFIRMATION: message_end reads undeclared this.currentText when model.content is undefined",
	);
});
