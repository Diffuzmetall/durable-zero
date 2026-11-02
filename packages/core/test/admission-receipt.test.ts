import test from "node:test";
import assert from "node:assert/strict";
import { openDurable } from "../src/runtime.ts";
import type { AdmissionReceipt } from "../src/runtime-types.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

test("controller.submit returns atomic AdmissionReceipt upon input admission", { timeout: 25000 }, async () => {
	const sessionDir = mkdtempSync(join(tmpdir(), "pi-admission-receipt-test-"));
	let instance: any;

	try {
		instance = await openDurable({
			sessionDir,
			cli: { noGlobalExtensions: true },
		});

		const receipt: AdmissionReceipt = await instance.controller.submit("Hello world", "followUp");

		assert.ok(receipt, "submit must return a truthy admission receipt");
		assert.equal(receipt.status, "accepted");
		assert.equal(typeof receipt.requestId, "string");
		assert.ok(receipt.requestId.length > 0);
		assert.equal(typeof receipt.conversationId, "string");
		assert.ok(receipt.conversationId.length > 0);
		if (receipt.sequence !== undefined) {
			assert.equal(typeof receipt.sequence, "number");
		}
	} finally {
		await instance?.close();
		rmSync(sessionDir, { recursive: true, force: true });
	}
});
