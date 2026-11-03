// packages/adapter-pi-ai/src/model-provider.ts
import {
  resolveCliModel
} from "@earendil-works/pi-coding-agent";
var PiAiModelProvider = class {
  #modelRuntime;
  #settingsManager;
  constructor(modelRuntime, settingsManager) {
    this.#modelRuntime = modelRuntime;
    this.#settingsManager = settingsManager;
  }
  get modelRuntime() {
    return this.#modelRuntime;
  }
  get settingsManager() {
    return this.#settingsManager;
  }
  async getAvailableModels() {
    const models = this.#modelRuntime.getAvailableSnapshot();
    return models.map((m) => ({
      provider: m.provider,
      modelId: m.id
    }));
  }
  async resolveModel(ref) {
    if (ref?.model !== void 0) {
      const resolved = resolveCliModel({
        cliProvider: ref.provider,
        cliModel: ref.model,
        modelRuntime: this.#modelRuntime
      });
      if (resolved.error !== void 0 || resolved.model === void 0) {
        throw new Error(`Could not resolve model: ${resolved.error ?? ref.model}`);
      }
      return {
        model: { provider: resolved.model.provider, modelId: resolved.model.id },
        thinkingLevel: ref.thinking ?? resolved.thinkingLevel ?? "off"
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
          thinkingLevel: defaultThinkingLevel ?? "off"
        };
      }
    }
    const available = this.#modelRuntime.getAvailableSnapshot();
    if (available.length > 0) {
      return {
        model: { provider: available[0].provider, modelId: available[0].id },
        thinkingLevel: "off"
      };
    }
    return {};
  }
};

// packages/adapter-pi-ai/src/model-setup.ts
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  getAgentDir,
  resolveModelScopeWithDiagnostics
} from "@earendil-works/pi-coding-agent";
async function setupRunnerModels(cwd, args) {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const modelRuntime = await ModelRuntime.create();
  const resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
  await resourceLoader.reload();
  const extensionsResult = resourceLoader.getExtensions();
  for (const { name, config } of extensionsResult.runtime.pendingProviderRegistrations) {
    try {
      modelRuntime.registerProvider(name, config);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register provider ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const { provider } of extensionsResult.runtime.pendingNativeProviderRegistrations) {
    try {
      modelRuntime.registerNativeProvider(provider);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register native provider ${provider?.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const { definition } of extensionsResult.runtime.pendingVirtualModelRegistrations) {
    try {
      modelRuntime.registerVirtualModel(definition);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register virtual model ${definition?.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  const availableModels = modelRuntime.getAvailableSnapshot();
  const enabledPatterns = settingsManager.getEnabledModels();
  const scopedScope = enabledPatterns && enabledPatterns.length > 0 ? await resolveModelScopeWithDiagnostics(enabledPatterns, modelRuntime) : void 0;
  const scopedModelList = scopedScope && scopedScope.scopedModels.length > 0 ? scopedScope.scopedModels.map((sm) => sm.model) : availableModels;
  const scopedModelIds = scopedModelList.map((m) => `${m.provider}/${m.id}`);
  const modelProvider = new PiAiModelProvider(modelRuntime, settingsManager);
  const initialAgent = await modelProvider.resolveModel(
    args.model ? { provider: args.provider, model: args.model, thinking: args.thinking } : void 0
  );
  const defaultModel = initialAgent.model ? modelRuntime.getModel(initialAgent.model.provider, initialAgent.model.modelId) ?? scopedModelList[0] : scopedModelList[0];
  const defaultModelId = defaultModel ? `${defaultModel.provider}/${defaultModel.id}` : void 0;
  const defaultThinkingLevel = initialAgent.thinkingLevel ?? "off";
  const modelScope = {
    scopedModelIds,
    defaultModelId
  };
  return {
    settingsManager,
    modelRuntime,
    scopedModelList,
    defaultModel,
    defaultThinkingLevel,
    modelScope
  };
}
export {
  PiAiModelProvider,
  setupRunnerModels
};
//# sourceMappingURL=index.js.map
