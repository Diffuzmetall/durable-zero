import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import * as protocol from "@durable-zero/protocol";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import {
	SessionCoordinator,
	type IAgentEngine,
	type ExecutionEnvFactory,
} from "@durable-zero/core";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import {
	PiDurableEngine,
	type NativeExecutionEnvFactory,
	type PiRuntimeDependencies,
	type DurableViewSource,
	type DurableController,
} from "@durable-zero/adapter-pi-durable";
import {
	SettingsManager,
	DefaultResourceLoader,
	createMcpExtension,
	getAgentDir,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import { createCodemodeBuiltinExtension } from "@durable-zero/adapter-codemode";
import { createPiResourceExtension } from "@durable-zero/extension-pi-resource";

export interface AssembleDurableZeroOptions {
	cwd?: string;
	sessionDir?: string;
	session?: string;
	continueSession?: boolean;
	provider?: string;
	model?: string;
	thinking?: string;
	extension?: string;
	extensions?: string[];
	skills?: string[];
	noGlobalExtensions?: boolean;
	stdin?: Readable;
	stdout?: Writable;
	onNotification?: (method: string, params: Record<string, unknown>) => void;
	executionEnvFactory?: ExecutionEnvFactory;
	nativeExecutionEnvFactory?: NativeExecutionEnvFactory;
	engine?: IAgentEngine;
}

export interface DurableZeroInstance {
	coordinator: SessionCoordinator;
	engine: IAgentEngine;
	server: StdioJsonRpcServer;
	/** Available for the native assembly, absent for an injected generic engine. */
	view?: DurableViewSource;
	controller?: DurableController;
	/** Read-only access to the same resource owner used by native prompting. */
	resources?: { getSkills(): readonly Skill[]; getEnableSkillCommands(): boolean };
	close: () => Promise<void>;
}

export async function assembleDurableZero(
	options: AssembleDurableZeroOptions = {},
): Promise<DurableZeroInstance> {
	if (options.executionEnvFactory && options.nativeExecutionEnvFactory) {
		throw new Error(
			"Invalid composition configuration: cannot specify both executionEnvFactory (Core SPI) and nativeExecutionEnvFactory (Native SDK). Specify at most one (AP-012, AP-074).",
		);
	}

	const cwd = resolve(options.cwd ?? process.cwd());
	const sessionDir = options.sessionDir
		? resolve(options.sessionDir)
		: options.session
			? resolve(cwd, options.session)
			: resolve(cwd, ".durable/sessions/default");

	let engine: IAgentEngine;
	let nativeEngine: PiDurableEngine | undefined;
	let resources: DurableZeroInstance["resources"];
	let codemodeBuiltin: ReturnType<typeof createCodemodeBuiltinExtension> | undefined;

	if (options.engine) {
		engine = options.engine;
	} else {
		codemodeBuiltin = createCodemodeBuiltinExtension();
		const extEnv = process.env.PI_ADDITIONAL_EXTENSIONS;
		const extPaths = [
			...(options.extensions ?? (options.extension ? [options.extension] : [])),
			...(extEnv ? extEnv.split(",").map((s) => s.trim()).filter(Boolean) : []),
		];
		const settingsManager = SettingsManager.create(cwd);
		const agentDir = getAgentDir();
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: [createMcpExtension()],
			noExtensions: options.noGlobalExtensions ?? false,
			...(options.skills !== undefined ? { additionalSkillPaths: options.skills } : {}),
			...(extPaths.length > 0 ? { additionalExtensionPaths: extPaths } : {}),
		});
		resources = {
			getSkills: () => resourceLoader.getSkills().skills,
			getEnableSkillCommands: () => settingsManager.getEnableSkillCommands(),
		};
		const resourceExt = createPiResourceExtension({
			cwd,
			settingsManager,
			resourceLoader,
		});

		const dependencies: PiRuntimeDependencies = {
			settingsManager: resourceExt.configProvider,
			resourceLoader: resourceExt.resourceLoader,
			builtins: [codemodeBuiltin],
			...(options.executionEnvFactory
				? { executionEnvFactory: options.executionEnvFactory }
				: {
						nativeExecutionEnvFactory:
							options.nativeExecutionEnvFactory ??
							((target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd })),
					}),
		};

		const cli = {
			...(options.provider !== undefined ? { provider: options.provider } : {}),
			...(options.model !== undefined ? { model: options.model } : {}),
			...(options.thinking !== undefined ? { thinking: options.thinking as any } : {}),
			...(options.extension !== undefined ? { extension: options.extension } : {}),
			...(options.extensions !== undefined ? { extensions: options.extensions } : {}),
			...(options.skills !== undefined ? { skills: options.skills } : {}),
			...(options.noGlobalExtensions !== undefined ? { noGlobalExtensions: options.noGlobalExtensions } : {}),
		};

		engine = nativeEngine = new PiDurableEngine({
			sessionDir,
			cwd,
			cli,
			dependencies,
			...(options.session !== undefined ? { session: options.session } : {}),
			...(options.continueSession !== undefined ? { continueSession: options.continueSession } : {}),
		});
	}

	const coordinator = new SessionCoordinator({
		engine,
		sessionDir,
	});

	try {
		await coordinator.start();
	} catch (err) {
		if (codemodeBuiltin && typeof codemodeBuiltin.teardown === "function") {
			await codemodeBuiltin.teardown().catch(() => {});
		}
		throw err;
	}

	const server = new StdioJsonRpcServer({
		...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
		...(options.stdout !== undefined ? { stdout: options.stdout } : {}),
		handler: async (method: string, params: Record<string, unknown>) => {
			if (method === "session/prompt") {
				return await coordinator.prompt(params.content as any, params.options as any);
			}
			if (method === "session/abort") {
				return await coordinator.abort(params?.conversationId as string | undefined);
			}
			if (method === "session/getState") {
				return await coordinator.getState(params?.conversationId as string | undefined);
			}
			if (method === "session/getTranscript") {
				return await coordinator.getTranscript(
					params?.conversationId as string | undefined,
					params?.limit as number | undefined,
				);
			}
			if (method === "session/getStats") {
				return await coordinator.getStats(params?.conversationId as string | undefined);
			}
			if (method === "session/setSubagentPolicy") {
				return await coordinator.setSubagentPolicy(params);
			}

			const MethodNotFoundClass = (protocol as any).JsonRpcMethodNotFoundError;
			if (MethodNotFoundClass) {
				throw new MethodNotFoundClass(method);
			}
			const err = new Error(`Method not found: ${method}`);
			(err as any).code = -32601;
			throw err;
		},
	});
	server.start();

	const unsubEvents = coordinator.events((event) => {
		const payload = { event: event as Record<string, unknown> };
		options.onNotification?.("session/event", payload);
		server.sendNotification("session/event", payload);
	});

	let isClosed = false;
	const close = async (): Promise<void> => {
		if (isClosed) return;
		isClosed = true;
		unsubEvents();
		server.stop();
		await coordinator.close();
	};

	return {
		coordinator,
		engine,
		server,
		...(nativeEngine ? { view: nativeEngine.view, controller: nativeEngine.controller } : {}),
		...(resources ? { resources } : {}),
		close,
	};
}
