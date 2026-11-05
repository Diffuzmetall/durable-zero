import test from "node:test";
import assert from "node:assert/strict";
import { createCodingRegistry } from "../src/engine/harness-setup.ts";
import type { BuiltinExtension } from "../src/engine/builtin-extensions/types.ts";
import { defineExtension } from "@earendil-works/pi-durable";

test("BuiltinExtension wiring: createCodingRegistry initializes custom builtins alongside native tools", { timeout: 3000 }, async () => {
	let customPluginInitialized = false;

	const customPlugin: BuiltinExtension = {
		id: "custom-test-plugin",
		name: "Custom Test Plugin",
		version: "1.0.0",
		register(ctx) {
			customPluginInitialized = true;
			ctx.registry?.install(defineExtension({ name: "custom-test-ext" }));
		},
	};

	const mockSettingsManager: any = {
		getDefaultProvider: () => "test",
		getDefaultModel: () => "model",
		getDefaultThinkingLevel: () => "off",
		getGlobalSettings: () => ({}),
		getProjectSettings: () => ({}),
	};

	const registry = await createCodingRegistry(
		mockSettingsManager,
		"/tmp",
		() => ({ version: 1 as const, revision: 0, policy: { mode: "inherit" as const } }),
		undefined,
		undefined,
		[customPlugin],
	);

	assert.equal(customPluginInitialized, true, "custom register side effect must be executed");
	const snapshot = registry.snapshot();
	const customExt = snapshot.extension("custom-test-ext");
	assert.ok(customExt, "custom native extension must be installed in registry");
	const subagentTool = snapshot.tools().find((t) => t.tool.name === "subagent");
	assert.ok(subagentTool, "built-in subagent tool must still be retained");
});
