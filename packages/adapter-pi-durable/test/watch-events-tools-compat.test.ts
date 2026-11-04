import test from "node:test";
import assert from "node:assert/strict";
import { watchEvents } from "../src/bridge/watch-events-compat.ts";
import type { AgentEvent } from "../src/bridge/durable-contracts.ts";

test("watchEvents: emits tool_execution_start with arguments from assistant toolCall entries", async () => {
	let streamListener: ((events: readonly AgentEvent[], ctx: any) => Promise<void>) | undefined;

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

	// Simulate conversation update: assistant message with toolCall followed by toolResult
	assert.ok(streamListener);
	await streamListener!(
		{
			entries: [
				{
					id: "entry_1",
					model: [
						{
							role: "assistant",
							content: [
								{
									type: "toolCall",
									id: "call_bash_123",
									name: "bash",
									arguments: { command: "git status" },
								},
							],
						},
					],
				},
				{
					id: "entry_2",
					model: [
						{
							role: "toolResult",
							toolCallId: "call_bash_123",
							toolName: "bash",
							content: "On branch main\nnothing to commit",
							isError: false,
						},
					],
				},
			],
			docs: { "pi.live": {} },
		},
		{},
	);

	const startEvt = emitted.find((e) => e.type === "tool_execution_start");
	assert.ok(startEvt, "tool_execution_start must be emitted");
	assert.equal(startEvt.toolCallId, "call_bash_123");
	assert.equal(startEvt.toolName, "bash");
	assert.deepEqual(startEvt.args, { command: "git status" });

	const endEvt = emitted.find((e) => e.type === "tool_execution_end");
	assert.ok(endEvt, "tool_execution_end must be emitted");
	assert.equal(endEvt.toolCallId, "call_bash_123");
	assert.equal(endEvt.toolName, "bash");
	assert.deepEqual((endEvt as any).args, { command: "git status" });
});

test("watchEvents: emits tool_execution_start from liveTools with generation content arguments", async () => {
	let streamListener: ((events: readonly AgentEvent[], ctx: any) => Promise<void>) | undefined;

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
	await streamListener!(
		{
			entries: [],
			docs: {
				"pi.live": {
					generation: {
						message: {
							content: [
								{
									type: "toolCall",
									id: "call_live_456",
									name: "bash",
									arguments: { command: "ls -la" },
								},
							],
						},
					},
					tools: [
						{
							callId: "call_live_456",
							name: "bash",
							status: "running",
							output: "listing...",
						},
					],
				},
			},
		},
		{},
	);

	const startEvt = emitted.find((e) => e.type === "tool_execution_start");
	assert.ok(startEvt, "tool_execution_start must be emitted from live.tools");
	assert.equal(startEvt.toolCallId, "call_live_456");
	assert.equal(startEvt.toolName, "bash");
	assert.deepEqual(startEvt.args, { command: "ls -la" });

	const updateEvt = emitted.find((e) => e.type === "tool_execution_update");
	assert.ok(updateEvt, "tool_execution_update must be emitted when running output is present");
	assert.equal(updateEvt.toolCallId, "call_live_456");
});
