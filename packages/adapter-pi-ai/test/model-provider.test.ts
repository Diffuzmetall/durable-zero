import test from "node:test";
import assert from "node:assert/strict";
import { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { PiAiModelProvider } from "../src/model-provider.ts";
import type { IModelProvider } from "@durable-zero/core";

test("PiAiModelProvider implements IModelProvider with explicit dependency injection", async () => {
	const runtime = await ModelRuntime.create();
	const provider: IModelProvider = new PiAiModelProvider(runtime);

	assert.ok(provider, "PiAiModelProvider must be instantiated");
	assert.equal(typeof provider.resolveModel, "function");
	assert.equal(typeof provider.getAvailableModels, "function");
});

test("PiAiModelProvider lists available models from native ModelRuntime", async () => {
	const runtime = await ModelRuntime.create();
	const provider = new PiAiModelProvider(runtime);

	const models = await provider.getAvailableModels();
	assert.ok(Array.isArray(models), "Models must be an array");
	assert.ok(models.length > 0, "Native runtime must provide registered models");
	assert.ok(models[0].provider, "ModelRef must contain provider");
	assert.ok(models[0].modelId, "ModelRef must contain modelId");
});

test("PiAiModelProvider resolves valid model by id and normalizes model reference", async () => {
	const runtime = await ModelRuntime.create();
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
});

test("PiAiModelProvider resolves model when provider is omitted or prefixed in model string", async () => {
	const runtime = await ModelRuntime.create();
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
});

test("PiAiModelProvider fails fast when model cannot be resolved", async () => {
	const runtime = await ModelRuntime.create();
	const provider = new PiAiModelProvider(runtime);

	await assert.rejects(
		async () => {
			await provider.resolveModel({ model: "non-existent-hypothetical-model-xyz-123" });
		},
		{
			message: /Could not resolve model/,
		},
	);
});

test("PiAiModelProvider resolves fallback model when ref is undefined", async () => {
	const runtime = await ModelRuntime.create();
	const provider = new PiAiModelProvider(runtime);
	const available = runtime.getAvailableSnapshot();

	const result = await provider.resolveModel();
	assert.ok(result.model, "Default model must be returned when ref is undefined");
	assert.equal(result.model?.provider, available[0].provider);
	assert.equal(result.model?.modelId, available[0].id);
	assert.equal(result.thinkingLevel, "off");
});
