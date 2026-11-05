import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalNodeExecutionEnv } from "../src/adapters/local-node-env.ts";

describe("LocalNodeExecutionEnv", () => {
	it("fails fast with explicit error on empty argv array", async () => {
		const env = new LocalNodeExecutionEnv();
		const result = await env.exec([]);
		assert.equal(result.exitCode, 1);
		assert.equal(result.ok, false);
		assert.match(result.stderr, /Cannot execute empty command argv/);
	});

	it("executes real command process and captures stdout", async () => {
		const env = new LocalNodeExecutionEnv();
		const result = await env.exec([process.execPath, "-e", "console.log('process-ok')"]);
		assert.equal(result.exitCode, 0);
		assert.match(result.stdout, /process-ok/);
	});
});
