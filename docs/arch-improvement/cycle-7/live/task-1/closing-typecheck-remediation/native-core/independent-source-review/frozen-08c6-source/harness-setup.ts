import type { Context } from "@earendil-works/chord";
import type { EnvTarget } from "@earendil-works/pi-durable";
import type { ExecutionEnv } from "@earendil-works/pi-durable/env";
import type { ExecutionEnvFactory, IExecutionEnvironment } from "@durable-zero/core";
import { CoreExecutionEnvAdapter } from "./core-execution-env-adapter.ts";

export type NativeExecutionEnvFactory = (
	target: EnvTarget,
	context: Context,
) => ExecutionEnv | Promise<ExecutionEnv | undefined> | undefined;

export interface ExecutionEnvsOptions {
	defaultCwd: string;
	nativeFactory?: NativeExecutionEnvFactory;
	coreFactory?: ExecutionEnvFactory;
}

/**
 * EXACT FROZEN ExecutionEnvs implementation from commit 08c6fd172bc90061a3e265745f183c1725c1d010
 */
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
