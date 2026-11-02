import test from "node:test";
import assert from "node:assert/strict";
import { runnerCommandSchema, runnerEventSchema } from "../src/index.ts";

test("runnerCommandSchema validates session_fork command", () => {
	const parsed = runnerCommandSchema.safeParse({
		type: "session_fork",
		sourceDir: "/tmp/source",
		targetDir: "/tmp/target",
		checkpointId: 10,
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.type, "session_fork");
		assert.equal(parsed.data.sourceDir, "/tmp/source");
		assert.equal(parsed.data.targetDir, "/tmp/target");
		assert.equal(parsed.data.checkpointId, 10);
	}
});

test("runnerCommandSchema validates host_tool_result command", () => {
	const parsed = runnerCommandSchema.safeParse({
		type: "host_tool_result",
		callId: "c1",
		result: [{ type: "text", text: "ok" }],
		isError: false,
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.type, "host_tool_result");
		assert.equal(parsed.data.callId, "c1");
		assert.equal(parsed.data.isError, false);
	}
});

test("runnerCommandSchema validates host_interaction_response command", () => {
	const parsed = runnerCommandSchema.safeParse({
		type: "host_interaction_response",
		id: "i1",
		result: "ok",
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.type, "host_interaction_response");
		assert.equal(parsed.data.id, "i1");
		assert.equal(parsed.data.result, "ok");
	}
});

test("runnerEventSchema validates host_tool_call event", () => {
	const parsed = runnerEventSchema.safeParse({
		type: "host_tool_call",
		callId: "c1",
		toolName: "read",
		arguments: {},
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.type, "host_tool_call");
		assert.equal(parsed.data.callId, "c1");
		assert.equal(parsed.data.toolName, "read");
		assert.deepEqual(parsed.data.arguments, {});
	}
});

test("runnerEventSchema validates host_interaction_request event", () => {
	const parsed = runnerEventSchema.safeParse({
		type: "host_interaction_request",
		id: "i1",
		dialogKind: "confirm",
		title: "T",
		message: "M",
	});
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.type, "host_interaction_request");
		assert.equal(parsed.data.id, "i1");
		assert.equal(parsed.data.dialogKind, "confirm");
		assert.equal(parsed.data.title, "T");
		assert.equal(parsed.data.message, "M");
	}
});
