import test from "node:test";
import assert from "node:assert/strict";
import { HostRpcManager } from "../src/host-rpc.ts";

test("HostRpcManager: forwardToolCall emits host_tool_call event and resolves via handleHostToolResult", async () => {
	const emitted: any[] = [];
	const rpc = new HostRpcManager((data) => emitted.push(data));

	const toolPromise = rpc.forwardToolCall("mock_tool", { foo: "bar" });

	assert.equal(emitted.length, 1);
	assert.equal(emitted[0].type, "host_tool_call");
	assert.equal(emitted[0].toolName, "mock_tool");
	assert.deepEqual(emitted[0].arguments, { foo: "bar" });
	const callId = emitted[0].callId;
	assert.ok(callId && typeof callId === "string");

	const handled = rpc.handleHostToolResult({
		callId,
		result: [{ type: "text", text: "tool output" }],
		isError: false,
	});
	assert.equal(handled, true);

	const res = await toolPromise;
	assert.equal(res.isError, false);
	assert.deepEqual(res.content, [{ type: "text", text: "tool output" }]);
});

test("HostRpcManager: requestInteraction emits host_interaction_request and resolves via handleHostInteractionResponse", async () => {
	const emitted: any[] = [];
	const rpc = new HostRpcManager((data) => emitted.push(data));

	const interactionPromise = rpc.requestInteraction("confirm", {
		title: "Are you sure?",
		message: "Proceed?",
		data: { test: 123 },
	});

	assert.equal(emitted.length, 1);
	assert.equal(emitted[0].type, "host_interaction_request");
	assert.equal(emitted[0].dialogKind, "confirm");
	assert.equal(emitted[0].title, "Are you sure?");
	assert.equal(emitted[0].message, "Proceed?");
	assert.deepEqual(emitted[0].data, { test: 123 });
	const id = emitted[0].id;
	assert.ok(id !== undefined);

	const handled = rpc.handleHostInteractionResponse({
		id,
		result: true,
	});
	assert.equal(handled, true);

	const res = await interactionPromise;
	assert.equal(res, true);
});

test("HostRpcManager: handles unknown or late results gracefully", () => {
	const emitted: any[] = [];
	const rpc = new HostRpcManager((data) => emitted.push(data));

	const handledTool = rpc.handleHostToolResult({ callId: "unknown_call", result: "ok" });
	assert.equal(handledTool, false);

	const handledInteraction = rpc.handleHostInteractionResponse({ id: "unknown_id", result: "ok" });
	assert.equal(handledInteraction, false);
});
