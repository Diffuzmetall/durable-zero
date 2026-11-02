import test from "node:test";
import assert from "node:assert/strict";
import { openDurable } from "../src/runtime.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

test("openDurable calls beforeResume hook strictly before harness.resume", { timeout: 25000 }, async () => {
	const sessionDir = mkdtempSync(join(tmpdir(), "pi-before-resume-test-"));
	const executionOrder: string[] = [];
	let beforeResumeFinished = false;
	let instance: any;

	try {
		instance = await openDurable({
			sessionDir,
			cli: { noGlobalExtensions: true },
			beforeResume: async (harness) => {
				executionOrder.push("beforeResume:start");
				assert.ok(harness, "harness must be passed to beforeResume hook");
				const originalResume = harness.resume;
				harness.resume = function () {
					assert.equal(beforeResumeFinished, true, "harness.resume must be called strictly after beforeResume completes");
					executionOrder.push("harness:resume");
					return originalResume.apply(this, arguments as any);
				};
				await new Promise((resolve) => setTimeout(resolve, 10));
				beforeResumeFinished = true;
				executionOrder.push("beforeResume:end");
			},
		});

		assert.ok(instance);
		assert.deepEqual(executionOrder, [
			"beforeResume:start",
			"beforeResume:end",
			"harness:resume",
		]);
	} finally {
		await instance?.close();
		rmSync(sessionDir, { recursive: true, force: true });
	}
});
