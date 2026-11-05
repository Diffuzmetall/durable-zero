import test from "node:test";
import assert from "node:assert/strict";
import { watchEvents } from "../src/engine/bridge/watch-events-compat.ts";
import type { AgentEvent } from "../src/engine/bridge/durable-contracts.ts";

test("watchEvents: emits message_update with incremental text deltas from pi.live.generation", async () => {
	let streamListener: ((events: any, ctx: any) => Promise<void>) | undefined;

	const mockConversation = {
		watch: async () => ({
			value: {
				entries: [],
				docs: { "pi.live": {} },
			},
			start: (fn: any) => {
				streamListener = fn;
			},
			stop: async () => {},
		}),
	};

	const mockHarness = {
		conversation: async () => mockConversation,
	};

	const stream = await watchEvents(mockHarness, 1, {});
	const emitted: AgentEvent[] = [];
	stream.start(async (batch) => {
		emitted.push(...batch);
	});

	assert.ok(streamListener);

	// Chunk 1 from live generation
	await streamListener!(
		{
			entries: [],
			docs: {
				"pi.live": {
					generation: {
						attempt: 0,
						message: {
							role: "assistant",
							content: [{ type: "text", text: "Hello " }],
						},
					},
				},
			},
		},
		{},
	);

	// Chunk 2 from live generation (shared prefix extension)
	await streamListener!(
		{
			entries: [],
			docs: {
				"pi.live": {
					generation: {
						attempt: 0,
						message: {
							role: "assistant",
							content: [{ type: "text", text: "Hello world" }],
						},
					},
				},
			},
		},
		{},
	);

	// Chunk 3 with thinking block at index 0 and text block at index 1
	await streamListener!(
		{
			entries: [],
			docs: {
				"pi.live": {
					generation: {
						attempt: 0,
						message: {
							role: "assistant",
							content: [
								{ type: "text", text: "Hello world" },
								{ type: "thinking", thinking: "pondering..." },
							],
						},
					},
				},
			},
		},
		{},
	);

	// Generation clears (turn finished)
	await streamListener!(
		{
			entries: [],
			docs: { "pi.live": {} },
		},
		{},
	);

	// New generation attempt starts cleanly (reset verification)
	await streamListener!(
		{
			entries: [],
			docs: {
				"pi.live": {
					generation: {
						attempt: 1,
						message: {
							role: "assistant",
							content: [{ type: "text", text: "Second turn reply" }],
						},
					},
				},
			},
		},
		{},
	);

	const msgUpdates = emitted.filter((e) => e.type === "message_update") as Array<{
		type: "message_update";
		changes: Array<{ type: string; delta?: string; contentIndex: number }>;
	}>;

	assert.ok(msgUpdates.length >= 4, `Expected at least 4 message_updates, got ${msgUpdates.length}`);

	// Update 0: Hello
	assert.equal(msgUpdates[0].changes[0].type, "text_delta");
	assert.equal(msgUpdates[0].changes[0].delta, "Hello ");

	// Update 1: world
	assert.equal(msgUpdates[1].changes[0].type, "text_delta");
	assert.equal(msgUpdates[1].changes[0].delta, "world");

	// Update 2: thinking
	assert.equal(msgUpdates[2].changes[0].type, "thinking_delta");
	assert.equal(msgUpdates[2].changes[0].delta, "pondering...");
	assert.equal(msgUpdates[2].changes[0].contentIndex, 1);

	// Update 3: Second turn reply
	assert.equal(msgUpdates[3].changes[0].type, "text_delta");
	assert.equal(msgUpdates[3].changes[0].delta, "Second turn reply");
});
