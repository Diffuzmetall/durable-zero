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
 * EXACT FROZEN ExecutionEnvs implementation from commit 2cc724f3c73a544d161015ae4fdcf8539d76e6a5
 */
export class ExecutionEnvs {
	readonly #defaultCwd: string;
	readonly #nativeFactory?: NativeExecutionEnvFactory | undefined;
	readonly #coreFactory?: ExecutionEnvFactory | undefined;
	readonly #envs = new Map<string, ExecutionEnv>();
	readonly #uniqueEnvs = new Set<ExecutionEnv>();

	constructor(options: ExecutionEnvsOptions | string, legacyFactory?: ExecutionEnvFactory) {
		if (typeof options === "string") {
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
		const key = target.cwd ?? this.#defaultCwd;
		const existing = this.#envs.get(key);
		if (existing !== undefined) return existing;

		if (this.#nativeFactory) {
			const created = await this.#nativeFactory(target, context);
			if (created) {
				this.#envs.set(key, created);
				this.#uniqueEnvs.add(created);
			}
			return created;
		}

		if (this.#coreFactory) {
			const createdCore = await this.#coreFactory({ cwd: key, conversationId: target.conversationId });
			if (createdCore) {
				const adapted = new CoreExecutionEnvAdapter(createdCore, key);
				this.#envs.set(key, adapted);
				this.#uniqueEnvs.add(adapted);
				return adapted;
			}
		}

		return undefined;
	}

	peek(cwd?: string): ExecutionEnv | undefined {
		return this.#envs.get(cwd ?? this.#defaultCwd);
	}

	readonly env = (target: EnvTarget, context: Context): Promise<ExecutionEnv | undefined> => {
		return this.getOrCreate(target, context);
	};

	async cleanup(context: Context): Promise<void> {
		const envsToClean = Array.from(this.#uniqueEnvs);
		this.#envs.clear();
		this.#uniqueEnvs.clear();
		for (const env of envsToClean) {
			await env.cleanup(context);
		}
	}
}
