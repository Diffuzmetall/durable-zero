import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session/coordinator.ts";
import { MockAgentEngine } from "./mocks/mock-agent-engine.ts";

describe("SessionCoordinator (AP-010, AP-012, AP-074, AP-076, FND-T1-01, FND-T1-08)", () => {
	it("coordinates session lifecycle: engine-owned physical lock, prompt admission, abort, and release", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});

		assert.equal(engine.isStarted, false);
		await coordinator.start();
		assert.equal(engine.isStarted, true);
		assert.equal(engine.sessionDir, "/test/session");

		const events: unknown[] = [];
		const unsubscribe = coordinator.events((e) => events.push(e));

		const receipt = await coordinator.prompt("Hello sovereign agent");
		assert.equal(receipt.status, "accepted");
		assert.equal(receipt.id, "sub_1");
		assert.equal(engine.submissions.length, 1);

		// Abort active turn: cancels active turn, emits event, and session remains usable
		await coordinator.abort();
		assert.equal(engine.abortedConversations.length, 1);
		assert.ok(events.some((e: any) => e.type === "session/aborted"));

		// Subsequent prompt is accepted (not permanently aborted)
		const receipt2 = await coordinator.prompt("Second prompt after abort");
		assert.equal(receipt2.status, "accepted");
		assert.equal(receipt2.id, "sub_2");

		unsubscribe();

		await coordinator.close();
		assert.equal(engine.isClosed, true);
	});

	it("fails fast when prompt is called before start() (Defect 2)", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});

		await assert.rejects(
			async () => coordinator.prompt("prompt before start"),
			{
				name: "SessionError",
				message: "Session is not started. Call start() before submitting prompts",
			},
		);
	});

	it("fails fast when prompt is called after close() (Defect 1)", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});
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
