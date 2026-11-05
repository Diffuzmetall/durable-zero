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
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import type { NativeExecutionEnvFactory } from "./runtime-types.ts";
import { CoreExecutionEnvAdapter } from "./core-execution-env-adapter.ts";

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
		...(promptOptions !== undefined ? { prompt: promptOptions } : {}),
		...(dynamicNamespaces !== undefined ? { dynamicNamespaces } : {}),
	};

	await builtinRegistry.initAll(ctx);
	registry.install(createToolSearchExtension());
	registry.install(createPiPrompt(settingsManager, cwd, promptOptions));
	return Object.assign(registry, { builtinRegistry });
}

export interface ExecutionEnvsOptions {
	defaultCwd: string;
	nativeFactory?: NativeExecutionEnvFactory;
	coreFactory?: ExecutionEnvFactory;
}

export class ExecutionEnvs {
	readonly #defaultCwd: string;
	readonly #nativeFactory?: NativeExecutionEnvFactory | undefined;
	readonly #coreFactory?: ExecutionEnvFactory | undefined;
	readonly #envs = new Map<string, ExecutionEnv>();
	readonly #inFlight = new Map<string, Promise<ExecutionEnv | undefined>>();
	readonly #coreAdapters = new Map<IExecutionEnvironment, CoreExecutionEnvAdapter>();
	readonly #ownedCoreEnvs = new Set<IExecutionEnvironment>();
	readonly #ownedNativeEnvs = new Set<ExecutionEnv>();
	#isClosing = false;
	#isClosed = false;

	constructor(options: ExecutionEnvsOptions | string, legacyFactory?: ExecutionEnvFactory) {
		if (typeof options === "string") {
			if (typeof legacyFactory !== "function") {
				throw new Error("ExecutionEnvFactory is required (AP-012, R8: no default host fallback in adapter)");
			}
			this.#defaultCwd = options;
			this.#coreFactory = legacyFactory;
		} else {
			if (options.nativeFactory && options.coreFactory) {
				throw new Error("Configuration error: Both nativeExecutionEnvFactory and executionEnvFactory provided; they are mutually exclusive.");
			}
			if (!options.nativeFactory && !options.coreFactory) {
				throw new Error("ExecutionEnvFactory or NativeExecutionEnvFactory is required (AP-012, R8: no default host fallback in adapter)");
			}
			this.#defaultCwd = options.defaultCwd;
			this.#nativeFactory = options.nativeFactory;
			this.#coreFactory = options.coreFactory;
		}
	}

	async getOrCreate(target: EnvTarget, context: Context): Promise<ExecutionEnv | undefined> {
		if (this.#isClosed || this.#isClosing) {
			throw new Error("ExecutionEnvs is closed: cannot create or retrieve execution environments after cleanup");
		}
		const key = target.cwd ?? this.#defaultCwd;
		const existing = this.#envs.get(key);
		if (existing !== undefined) return existing;

		const inFlight = this.#inFlight.get(key);
		if (inFlight !== undefined) return inFlight;

		const createPromise = (async () => {
			try {
				if (this.#nativeFactory) {
					const created = await this.#nativeFactory(target, context);
					if (this.#isClosed || this.#isClosing) {
						if (created) await created.cleanup(context).catch(() => {});
						return undefined;
					}
					if (created) {
						this.#envs.set(key, created);
						this.#ownedNativeEnvs.add(created);
					}
					return created;
				}

				if (this.#coreFactory) {
					const createdCore = await this.#coreFactory({ cwd: key, conversationId: target.conversationId });
					if (this.#isClosed || this.#isClosing) {
						if (createdCore) await createdCore.cleanup(context).catch(() => {});
						return undefined;
					}
					if (createdCore) {
						let adapter = this.#coreAdapters.get(createdCore);
						if (!adapter) {
							adapter = new CoreExecutionEnvAdapter(createdCore, key);
							this.#coreAdapters.set(createdCore, adapter);
							this.#ownedCoreEnvs.add(createdCore);
						}
						this.#envs.set(key, adapter);
						return adapter;
					}
				}

				return undefined;
			} finally {
				this.#inFlight.delete(key);
			}
		})();

		this.#inFlight.set(key, createPromise);
		return createPromise;
	}

	peek(cwd?: string): ExecutionEnv | undefined {
		return this.#envs.get(cwd ?? this.#defaultCwd);
	}

	readonly env = (target: EnvTarget, context: Context): Promise<ExecutionEnv | undefined> => {
		return this.getOrCreate(target, context);
	};

	async cleanup(context: Context): Promise<void> {
		this.#isClosing = true;

		// 1. Quiesce all in-flight creations first
		const pendingInFlight = Array.from(this.#inFlight.values());
		if (pendingInFlight.length > 0) {
			await Promise.allSettled(pendingInFlight);
		}

		this.#isClosed = true;
		this.#envs.clear();
		this.#inFlight.clear();
		this.#coreAdapters.clear();

		const coreEnvs = Array.from(this.#ownedCoreEnvs);
		const nativeEnvs = Array.from(this.#ownedNativeEnvs);
		this.#ownedCoreEnvs.clear();
		this.#ownedNativeEnvs.clear();

		const errors: unknown[] = [];
		for (const env of coreEnvs) {
			try {
				await env.cleanup(context);
			} catch (errVal: unknown) {
				errors.push(errVal);
			}
		}
		for (const env of nativeEnvs) {
			try {
				await env.cleanup(context);
			} catch (errVal: unknown) {
				errors.push(errVal);
			}
		}

		if (errors.length > 0) {
			throw new AggregateError(errors, "One or more execution environments failed during cleanup");
		}
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
		const resolved = resolveCliModel({
			...(cli.provider !== undefined ? { cliProvider: cli.provider } : {}),
			cliModel: cli.model,
			modelRuntime,
		});
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
	const first = available[0];
	if (first) {
		return {
			model: { provider: first.provider, modelId: first.id },
			thinkingLevel: "off",
		};
	}

	return {};
}
