import test from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../../../../../../packages/core/src/session/coordinator.ts";
import { DurableEventAdapter } from "../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts";
import type { RunnerEvent } from "../../../../../../packages/adapter-pi-durable/src/engine/bridge/contracts.ts";

test("PROBE 1: Sticky abort in SessionCoordinator permanently bricks subsequent prompts", async () => {
	let submitCalls = 0;
	let abortCalls = 0;
	const mockEngine = {
		start: async () => {},
		submit: async () => {
			submitCalls++;
			return { status: "accepted" as const, id: "sub-1", conversationId: "1" };
		},
		abort: async () => {
			abortCalls++;
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
		sessionDir: "/tmp/probe-session",
	});

	await coord.start();

	// First prompt succeeds
	const rec1 = await coord.prompt("First turn prompt");
	assert.equal(rec1.status, "accepted");
	assert.equal(submitCalls, 1);

	// User aborts generation
	await coord.abort();
	assert.equal(abortCalls, 1);
	assert.equal(coord.isAborted, true);

	// Attempting a subsequent prompt on the same session should be allowed in a living agent session,
	// but coordinator throws SESSION_ABORTED and never resets isAborted.
	await assert.rejects(
		async () => {
			await coord.prompt("Second turn prompt after abort");
		},
		{
			name: "SessionError",
			code: "SESSION_ABORTED",
		},
	);
	assert.equal(submitCalls, 1, "Engine was never invoked for second prompt because coordinator bricked session");
});

test("PROBE 2: Hardcoded contentIndex in DurableEventAdapter collapses multi-part streaming blocks", () => {
	const emitted: RunnerEvent[] = [];
	const adapter = new DurableEventAdapter((event) => {
		emitted.push(event);
	});

	// Upstream watchEvents sends a batch with thinking block at index 0 and text block at index 1
	adapter.handleEvent(
		{
			type: "message_update",
			usage: {},
			changes: [
				{
					type: "thinking_delta",
					contentIndex: 0,
					delta: "Let me think...",
				},
				{
					type: "text_delta",
					contentIndex: 1,
					delta: "Here is the answer",
				},
			],
		} as any,
		{} as any,
	);

	const updates = emitted.filter((e) => e.type === "message_update") as Array<{
		type: "message_update";
		assistantMessageEvent: { type: string; contentIndex: number; delta?: string; content?: string };
	}>;

	assert.equal(updates.length, 3, "thinking_delta, thinking_end, and text_delta");

	const thinkingUpdate = updates[0].assistantMessageEvent;
	assert.equal(thinkingUpdate.type, "thinking_delta");
	assert.equal(thinkingUpdate.contentIndex, 0);
	assert.equal(thinkingUpdate.delta, "Let me think...");

	const thinkingEnd = updates[1].assistantMessageEvent;
	assert.equal(thinkingEnd.type, "thinking_end");
	assert.equal(thinkingEnd.contentIndex, 0);

	const textUpdate = updates[2].assistantMessageEvent;
	assert.equal(textUpdate.type, "text_delta");
	// PROVEN DEFECT: textUpdate was sent with contentIndex: 1 from watchEvents,
	// but DurableEventAdapter emitted contentIndex: 0.
	assert.equal(
		textUpdate.contentIndex,
		0,
		"CONFIRMED DEFECT: DurableEventAdapter hardcodes contentIndex to 0 for text_delta, colliding with index 0",
	);
});
