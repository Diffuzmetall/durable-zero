import type { Context } from "@earendil-works/chord";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
export type { ModelThinkingLevel };
import {
	createRegistry,
	type EnvTarget,
	type HarnessSettings,
	type ModelRef,
	type Registry,
} from "@earendil-works/pi-durable";
import { createToolSearchExtension } from "@earendil-works/pi-durable/tool-search";
import type { SubagentPolicyRecord, ExecutionEnvFactory, IExecutionEnvironment } from "@durable-zero/core";
import {
	type ModelRuntime,
	type SettingsManager,
	resolveCliModel,
} from "@earendil-works/pi-coding-agent";
import { createPiPrompt, type PromptOptions } from "./prompt.ts";
import type { DynamicCodemodeNamespaces } from "./codemode-namespaces.ts";
import { BuiltinExtensionRegistry } from "./builtin-extensions/registry.ts";
import { codingToolsExtension } from "./builtin-extensions/coding-tools.ts";
import { subagentsExtension } from "./builtin-extensions/subagents.ts";
import type { BuiltinExtension, BuiltinExtensionContext } from "./builtin-extensions/types.ts";

export function configureHarnessHttp(settingsManager: SettingsManager): void {
	const proxy = settingsManager.getGlobalSettings()?.httpProxy?.trim();
	if (proxy) {
		process.env.HTTP_PROXY ??= proxy;
		process.env.HTTPS_PROXY ??= proxy;
	}
}

export function createHarnessSettings(
	settingsManager: SettingsManager,
	getActiveModel?: () => { provider: string; modelId: string } | undefined,
): HarnessSettings {
	return {
		get stream() {
			const provider = settingsManager.getProviderRetrySettings?.() ?? {};
			const idle = settingsManager.getHttpIdleTimeoutMs?.() ?? 300_000;
			return {
				timeoutMs: provider.timeoutMs ?? (idle === 0 ? 2147483647 : idle),
				maxRetryDelayMs: provider.maxRetryDelayMs,
				...(provider.maxRetries === undefined ? {} : { maxRetries: provider.maxRetries }),
			};
		},
		get compaction() {
			const active = getActiveModel?.();
			const model = active
				? { provider: active.provider, id: active.modelId }
				: (() => {
						const p = settingsManager.getDefaultProvider();
						const m = settingsManager.getDefaultModel();
						return p && m ? { provider: p, id: m } : undefined;
					})();
			return settingsManager.getCompactionSettings?.(model) ?? {};
		},
		get retry() {
			return settingsManager.getRetrySettings?.() ?? {};
		},
		get steeringMode() {
			return settingsManager.getSteeringMode?.() ?? "immediate";
		},
		get followUpMode() {
			return settingsManager.getFollowUpMode?.() ?? "queue";
		},
	};
}

export type CodingRegistry = Registry & { builtinRegistry: BuiltinExtensionRegistry };

export async function createCodingRegistry(
	settingsManager: SettingsManager,
	cwd: string,
	getSubagentPolicy: () => SubagentPolicyRecord,
	promptOptions?: PromptOptions,
	dynamicNamespaces?: DynamicCodemodeNamespaces,
	customBuiltins: BuiltinExtension[] = [],
): Promise<CodingRegistry> {
	const registry = createRegistry();
	const builtinRegistry = new BuiltinExtensionRegistry();

	builtinRegistry.register(codingToolsExtension);
	builtinRegistry.register(subagentsExtension);

	for (const builtin of customBuiltins) {
		builtinRegistry.register(builtin);
	}

	const ctx: BuiltinExtensionContext = {
		registry,
		settingsManager,
		cwd,
		storageDir: cwd,
		getSubagentPolicy,
		prompt: promptOptions,
		dynamicNamespaces,
	};

	await builtinRegistry.initAll(ctx);
	registry.install(createToolSearchExtension());
	registry.install(createPiPrompt(settingsManager, cwd, promptOptions));
	return Object.assign(registry, { builtinRegistry });
}

export class ExecutionEnvs {
	readonly #defaultCwd: string;
	readonly #factory: ExecutionEnvFactory;
	readonly #envs = new Map<string, IExecutionEnvironment>();

	constructor(defaultCwd: string, factory: ExecutionEnvFactory) {
		if (typeof factory !== "function") {
			throw new Error("ExecutionEnvFactory is required (AP-012, AP-072, AP-073: no fallback in core)");
		}
		this.#defaultCwd = defaultCwd;
		this.#factory = factory;
	}

	readonly env = ({ cwd = this.#defaultCwd, conversationId }: EnvTarget): IExecutionEnvironment => {
		let env = this.#envs.get(cwd);
		if (env === undefined) {
			const created = this.#factory({ cwd, conversationId });
			env = created as IExecutionEnvironment;
			this.#envs.set(cwd, env);
		}
		return env;
	};

	async cleanup(context: Context): Promise<void> {
		const envs = [...this.#envs.values()];
		this.#envs.clear();
		for (const env of envs) await env.cleanup(context);
	}
}

export interface InitialModel {
	readonly model?: ModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	readonly fallbackMessage?: string;
}

export async function findInitialAgentModel(
	settingsManager: SettingsManager,
	modelRuntime: ModelRuntime,
	cli?: { readonly provider?: string; readonly model?: string; readonly thinking?: ModelThinkingLevel },
): Promise<InitialModel> {
	if (cli?.model !== undefined) {
		const resolved = resolveCliModel({ cliProvider: cli.provider, cliModel: cli.model, modelRuntime });
		if (resolved.error !== undefined || resolved.model === undefined) {
			throw new Error(`Could not resolve model: ${resolved.error ?? cli.model}`);
		}
		return {
			model: { provider: resolved.model.provider, modelId: resolved.model.id },
			thinkingLevel: cli.thinking ?? resolved.thinkingLevel ?? "off",
		};
	}

	const defaultProvider = settingsManager.getDefaultProvider?.();
	const defaultModelId = settingsManager.getDefaultModel?.();
	const defaultThinkingLevel = settingsManager.getDefaultThinkingLevel?.() as ModelThinkingLevel;

	if (defaultProvider && defaultModelId) {
		const models = modelRuntime.getAvailableSnapshot();
		const matched = models.find((m) => m.provider === defaultProvider && m.id === defaultModelId);
		if (matched) {
			return {
				model: { provider: matched.provider, modelId: matched.id },
				thinkingLevel: defaultThinkingLevel ?? "off",
			};
		}
	}

	const available = modelRuntime.getAvailableSnapshot();
	if (available.length > 0) {
		return {
			model: { provider: available[0].provider, modelId: available[0].id },
			thinkingLevel: "off",
		};
	}

	return {};
}
