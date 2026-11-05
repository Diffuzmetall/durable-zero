import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { parseCliArgs, assembleDurableZero, main } from "../src/index.ts";

describe("@durable-zero/runner Composition Root (AP-020, AP-073, AP-074)", () => {
	it("exports executable main function", () => {
		assert.equal(typeof main, "function");
	});

	it("parseCliArgs: parses --session, --cwd, --provider, --model, and --thinking flags", () => {
		const argv = [
			"--session",
			"sess_123",
			"--cwd",
			"/workspace/project",
			"--provider",
			"anthropic",
			"--model",
			"claude-3-5-sonnet",
			"--thinking",
			"high",
		];
		const parsed = parseCliArgs(argv);
		assert.equal(parsed.session, "sess_123");
		assert.equal(parsed.cwd, "/workspace/project");
		assert.equal(parsed.provider, "anthropic");
		assert.equal(parsed.model, "claude-3-5-sonnet");
		assert.equal(parsed.thinking, "high");
	});

	it("assembleDurableZero: assembles coordinator, streams session/event notifications, and safely closes", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-runner-test-"));
		const notifications: Array<{ method: string; params: Record<string, unknown> }> = [];

		const stdin = new Readable({ read() {} });
		let stdoutBuffer = "";
		const stdout = new Writable({
			write(chunk, _enc, cb) {
				stdoutBuffer += chunk.toString();
				cb();
			},
		});

		const { MockAgentEngine } = await import("../../core/test/mocks/mock-agent-engine.ts");
		const engine = new MockAgentEngine();
		const instance = await assembleDurableZero({
			cwd: tempDir,
			sessionDir: tempDir,
			engine,
			stdin,
			stdout,
			onNotification: (method, params) => {
				notifications.push({ method, params });
			},
		});

		try {
			assert.ok(instance.coordinator, "SessionCoordinator must be created");
			assert.ok(instance.engine, "IAgentEngine must be assembled");
			assert.ok(instance.server, "StdioJsonRpcServer must be assembled");
			assert.equal(typeof instance.close, "function");

			assert.equal(instance.coordinator.isStarted, true);

			// Test notification streaming from coordinator to onNotification and server
			instance.coordinator.emitEvent({ type: "agent/chunk", text: "hello sovereign" });
			assert.equal(notifications.length, 1);
			assert.equal(notifications[0].method, "session/event");
			assert.deepEqual(notifications[0].params, {
				event: { type: "agent/chunk", text: "hello sovereign" },
			});

			// Verify server wire output also received the notification
			assert.ok(stdoutBuffer.includes("session/event"), "stdout must contain session/event notification");
			assert.ok(stdoutBuffer.includes("hello sovereign"), "stdout must contain event payload");

			// Test prompt admission via coordinator
			const receipt = await instance.coordinator.prompt("execute task");
			assert.equal(receipt.status, "accepted");
			assert.ok(receipt.id);

			// Test abort cascade
			await instance.coordinator.abort();
			assert.ok(notifications.some((n) => (n.params.event as any)?.type === "session/aborted"));

			// Safe close
			await instance.close();
			assert.equal(instance.coordinator.isClosed, true);

			// Subsequent calls after close fail-fast (AP-012)
			await assert.rejects(
				async () => instance.coordinator.prompt("fail after close"),
				/Session is closed/i,
			);
		} finally {
			try {
				await instance.close();
			} catch {
				// safe double close
			}
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
