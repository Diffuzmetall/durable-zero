import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session/coordinator.ts";
import { MemorySessionStore } from "./mocks/memory-session-store.ts";
import type { IModelProvider } from "../src/models/provider.ts";

describe("SessionCoordinator (AP-010, AP-012, AP-074)", () => {
	it("coordinates session lifecycle: lock, prompt admission, abort cascade, and release", async () => {
		const store = new MemorySessionStore();
		const mockModelProvider: IModelProvider = {
			resolveModel: async () => ({ model: { provider: "mock", modelId: "mock-v1" } }),
			getAvailableModels: async () => [{ provider: "mock", modelId: "mock-v1" }],
		};

		const coordinator = new SessionCoordinator({
			store,
			modelProvider: mockModelProvider,
		});

		assert.equal(store.isLocked, false);
		await coordinator.start();
		assert.equal(store.isLocked, true);

		const events: unknown[] = [];
		const unsubscribe = coordinator.events((e) => events.push(e));

		const receipt = await coordinator.prompt("Hello sovereign agent");
		assert.equal(receipt.status, "accepted");
		assert.ok(receipt.id);

		await coordinator.abort();
		assert.equal(coordinator.isAborted, true);
		assert.ok(events.some((e: any) => e.type === "session/aborted"));

		unsubscribe();

		await coordinator.close();
		assert.equal(store.isLocked, false);
	});

	it("fails fast when prompt is called on aborted session", async () => {
		const store = new MemorySessionStore();
		const coordinator = new SessionCoordinator({ store });
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
		const coordinator = new SessionCoordinator({ store });

		await assert.rejects(
			async () => coordinator.prompt("prompt before start"),
			{
				name: "Error",
				message: "Session is not started. Call start() before submitting prompts",
			},
		);
	});

	it("fails fast when prompt is called after close() (Defect 1)", async () => {
		const store = new MemorySessionStore();
		const coordinator = new SessionCoordinator({ store });
		await coordinator.start();
		await coordinator.close();

		await assert.rejects(
			async () => coordinator.prompt("prompt after close"),
			{
				name: "Error",
				message: "Session is closed",
			},
		);
	});
});
