import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessionDispatcher } from "../../../../../../../packages/runner/src/dispatch/session-dispatcher.ts";
import { normalizeConversationId } from "../../../../../../../packages/runner/src/dispatch/normalizers.ts";
import { RequestDispatcher, JsonRpcInvalidParamsError, JsonRpcMethodNotFoundError } from "../../../../../../../packages/protocol/dist/index.js";

describe("Task 4B Fix Round 1 Independent Semantic Probes (Native node:test Harness)", () => {
	const coordinator = {
		prompt: async (input, options) => ({ status: "accepted", id: "rec_1", input, options }),
		abort: async (convId) => { coordinator.lastAborted = convId; },
		getState: async (convId) => ({ activeConversationId: convId ?? "1" }),
		getTranscript: async (convId, limit) => ({ conversationId: convId ?? "1", limit }),
		getStats: async (convId) => ({ contextUsage: { tokens: 100, contextWindow: 128000 } }),
		setSubagentPolicy: async () => ({ ok: true }),
		lastAborted: undefined,
	};
	const engine = {
		getState: async () => ({ models: [] }),
		setModel: async () => {},
		setThinkingLevel: async () => {},
		abortTask: async () => {},
		compact: async () => {},
	};

	const handler = createSessionDispatcher({
		coordinator,
		engine,
	});

	it("Probe 1: Invalid params over compiled protocol transport maps to code -32602", async () => {
		let sent = null;
		const transport = new RequestDispatcher(handler, (msg) => { sent = msg; }, new Map());
		await transport.processLine(JSON.stringify({
			jsonrpc: "2.0",
			id: "probe-1",
			method: "session/prompt",
			params: { content: "" }, // invalid empty content
		}));
		assert.equal(sent?.error?.code, -32602);
		assert.equal(sent?.id, "probe-1");
		assert.ok(sent?.error?.message.includes("Prompt content string must not be empty"));
	});

	it("Probe 2: Unmapped method over compiled protocol transport maps to code -32601", async () => {
		let sent = null;
		const transport = new RequestDispatcher(handler, (msg) => { sent = msg; }, new Map());
		await transport.processLine(JSON.stringify({
			jsonrpc: "2.0",
			id: "probe-2",
			method: "unmapped/method",
			params: {},
		}));
		assert.equal(sent?.error?.code, -32601);
		assert.equal(sent?.id, "probe-2");
		assert.ok(sent?.error?.message.includes("Method not found"));
	});

	it("Probe 3: Generic spoofed Error object maps to code -32603, not -32602 (Anti-gaming check)", async () => {
		const spoofHandler = async () => {
			const fake = new Error("Spoofed error");
			fake.name = "JsonRpcInvalidParamsError";
			throw fake;
		};
		let sent = null;
		const transport = new RequestDispatcher(spoofHandler, (msg) => { sent = msg; }, new Map());
		await transport.processLine(JSON.stringify({
			jsonrpc: "2.0",
			id: "probe-3",
			method: "test/spoof",
			params: {},
		}));
		assert.equal(sent?.error?.code, -32603);
		assert.equal(sent?.id, "probe-3");
		assert.equal(sent?.error?.message, "Spoofed error");
	});

	it("Probe 4: Numeric conversationId: 42 is normalized to string '42' for Core port", async () => {
		let sent = null;
		const transport = new RequestDispatcher(handler, (msg) => { sent = msg; }, new Map());
		await transport.processLine(JSON.stringify({
			jsonrpc: "2.0",
			id: "probe-4",
			method: "session/prompt",
			params: { content: "hello", conversationId: 42 },
		}));
		assert.equal(sent?.result?.options?.conversationId, "42");
		assert.equal(sent?.result?.input, "hello");
	});

	it("Probe 5: Invalid conversationId values (0, negative, non-digit, '0') are rejected with -32602", async () => {
		const invalidCases = [0, -1, "abc", "0"];
		for (const inv of invalidCases) {
			let sent = null;
			const transport = new RequestDispatcher(handler, (msg) => { sent = msg; }, new Map());
			await transport.processLine(JSON.stringify({
				jsonrpc: "2.0",
				id: `probe-inv-${inv}`,
				method: "session/prompt",
				params: { content: "hello", conversationId: inv },
			}));
			assert.equal(sent?.error?.code, -32602, `Value ${inv} must be rejected with -32602`);
		}
	});

	it("Probe 6: Root session/abort without conversationId forwards undefined to coordinator.abort", async () => {
		coordinator.lastAborted = "stale";
		let sent = null;
		const transport = new RequestDispatcher(handler, (msg) => { sent = msg; }, new Map());
		await transport.processLine(JSON.stringify({
			jsonrpc: "2.0",
			id: "probe-6",
			method: "session/abort",
			params: {},
		}));
		assert.equal(sent?.result?.ok, true);
		assert.equal(coordinator.lastAborted, undefined);
	});
});
