import type { IModelProvider, ModelRef } from "@durable-zero/core";
import {
	type ModelRuntime,
	type SettingsManager,
	resolveCliModel,
} from "@earendil-works/pi-coding-agent";

export interface ModelProviderResolveOptions {
	provider?: string;
	model?: string;
	thinking?: string;
}

export class PiAiModelProvider implements IModelProvider {
	readonly #modelRuntime: ModelRuntime;
	readonly #settingsManager: SettingsManager | undefined;

	constructor(modelRuntime: ModelRuntime, settingsManager?: SettingsManager) {
		this.#modelRuntime = modelRuntime;
		this.#settingsManager = settingsManager;
	}

	get modelRuntime(): ModelRuntime {
		return this.#modelRuntime;
	}

	get settingsManager(): SettingsManager | undefined {
		return this.#settingsManager;
	}

	async getAvailableModels(): Promise<ModelRef[]> {
		const models = this.#modelRuntime.getAvailableSnapshot();
		return models.map((m) => ({
			provider: m.provider,
			modelId: m.id,
		}));
	}

	async resolveModel(ref?: ModelProviderResolveOptions): Promise<{ model?: ModelRef; thinkingLevel?: string }> {
		if (ref?.model !== undefined) {
			const resolved = resolveCliModel({
				cliProvider: ref.provider,
				cliModel: ref.model,
				modelRuntime: this.#modelRuntime,
			});
			if (resolved.error !== undefined || resolved.model === undefined) {
				throw new Error(`Could not resolve model: ${resolved.error ?? ref.model}`);
			}
			return {
				model: { provider: resolved.model.provider, modelId: resolved.model.id },
				thinkingLevel: ref.thinking ?? (resolved.thinkingLevel as string | undefined) ?? "off",
			};
		}

		const defaultProvider = this.#settingsManager?.getDefaultProvider?.();
		const defaultModelId = this.#settingsManager?.getDefaultModel?.();
		const defaultThinkingLevel = this.#settingsManager?.getDefaultThinkingLevel?.();

		if (defaultProvider && defaultModelId) {
			const models = this.#modelRuntime.getAvailableSnapshot();
			const matched = models.find((m) => m.provider === defaultProvider && m.id === defaultModelId);
			if (matched) {
				return {
					model: { provider: matched.provider, modelId: matched.id },
					thinkingLevel: defaultThinkingLevel ?? "off",
				};
			}
		}

		const available = this.#modelRuntime.getAvailableSnapshot();
		if (available.length > 0) {
			return {
				model: { provider: available[0].provider, modelId: available[0].id },
				thinkingLevel: "off",
			};
		}

		return {};
	}
}
