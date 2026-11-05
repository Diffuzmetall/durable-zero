import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCliArgs } from "../../../../../../../../packages/runner/src/cli-args.ts";
import { projectTaskState, projectTaskReceipt } from "../../../../../../../../packages/contracts/src/runtime-graph/status.ts";
import { JsonRpcMethodNotFoundError } from "../../../../../../../../packages/protocol/src/jsonrpc/errors.ts";
import { createSessionDispatcher } from "../../../../../../../../packages/runner/src/dispatch/session-dispatcher.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Type Remediation B (Runner Foundation) Independent Semantic Probes", () => {
	it("Probe 1: parseCliArgs produces valid DTO and handles trailing flags without crashing", () => {
		const parsed = parseCliArgs([
			"--session", "sess_123",
			"--cwd", "/test/workspace",
			"--provider", "anthropic",
			"--model", "claude-3-7-sonnet",
			"--thinking", "high",
			"--no-session",
			"--continue",
			"--no-global-extensions",
			"--extension", "ext_a",
			"--skills", "skill_b",
		]);

		assert.equal(parsed.session, "sess_123");
		assert.equal(parsed.cwd, "/test/workspace");
		assert.equal(parsed.provider, "anthropic");
		assert.equal(parsed.model, "claude-3-7-sonnet");
		assert.equal(parsed.thinking, "high");
		assert.equal(parsed.noSession, true);
		assert.equal(parsed.continueSession, true);
		assert.equal(parsed.noGlobalExtensions, true);
		assert.equal(parsed.extension, "ext_a");
		assert.deepEqual(parsed.extensions, ["ext_a"]);
		assert.deepEqual(parsed.skills, ["skill_b"]);

		// Test malformed trailing flag without value
		const trailing = parseCliArgs(["--session"]);
		assert.equal(trailing.session, undefined);
		assert.equal(Object.prototype.hasOwnProperty.call(trailing, "session"), false);
	});

	it("Probe 2: Contracts projectTaskState and projectTaskReceipt omit undefined keys under exactOptionalPropertyTypes", () => {
		const pendingState = projectTaskState({
			state: { status: "pending" },
		});
		assert.equal(pendingState.isFinal, false);
		assert.equal(pendingState.label, "Queued");
		// Under exactOptionalPropertyTypes, absent keys must not exist on the object
		assert.equal("blockedReason" in pendingState, false);

		const receipt = projectTaskReceipt({
			taskId: 1,
			outcome: "completed",
			endedAt: 123456789,
		});
		assert.equal(receipt.isFinal, true);
		assert.equal(receipt.outcome, "completed");
		assert.equal(receipt.endedAt, 123456789);
		assert.equal("preview" in receipt, false);
		assert.equal("durationMs" in receipt, false);
	});

	it("Probe 3: JsonRpcMethodNotFoundError preserves nominal identity and optional method field", () => {
		const errWithoutMethod = new JsonRpcMethodNotFoundError();
		assert.equal(errWithoutMethod.code, -32601);
		assert.equal(errWithoutMethod.method, undefined);
		assert.ok(errWithoutMethod instanceof JsonRpcMethodNotFoundError);
		assert.ok(errWithoutMethod instanceof Error);

		const errWithMethod = new JsonRpcMethodNotFoundError("custom/method");
		assert.equal(errWithMethod.code, -32601);
		assert.equal(errWithMethod.method, "custom/method");
		assert.ok(errWithMethod.message.includes("custom/method"));
	});

	it("Probe 4: Root session/abort executes coordinator, engine, and emits session/aborted event without sticky boolean", async () => {
		const engine = {
			abortedConversations: [],
			async abort(convId) {
				this.abortedConversations.push(convId ?? "1");
			},
			async getState() { return { models: [] }; },
		};
		let eventFired = false;
		const coordinator = {
			async abort(convId) {
				await engine.abort(convId);
				this.emitEvent({ type: "session/aborted" });
			},
			emitEvent(ev) {
				if (ev?.type === "session/aborted") eventFired = true;
			},
		};

		const dispatcher = createSessionDispatcher({
			coordinator: coordinator,
			engine: engine,
		});

		const res = await dispatcher("session/abort", {});
		assert.deepEqual(res, { ok: true });
		assert.deepEqual(engine.abortedConversations, ["1"]);
		assert.equal(eventFired, true);
	});

	it("Probe 5: tsconfig.src.json enforces strict source typechecking across all packages", async () => {
		const configPath = path.resolve(__dirname, "../../../../../../../../tsconfig.src.json");
		const raw = await fs.readFile(configPath, "utf8");
		const parsed = JSON.parse(raw);

		assert.equal(parsed.compilerOptions.strict, true);
		assert.equal(parsed.compilerOptions.exactOptionalPropertyTypes, true);
		assert.equal(parsed.compilerOptions.noUncheckedIndexedAccess, true);
		assert.equal(parsed.compilerOptions.noEmit, true);
		assert.deepEqual(parsed.include, ["packages/*/src/**/*.ts"]);
		assert.ok(parsed.exclude.includes("**/test/**"));
		assert.ok(parsed.exclude.includes("**/dist/**"));
	});
});
