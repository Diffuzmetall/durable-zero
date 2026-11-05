import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { fauxProvider } from "@earendil-works/pi-ai";
import { PiAiModelProvider } from "../src/model-provider.ts";
import type { IModelProvider } from "@durable-zero/core";

function setupIsolatedTestEnvironment(): { tempDir: string; restore: () => void } {
	const tempDir = mkdtempSync(join(tmpdir(), "dz-model-prov-test-"));
	mkdirSync(join(tempDir, "home"), { recursive: true });
	mkdirSync(join(tempDir, "agent_dir"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_config"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_data"), { recursive: true });

	const originalEnv = {
		HOME: process.env.HOME,
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
		XDG_DATA_HOME: process.env.XDG_DATA_HOME,
		PI_AGENT_DIR: process.env.PI_AGENT_DIR,
		PI_ADDITIONAL_EXTENSIONS: process.env.PI_ADDITIONAL_EXTENSIONS,
	};

	process.env.HOME = join(tempDir, "home");
	process.env.XDG_CONFIG_HOME = join(tempDir, "xdg_config");
	process.env.XDG_DATA_HOME = join(tempDir, "xdg_data");
	process.env.PI_AGENT_DIR = join(tempDir, "agent_dir");
	delete process.env.PI_ADDITIONAL_EXTENSIONS;

	const restore = () => {
		if (originalEnv.HOME !== undefined) process.env.HOME = originalEnv.HOME;
		else delete process.env.HOME;
		if (originalEnv.XDG_CONFIG_HOME !== undefined) process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
		else delete process.env.XDG_CONFIG_HOME;
		if (originalEnv.XDG_DATA_HOME !== undefined) process.env.XDG_DATA_HOME = originalEnv.XDG_DATA_HOME;
		else delete process.env.XDG_DATA_HOME;
		if (originalEnv.PI_AGENT_DIR !== undefined) process.env.PI_AGENT_DIR = originalEnv.PI_AGENT_DIR;
		else delete process.env.PI_AGENT_DIR;
		if (originalEnv.PI_ADDITIONAL_EXTENSIONS !== undefined) process.env.PI_ADDITIONAL_EXTENSIONS = originalEnv.PI_ADDITIONAL_EXTENSIONS;
		else delete process.env.PI_ADDITIONAL_EXTENSIONS;
		rmSync(tempDir, { recursive: true, force: true });
	};

	return { tempDir, restore };
}

async function createDeterministicModelRuntime(): Promise<ModelRuntime> {
	const runtime = await ModelRuntime.create();
	const faux = fauxProvider({
		provider: "test-provider",
		models: [
			{ id: "test-model-1", name: "Test Model 1", reasoning: true },
			{ id: "test-model-2", name: "Test Model 2", reasoning: false },
		],
	});
	runtime.registerNativeProvider(faux.provider);
	await runtime.setRuntimeApiKey("test-provider", "fixture-fake-key");
	await runtime.refresh({ allowNetwork: false });
	return runtime;
}

test("PiAiModelProvider implements IModelProvider with explicit dependency injection", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider: IModelProvider = new PiAiModelProvider(runtime);

		assert.ok(provider, "PiAiModelProvider must be instantiated");
		assert.equal(typeof provider.resolveModel, "function");
		assert.equal(typeof provider.getAvailableModels, "function");
	} finally {
		restore();
	}
});

test("PiAiModelProvider lists available models from native ModelRuntime", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider = new PiAiModelProvider(runtime);

		const models = await provider.getAvailableModels();
		assert.ok(Array.isArray(models), "Models must be an array");
		assert.ok(models.length > 0, "Native runtime must provide registered models");
		assert.ok(models[0].provider, "ModelRef must contain provider");
		assert.ok(models[0].modelId, "ModelRef must contain modelId");
	} finally {
		restore();
	}
});

test("PiAiModelProvider resolves valid model by id and normalizes model reference", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider = new PiAiModelProvider(runtime);
		const available = runtime.getAvailableSnapshot();
		assert.ok(available.length > 0, "Runtime must have available models");

		const target = available[0];
		const result = await provider.resolveModel({
			provider: target.provider,
			model: target.id,
			thinking: "high",
		});

		assert.deepEqual(result.model, {
			provider: target.provider,
			modelId: target.id,
		});
		assert.equal(result.thinkingLevel, "high");
	} finally {
		restore();
	}
});

test("PiAiModelProvider resolves model when provider is omitted or prefixed in model string", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider = new PiAiModelProvider(runtime);
		const available = runtime.getAvailableSnapshot();
		const target = available[0];

		// Using composite provider/id string
		const composite = `${target.provider}/${target.id}`;
		const result = await provider.resolveModel({
			model: composite,
		});

		assert.deepEqual(result.model, {
			provider: target.provider,
			modelId: target.id,
		});
		assert.equal(result.thinkingLevel, "off");

		// Also test provider omitted
		const resultOmitted = await provider.resolveModel({
			model: target.id,
		});
		assert.deepEqual(resultOmitted.model, {
			provider: target.provider,
			modelId: target.id,
		});
		assert.equal(resultOmitted.thinkingLevel, "off");
	} finally {
		restore();
	}
});

test("PiAiModelProvider fails fast when model cannot be resolved", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider = new PiAiModelProvider(runtime);

		await assert.rejects(
			async () => {
				await provider.resolveModel({ model: "non-existent-hypothetical-model-xyz-123" });
			},
			{
				message: /Could not resolve model/,
			},
		);
	} finally {
		restore();
	}
});

test("PiAiModelProvider resolves fallback model when ref is undefined", async () => {
	const { restore } = setupIsolatedTestEnvironment();
	try {
		const runtime = await createDeterministicModelRuntime();
		const provider = new PiAiModelProvider(runtime);
		const available = runtime.getAvailableSnapshot();

		const result = await provider.resolveModel();
		assert.ok(result.model, "Default model must be returned when ref is undefined");
		assert.equal(result.model?.provider, available[0].provider);
		assert.equal(result.model?.modelId, available[0].id);
		assert.equal(result.thinkingLevel, "off");
	} finally {
		restore();
	}
});
