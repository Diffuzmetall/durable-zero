import test from "node:test";
import assert from "node:assert/strict";
import { PiDurableEngine } from "../../../../../../../../packages/adapter-pi-durable/src/engine/pi-durable-engine.ts";
import { PiDurableSessionStore } from "../../../../../../../../packages/adapter-pi-durable/src/store.ts";
import { LocalNodeExecutionEnv } from "../../../../../../../../packages/execution/src/adapters/local-node-env.ts";
import { DurableEventAdapter } from "../../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts";
import { DurableChildEventAdapter } from "../../../../../../../../packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts";
import type { RunnerEvent } from "../../../../../../../../packages/adapter-pi-durable/src/engine/bridge/contracts.ts";

test("CLOSING PROBE 1: True #private encapsulation in PiDurableEngine", () => {
	const engine = new PiDurableEngine({
		sessionDir: "/tmp/probe-encapsulation",
		dependencies: {} as any,
	});

	// True ECMAScript #private fields do NOT leak as own properties on the instance
	assert.equal((engine as any).instance, undefined, "Instance must not be exposed as property");
	assert.equal((engine as any).options, undefined, "Options must not be exposed as property");
	assert.equal((engine as any).eventAdapter, undefined, "eventAdapter must not be exposed as property");
	assert.equal((engine as any).watcher, undefined, "watcher must not be exposed as property");
	assert.equal((engine as any).graphSource, undefined, "graphSource must not be exposed as property");
	assert.equal((engine as any).unsubscribeView, undefined, "unsubscribeView must not be exposed as property");
	assert.equal((engine as any).listeners, undefined, "listeners must not be exposed as property");

	// Own property names should only contain sessionDir getter/property
	const props = Object.getOwnPropertyNames(engine);
	assert.equal(props.includes("instance"), false, "instance must not be an own property");
	assert.equal(props.includes("#instance"), false, "# private fields cannot be enumerated");
});

test("CLOSING PROBE 2: Store JSON validation and non-JSON rejection", async () => {
	const store = new PiDurableSessionStore({
		sessionDir: "/tmp/probe-store-validation",
	});

	// Rejects functions
	await assert.rejects(
		async () => {
			await store.saveDocument("test", "doc1", { fn: () => {} });
		},
		{
			name: "TypeError",
			message: /Unsupported data type cannot be serialized to JsonValue: function/,
		},
	);

	// Rejects NaN
	await assert.rejects(
		async () => {
			await store.saveDocument("test", "doc2", { invalidNum: Number.NaN });
		},
		{
			name: "TypeError",
			message: /Non-finite number cannot be serialized to JsonValue: NaN/,
		},
	);

	// Rejects Infinity
	await assert.rejects(
		async () => {
			await store.saveDocument("test", "doc3", { inf: Number.POSITIVE_INFINITY });
		},
		{
			name: "TypeError",
			message: /Non-finite number cannot be serialized to JsonValue: Infinity/,
		},
	);
});

test("CLOSING PROBE 3: LocalNodeExecutionEnv fails fast on empty command / argv", async () => {
	const env = new LocalNodeExecutionEnv({ cwd: "/tmp" });

	const emptyStringRes = await env.exec("");
	assert.equal(emptyStringRes.ok, false);
	assert.equal(emptyStringRes.exitCode, 1);
	assert.equal(emptyStringRes.stderr, "Cannot execute empty command string");

	const emptyArgvRes = await env.exec([]);
	assert.equal(emptyArgvRes.ok, false);
	assert.equal(emptyArgvRes.exitCode, 1);
	assert.equal(emptyArgvRes.stderr, "Cannot execute empty command argv");
});

test("CLOSING PROBE 4: Child adapter suffix catchup emits missing suffix with exact correlation", () => {
	const childEmitted: RunnerEvent[] = [];
	const childAdapter = new DurableChildEventAdapter(
		(ev) => childEmitted.push(ev),
		"parent-tool-call-1",
		"child-subagent-42",
	);

	childAdapter.handleEvent({ type: "run_start" } as any);

	// Streaming text delta at index 0: partial "Calculated: "
	childAdapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [{ type: "text_delta", contentIndex: 0, delta: "Calculated: " }],
	} as any);

	// message_end arrives with full content "Calculated: 42"
	childAdapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-5",
			kind: "pi.assistant",
			model: [{ role: "assistant", content: [{ type: "text", text: "Calculated: 42" }] }],
		},
	} as any);

	const textDeltas = childEmitted
		.filter((e) => e.type === "message_update")
		.map((e: any) => ({
			ame: e.assistantMessageEvent,
			parentRef: e.parentRef,
			conversationId: e.conversationId,
		}));

	assert.equal(textDeltas.length, 2, "Expected streamed delta + catchup suffix delta");
	assert.equal(textDeltas[0].ame.delta, "Calculated: ");
	assert.equal(textDeltas[0].ame.contentIndex, 0);
	assert.equal(textDeltas[0].parentRef, "parent-tool-call-1");
	assert.equal(textDeltas[0].conversationId, "child-subagent-42");

	// Suffix delta: only "42", at index 0, with proper correlation
	assert.equal(textDeltas[1].ame.delta, "42");
	assert.equal(textDeltas[1].ame.contentIndex, 0);
	assert.equal(textDeltas[1].parentRef, "parent-tool-call-1");
	assert.equal(textDeltas[1].conversationId, "child-subagent-42");
});

test("CLOSING PROBE 5: Parent DurableEventAdapter message_end reconstructs content without stale properties", () => {
	const emitted: RunnerEvent[] = [];
	const adapter = new DurableEventAdapter((event) => {
		emitted.push(event);
	});

	adapter.handleEvent({ type: "run_start" } as any);

	adapter.handleEvent({
		type: "message_update",
		usage: {},
		changes: [
			{ type: "thinking_delta", contentIndex: 0, delta: "Thinking..." },
			{ type: "text_delta", contentIndex: 1, delta: "Finished." },
		],
	} as any);

	// Entry without model[0].content array
	adapter.handleEvent({
		type: "message_end",
		entry: {
			id: "entry-77",
			kind: "pi.assistant",
			model: [{ role: "assistant" }], // no content array
		},
	} as any);

	const endEvt = emitted.find((e) => e.type === "message_end") as any;
	assert.ok(endEvt);
	assert.ok(Array.isArray(endEvt.message.content));
	assert.equal(endEvt.message.content.length, 2);
	assert.equal(endEvt.message.content[0].type, "thinking");
	assert.equal(endEvt.message.content[0].thinking, "Thinking...");
	assert.equal(endEvt.message.content[1].type, "text");
	assert.equal(endEvt.message.content[1].text, "Finished.");

	assert.equal((adapter as any).currentText, undefined);
	assert.equal((adapter as any).currentThinking, undefined);
});
