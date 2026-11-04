import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session/coordinator.ts";
import { MemorySessionStore } from "./mocks/memory-session-store.ts";
import { MockAgentEngine } from "./mocks/mock-agent-engine.ts";
import type { IModelProvider } from "../src/models/provider.ts";

describe("SessionCoordinator (AP-010, AP-012, AP-074, AP-076)", () => {
	it("coordinates session lifecycle: lock, prompt admission, abort cascade, and release", async () => {
		const store = new MemorySessionStore();
		const engine = new MockAgentEngine();
		const mockModelProvider: IModelProvider = {
			resolveModel: async () => ({ model: { provider: "mock", modelId: "mock-v1" } }),
			getAvailableModels: async () => [{ provider: "mock", modelId: "mock-v1" }],
		};

		const coordinator = new SessionCoordinator({
			engine,
			store,
			modelProvider: mockModelProvider,
		});

		assert.equal(store.isLocked, false);
		assert.equal(engine.isStarted, false);
		await coordinator.start();
		assert.equal(store.isLocked, true);
		assert.equal(engine.isStarted, true);

		const events: unknown[] = [];
		const unsubscribe = coordinator.events((e) => events.push(e));

		const receipt = await coordinator.prompt("Hello sovereign agent");
		assert.equal(receipt.status, "accepted");
		assert.equal(receipt.id, "sub_1");
		assert.equal(engine.submissions.length, 1);

		await coordinator.abort();
		assert.equal(coordinator.isAborted, true);
		assert.equal(engine.abortedConversations.length, 1);
		assert.ok(events.some((e: any) => e.type === "session/aborted"));

		unsubscribe();

		await coordinator.close();
		assert.equal(store.isLocked, false);
		assert.equal(engine.isClosed, true);
	});

	it("fails fast when prompt is called on aborted session", async () => {
		const store = new MemorySessionStore();
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({ engine, store });
		await coordinator.start();
		await coordinator.abort();

		await assert.rejects(
			async () => coordinator.prompt("should fail"),
			(err: Error) => {
				assert.match(err.message, /aborted/i);
				return true;
			},
		);
		await coordinator.close();
	});

	it("fails fast when prompt is called before start() (Defect 2)", async () => {
		const store = new MemorySessionStore();
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({ engine, store });

		await assert.rejects(
			async () => coordinator.prompt("prompt before start"),
			{
				name: "SessionError",
				message: "Session is not started. Call start() before submitting prompts",
			},
		);
	});

	it("fails fast when prompt is called after close() (Defect 1)", async () => {
		const store = new MemorySessionStore();
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({ engine, store });
		await coordinator.start();
		await coordinator.close();

		await assert.rejects(
			async () => coordinator.prompt("prompt after close"),
			{
				name: "SessionError",
				message: "Session is closed",
			},
		);
	});
});
