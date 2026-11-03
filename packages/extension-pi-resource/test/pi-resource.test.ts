import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPiResourceExtension } from "../src/index.ts";

describe("@durable-zero/extension-pi-resource (AP-073)", () => {
	it("creates a pure declarative native Pi Durable extension without self-installing", () => {
		const ext = createPiResourceExtension({
			cwd: process.cwd(),
			agentDir: "/tmp/fake-agent",
		});
		assert.equal(ext.name, "pi-resource");
		assert.ok(ext.configProvider);
		assert.equal(typeof ext.configProvider.getDefaultModel, "function");
		assert.equal(typeof ext.configProvider.getDefaultProvider, "function");
		assert.ok(ext.resourceLoader);
		assert.equal(typeof ext.resourceLoader.getSkills, "function");
	});
});
