import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCoordinator } from "../src/session/coordinator.ts";
import { MockAgentEngine } from "./mocks/mock-agent-engine.ts";

describe("FND-T1-01: SessionCoordinator Turn Abort Semantics", () => {
	it("root abort cancels active turn without permanently disabling the session", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});
		await coordinator.start();

		// Prompt 1
		const r1 = await coordinator.prompt("Turn 1 prompt");
		assert.equal(r1.status, "accepted");

		// Cancel active turn
		await coordinator.abort();
		assert.equal(engine.abortedConversations.length, 1);
		assert.equal(engine.abortedConversations[0], "1"); // root abort

		// Turn 2 MUST be accepted (session is not permanently poisoned)
		const r2 = await coordinator.prompt("Turn 2 prompt after abort");
		assert.equal(r2.status, "accepted");
		assert.equal(r2.id, "sub_2");
		assert.equal(engine.submissions.length, 2);

		await coordinator.close();
	});

	it("child abort cancels target child conversation without poisoning root", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});
		await coordinator.start();

		// Abort child conversation
		await coordinator.abort("child_conv_99");
		assert.equal(engine.abortedConversations.length, 1);
		assert.equal(engine.abortedConversations[0], "child_conv_99");

		// Root prompt is accepted immediately
		const r = await coordinator.prompt("Root prompt after child abort");
		assert.equal(r.status, "accepted");
		assert.equal(engine.submissions.length, 1);

		await coordinator.close();
	});

	it("abort rejects if called before start() or after close()", async () => {
		const engine = new MockAgentEngine();
		const coordinator = new SessionCoordinator({
			engine,
			sessionDir: "/test/session",
		});

		await assert.rejects(
			async () => coordinator.abort(),
			/not started/i,
		);

		await coordinator.start();
		await coordinator.close();

		await assert.rejects(
			async () => coordinator.abort(),
			/closed/i,
		);
	});
});
