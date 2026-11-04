import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import * as protocol from "@durable-zero/protocol";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import {
	SessionCoordinator,
	type IAgentEngine,
	type ExecutionEnvFactory,
} from "@durable-zero/core";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import {
	PiDurableEngine,
	type PiRuntimeDependencies,
} from "@durable-zero/adapter-pi-durable";
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
	engine?: IAgentEngine;
}

export interface DurableZeroInstance {
	coordinator: SessionCoordinator;
	engine: IAgentEngine;
	server: StdioJsonRpcServer;
	close: () => Promise<void>;
}

export async function assembleDurableZero(
	options: AssembleDurableZeroOptions = {},
): Promise<DurableZeroInstance> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const sessionDir = options.sessionDir
		? resolve(options.sessionDir)
		: options.session
			? resolve(cwd, options.session)
			: resolve(cwd, ".durable/sessions/default");

	const codemodeBuiltin = createCodemodeBuiltinExtension();
	const resourceExt = createPiResourceExtension({ cwd });

	const executionEnvFactory: ExecutionEnvFactory =
		options.executionEnvFactory ??
		((target) => new LocalNodeExecutionEnv({ cwd: target.cwd ?? cwd }));

	const dependencies: PiRuntimeDependencies = {
		executionEnvFactory,
		settingsManager: resourceExt.configProvider,
		resourceLoader: resourceExt.resourceLoader,
		builtins: [codemodeBuiltin],
	};

	const cli = {
		provider: options.provider,
		model: options.model,
		thinking: options.thinking as any,
		extension: options.extension,
		extensions: options.extensions,
		skills: options.skills,
		noGlobalExtensions: options.noGlobalExtensions,
	};

	const engine =
		options.engine ??
		new PiDurableEngine({
			sessionDir,
			session: options.session,
			cwd,
			continueSession: options.continueSession,
			cli,
			dependencies,
		});

	const coordinator = new SessionCoordinator({
		engine,
		sessionDir,
	});

	await coordinator.start();

	const server = new StdioJsonRpcServer({
		stdin: options.stdin,
		stdout: options.stdout,
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
		if (typeof codemodeBuiltin.teardown === "function") {
			await codemodeBuiltin.teardown();
		}
	};

	return {
		coordinator,
		engine,
		server,
		close,
	};
}
