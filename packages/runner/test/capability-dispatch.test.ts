import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import {
	createSessionDispatcher,
	UnsupportedCapabilityError,
} from "../src/dispatch/index.ts";
import {
	SessionCoordinator,
	type IAgentEngine,
	type PromptAdmissionReceipt,
	type PromptInput,
	type PromptExecutionOptions,
	type RunnerEvent,
	type SessionStateDTO,
	type SessionTranscriptDTO,
	type SessionStatsDTO,
	type SubagentPolicyRecord,
} from "@durable-zero/core";
import {
	StdioJsonRpcServer,
	JsonRpcMethodNotFoundError,
	JsonRpcInvalidParamsError,
} from "@durable-zero/protocol";

class TestAgentEngine implements IAgentEngine {
	public isStarted = false;
	public isClosed = false;
	public submissions: Array<{ input: PromptInput; options?: PromptExecutionOptions }> = [];
	public abortedConversations: string[] = [];
	public abortedTasks: number[] = [];
	public compactedInstructions: Array<string | undefined> = [];
	public subagentPolicies: SubagentPolicyRecord[] = [];
	public setModels: Array<{ provider: string; modelId: string }> = [];
	public thinkingLevels: string[] = [];
	public stateQueries: Array<string | undefined> = [];
	public transcriptQueries: Array<{ conversationId?: string; limit?: number }> = [];
	public statsQueries: Array<string | undefined> = [];
	private nextSubmissionId = 100;

	public async start(_sessionDir: string): Promise<void> {
		this.isStarted = true;
	}

	public async submit(
		input: PromptInput,
		options?: PromptExecutionOptions,
	): Promise<PromptAdmissionReceipt> {
		this.submissions.push({ input, options });
		const id = `sub_${this.nextSubmissionId++}`;
		return {
			status: "accepted",
			id,
			conversationId: options?.conversationId ?? "1",
		};
	}

	public async abort(conversationId?: string): Promise<void> {
		this.abortedConversations.push(conversationId ?? "1");
	}

	public async abortTask(taskId: number): Promise<void> {
		this.abortedTasks.push(taskId);
	}

	public async compact(instructions?: string): Promise<void> {
		this.compactedInstructions.push(instructions);
	}

	public async setSubagentPolicy(record: SubagentPolicyRecord): Promise<void> {
		this.subagentPolicies.push(record);
	}

	public async setModel(model: { provider: string; modelId: string }): Promise<void> {
		this.setModels.push(model);
	}

	public async setThinkingLevel(level: string): Promise<void> {
		this.thinkingLevels.push(level);
	}

	public async getState(conversationId?: string): Promise<SessionStateDTO> {
		this.stateQueries.push(conversationId);
		return {
			sessionId: "test-session",
			cwd: "/workspace",
			activeConversationId: conversationId ?? "1",
			activeModel: { provider: "test-prov", modelId: "test-model" },
			thinkingLevel: "high",
			models: [
				{ provider: "test-prov", modelId: "test-model", name: "Test Model", contextWindow: 64000 },
			],
			entryCount: 5,
		};
	}

	public async getTranscript(
		conversationId?: string,
		limit?: number,
	): Promise<SessionTranscriptDTO> {
		this.transcriptQueries.push({ conversationId, limit });
		return {
			conversationId: conversationId ?? "1",
			entries: [
				{ id: "e1", conversationId: conversationId ?? "1", kind: "prompt", role: "user", text: "hello" },
			],
		};
	}

	public async getStats(conversationId?: string): Promise<SessionStatsDTO> {
		this.statsQueries.push(conversationId);
		return {
			contextUsage: {
				tokens: 420,
				contextWindow: 128000,
			},
		};
	}

	public events(_listener: (event: RunnerEvent) => void): () => void {
		return () => {};
	}

	public async close(): Promise<void> {
		this.isClosed = true;
	}
}

function createTestHarness(handler: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
	const stdin = new Readable({ read() {} });
	let output = "";
	const stdout = new Writable({
		write(chunk, _enc, cb) {
			output += chunk.toString();
			cb();
		},
	});

	const server = new StdioJsonRpcServer({
		stdin,
		stdout,
		handler,
	});
	server.start();

	return {
		server,
		stdin,
		getLines: () =>
			output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean),
		clear: () => {
			output = "";
		},
		async send(req: Record<string, unknown>): Promise<any> {
			stdin.push(JSON.stringify(req) + "\n");
			await new Promise((r) => setTimeout(r, 40));
			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			output = "";
			if (lines.length === 0) return null;
			return JSON.parse(lines[lines.length - 1]);
		},
	};
}

describe("Capability Dispatcher (Task 4B) — Pure Unit & Protocol Transport", () => {
	let engine: TestAgentEngine;
	let coordinator: SessionCoordinator;
	let dispatcher: (method: string, params: Record<string, unknown>) => Promise<unknown>;

	beforeEach(async () => {
		engine = new TestAgentEngine();
		coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/tmp/test-dispatch-session",
		});
		await coordinator.start();
		dispatcher = createSessionDispatcher({ coordinator, engine });
	});

	describe("Unknown Method & Error Classification", () => {
		it("throws nominal JsonRpcMethodNotFoundError for unmapped method", async () => {
			await assert.rejects(
				async () => dispatcher("unknown/method", {}),
				(err: any) => {
					assert.ok(err instanceof JsonRpcMethodNotFoundError);
					assert.equal(err.code, -32601);
					assert.equal(err.method, "unknown/method");
					return true;
				},
			);
		});

		it("maps unmapped method to -32601 over protocol transport", async () => {
			const harness = createTestHarness(dispatcher);
			const resp = await harness.send({
				jsonrpc: "2.0",
				id: "req_unknown",
				method: "unknown/serviceMethod",
				params: {},
			});
			assert.equal(resp.id, "req_unknown");
			assert.equal(resp.error?.code, -32601);
			assert.equal(resp.error?.message, "Method not found: unknown/serviceMethod");
			harness.server.stop();
		});

		it("maps typed invalid params to -32602 over protocol transport", async () => {
			const harness = createTestHarness(dispatcher);
			const resp = await harness.send({
				jsonrpc: "2.0",
				id: "req_bad_prompt",
				method: "session/prompt",
				params: {},
			});
			assert.equal(resp.id, "req_bad_prompt");
			assert.equal(resp.error?.code, -32602);
			assert.ok(resp.error?.message.includes("content"));
			harness.server.stop();
		});
	});

	describe("session/prompt, session/steer, session/followUp", () => {
		it("session/prompt: string content forwards to coordinator and engine", async () => {
			const res = (await dispatcher("session/prompt", {
				content: "hello sovereign world",
			})) as PromptAdmissionReceipt;

			assert.equal(res.status, "accepted");
			assert.equal(res.conversationId, "1");
			assert.equal(engine.submissions.length, 1);
			assert.equal(engine.submissions[0].input, "hello sovereign world");
			assert.equal(engine.submissions[0].options?.deliverAs, "followUp");
			assert.equal(engine.submissions[0].options?.conversationId, undefined);
		});

		it("session/prompt: images-only prompt accepted and forwarded without dummy text", async () => {
			const images = [
				{ type: "image" as const, data: "base64pngdata==", mimeType: "image/png" },
			];
			const res = (await dispatcher("session/prompt", {
				content: images,
			})) as PromptAdmissionReceipt;

			assert.equal(res.status, "accepted");
			assert.equal(engine.submissions.length, 1);
			assert.deepEqual(engine.submissions[0].input, images);
		});

		it("session/prompt: mixed text and image content parts forwarded", async () => {
			const parts = [
				{ type: "text" as const, text: "inspect this image" },
				{ type: "image" as const, data: "rawjpegdata==", mimeType: "image/jpeg" },
			];
			const res = (await dispatcher("session/prompt", {
				content: parts,
			})) as PromptAdmissionReceipt;

			assert.equal(res.status, "accepted");
			assert.equal(engine.submissions.length, 1);
			assert.deepEqual(engine.submissions[0].input, parts);
		});

		it("session/prompt: legacy params (message + images) normalized and forwarded", async () => {
			const images = [
				{ type: "image" as const, data: "legacyimg==", mimeType: "image/webp" },
			];
			const res = (await dispatcher("session/prompt", {
				message: "legacy text message",
				images,
			})) as PromptAdmissionReceipt;

			assert.equal(res.status, "accepted");
			assert.equal(engine.submissions.length, 1);
			assert.deepEqual(engine.submissions[0].input, [
				{ type: "text", text: "legacy text message" },
				...images,
			]);
		});

		it("session/prompt: forwards conversationId and deliverAs", async () => {
			await dispatcher("session/prompt", {
				content: "child prompt",
				conversationId: "42",
				deliverAs: "steer",
			});

			assert.equal(engine.submissions.length, 1);
			assert.equal(engine.submissions[0].options?.conversationId, "42");
			assert.equal(engine.submissions[0].options?.deliverAs, "steer");
		});

		it("session/prompt: normalizes numeric conversationId to string (e.g. 1 -> '1', 42 -> '42')", async () => {
			await dispatcher("session/prompt", {
				content: "numeric conv prompt",
				conversationId: 42,
			});

			assert.equal(engine.submissions.length, 1);
			assert.equal(engine.submissions[0].options?.conversationId, "42");
		});

		it("session/prompt: rejects invalid conversationId (0, negative, non-digit)", async () => {
			await assert.rejects(
				async () => dispatcher("session/prompt", { content: "bad conv", conversationId: 0 }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/prompt", { content: "bad conv", conversationId: -5 }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/prompt", { content: "bad conv", conversationId: "abc" }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/prompt", { content: "bad conv", conversationId: "0" }),
				JsonRpcInvalidParamsError,
			);
		});

		it("session/prompt: rejects empty prompt with JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("session/prompt", { content: "   " }),
				(err: any) => {
					assert.ok(err instanceof JsonRpcInvalidParamsError);
					return true;
				},
			);
		});

		it("session/steer: forces deliverAs: 'steer'", async () => {
			await dispatcher("session/steer", {
				content: "steer immediately",
				conversationId: "42",
			});

			assert.equal(engine.submissions.length, 1);
			assert.equal(engine.submissions[0].input, "steer immediately");
			assert.equal(engine.submissions[0].options?.deliverAs, "steer");
			assert.equal(engine.submissions[0].options?.conversationId, "42");
		});

		it("session/followUp: forces deliverAs: 'followUp'", async () => {
			await dispatcher("session/followUp", {
				content: "queue follow-up task",
			});

			assert.equal(engine.submissions.length, 1);
			assert.equal(engine.submissions[0].options?.deliverAs, "followUp");
		});
	});

	describe("session/abort, session/abortTask, session/compact", () => {
		it("session/abort: calls coordinator.abort for root", async () => {
			const res = await dispatcher("session/abort", {});
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.abortedConversations, ["1"]);
			assert.equal(coordinator.isAborted, true);
		});

		it("session/abort: forwards child conversationId string", async () => {
			await dispatcher("session/abort", { conversationId: "7" });
			assert.deepEqual(engine.abortedConversations, ["7"]);
		});

		it("session/abort: normalizes positive numeric conversationId to string (e.g. 12345 -> '12345')", async () => {
			await dispatcher("session/abort", { conversationId: 12345 });
			assert.deepEqual(engine.abortedConversations, ["12345"]);
		});

		it("session/abort: invalid conversationId (0, -1, 'abc', '0') throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("session/abort", { conversationId: 0 }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/abort", { conversationId: -1 }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/abort", { conversationId: "abc" }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/abort", { conversationId: "0" }),
				JsonRpcInvalidParamsError,
			);
		});

		it("session/abortTask: forwards positive integer taskId to engine.abortTask", async () => {
			const res = await dispatcher("session/abortTask", { taskId: 42 });
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.abortedTasks, [42]);
		});

		it("session/abortTask: missing or non-positive taskId throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("session/abortTask", {}),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/abortTask", { taskId: -5 }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("session/abortTask", { taskId: "42" }),
				JsonRpcInvalidParamsError,
			);
		});

		it("session/compact: forwards optional instructions to engine.compact", async () => {
			const res = await dispatcher("session/compact", { instructions: "custom summary" });
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.compactedInstructions, ["custom summary"]);

			await dispatcher("session/compact", {});
			assert.deepEqual(engine.compactedInstructions, ["custom summary", undefined]);
		});

		it("session/compact: non-string instructions throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("session/compact", { instructions: 999 }),
				JsonRpcInvalidParamsError,
			);
		});
	});

	describe("subagent/setPolicy & session/setSubagentPolicy", () => {
		it("subagent/setPolicy: forwards valid policy record to coordinator", async () => {
			const policy: SubagentPolicyRecord = {
				version: 1,
				revision: 1,
				policy: { mode: "inherit" },
			};
			const res = await dispatcher("subagent/setPolicy", { policyRecord: policy });
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.subagentPolicies, [policy]);
		});

		it("session/setSubagentPolicy: alias functions identically", async () => {
			const policy: SubagentPolicyRecord = {
				version: 1,
				revision: 2,
				policy: {
					mode: "configured",
					configuredProfile: {
						model: { provider: "anthropic", modelId: "claude-3-5-sonnet" },
						thinkingLevel: "high",
					},
				},
			};
			const res = await dispatcher("session/setSubagentPolicy", { record: policy });
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.subagentPolicies, [policy]);
		});

		it("subagent/setPolicy: invalid policy record throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("subagent/setPolicy", { policyRecord: "not an object" }),
				JsonRpcInvalidParamsError,
			);
		});
	});

	describe("models/list, models/set, models/setThinking", () => {
		it("models/list: returns models array from engine state", async () => {
			const res = (await dispatcher("models/list", {})) as { models: any[] };
			assert.ok(Array.isArray(res.models));
			assert.equal(res.models.length, 1);
			assert.equal(res.models[0].modelId, "test-model");
		});

		it("models/set: forwards provider and modelId to engine.setModel", async () => {
			const res = await dispatcher("models/set", {
				provider: "anthropic",
				modelId: "claude-3-5-sonnet",
			});
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.setModels, [
				{ provider: "anthropic", modelId: "claude-3-5-sonnet" },
			]);
		});

		it("models/set: missing provider or modelId throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("models/set", { provider: "anthropic" }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("models/set", { modelId: "m1" }),
				JsonRpcInvalidParamsError,
			);
		});

		it("models/setThinking: forwards valid level to engine.setThinkingLevel", async () => {
			const res = await dispatcher("models/setThinking", { level: "high" });
			assert.deepEqual(res, { ok: true });
			assert.deepEqual(engine.thinkingLevels, ["high"]);
		});

		it("models/setThinking: invalid thinking level throws JsonRpcInvalidParamsError", async () => {
			await assert.rejects(
				async () => dispatcher("models/setThinking", { level: "extreme" }),
				JsonRpcInvalidParamsError,
			);
			await assert.rejects(
				async () => dispatcher("models/setThinking", {}),
				JsonRpcInvalidParamsError,
			);
		});
	});

	describe("session/getState, session/getTranscript, session/getStats", () => {
		it("session/getState: returns SessionStateDTO and normalizes numeric conversationId", async () => {
			const state = (await dispatcher("session/getState", {
				conversationId: 5,
			})) as SessionStateDTO;

			assert.equal(state.sessionId, "test-session");
			assert.equal(state.activeConversationId, "5");
			assert.deepEqual(engine.stateQueries, ["5"]);
		});

		it("session/getTranscript: returns SessionTranscriptDTO and normalizes numeric conversationId", async () => {
			const transcript = (await dispatcher("session/getTranscript", {
				conversationId: 5,
				limit: 10,
			})) as SessionTranscriptDTO;

			assert.equal(transcript.conversationId, "5");
			assert.equal(transcript.entries.length, 1);
			assert.deepEqual(engine.transcriptQueries, [{ conversationId: "5", limit: 10 }]);
		});

		it("session/getStats: returns SessionStatsDTO and normalizes numeric conversationId", async () => {
			const stats = (await dispatcher("session/getStats", {
				conversationId: 1,
			})) as SessionStatsDTO;

			assert.equal(stats.contextUsage.tokens, 420);
			assert.equal(stats.contextUsage.contextWindow, 128000);
			assert.deepEqual(engine.statsQueries, ["1"]);
		});
	});

	describe("Unsupported Capabilities Policy (Anti-Fake / Missing Seams)", () => {
		it("refuses binding/register with UnsupportedCapabilityError documenting missing seam", async () => {
			await assert.rejects(
				async () => dispatcher("binding/register", { threadId: "thr_1", conversationId: 1 }),
				(err: any) => {
					assert.ok(err instanceof UnsupportedCapabilityError);
					assert.equal(err.capability, "binding/register");
					assert.ok(err.missingSeam.includes("binding"));
					return true;
				},
			);
		});

		it("refuses binding/list with UnsupportedCapabilityError documenting missing seam", async () => {
			await assert.rejects(
				async () => dispatcher("binding/list", {}),
				(err: any) => {
					assert.ok(err instanceof UnsupportedCapabilityError);
					assert.equal(err.capability, "binding/list");
					assert.ok(err.missingSeam.includes("binding"));
					return true;
				},
			);
		});

		it("refuses session/fork with UnsupportedCapabilityError documenting missing seam", async () => {
			await assert.rejects(
				async () => dispatcher("session/fork", { sourceDir: "/a", targetDir: "/b" }),
				(err: any) => {
					assert.ok(err instanceof UnsupportedCapabilityError);
					assert.equal(err.capability, "session/fork");
					assert.ok(err.missingSeam.includes("fork"));
					return true;
				},
			);
		});

		it("refuses tools/register with UnsupportedCapabilityError documenting missing seam", async () => {
			await assert.rejects(
				async () => dispatcher("tools/register", { tools: [] }),
				(err: any) => {
					assert.ok(err instanceof UnsupportedCapabilityError);
					assert.equal(err.capability, "tools/register");
					assert.ok(err.missingSeam.includes("tool"));
					return true;
				},
			);
		});

		it("maps unsupported capabilities to -32603 internal error over protocol without fake success", async () => {
			const harness = createTestHarness(dispatcher);
			const resp = await harness.send({
				jsonrpc: "2.0",
				id: "req_unsupported",
				method: "binding/register",
				params: { threadId: "thr_123", conversationId: 1 },
			});

			assert.equal(resp.id, "req_unsupported");
			assert.equal(resp.result, undefined, "Must not return fake success receipt");
			assert.equal(resp.error?.code, -32603);
			assert.ok(resp.error?.message.includes("unsupported"));
			harness.server.stop();
		});
	});
});
