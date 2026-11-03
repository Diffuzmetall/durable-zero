import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import {
	SessionCoordinator,
	type ISessionStore,
	type IModelProvider,
	type IExecutionEnvironment,
	type PromptOptions,
} from "@durable-zero/core";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import { PiDurableSessionStore } from "@durable-zero/adapter-pi-durable";
import { PiAiModelProvider, setupRunnerModels } from "@durable-zero/adapter-pi-ai";
import { CodemodeExtension } from "@durable-zero/adapter-codemode";
import { createPiResourceExtension, type PiResourceExtension } from "@durable-zero/extension-pi-resource";

export interface AssembleDurableZeroOptions {
	cwd?: string;
	sessionDir?: string;
	session?: string;
	provider?: string;
	model?: string;
	thinking?: string;
	stdin?: Readable;
	stdout?: Writable;
	onNotification?: (method: string, params: Record<string, unknown>) => void;
	store?: ISessionStore;
	modelProvider?: IModelProvider;
	executionEnv?: IExecutionEnvironment;
}

export interface DurableZeroInstance {
	coordinator: SessionCoordinator;
	store: ISessionStore;
	executionEnv: IExecutionEnvironment;
	server: StdioJsonRpcServer;
	resourceExt?: PiResourceExtension;
	codemodeExt?: CodemodeExtension;
	modelProvider?: IModelProvider;
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

	const executionEnv = options.executionEnv ?? new LocalNodeExecutionEnv({ cwd });
	const store = options.store ?? new PiDurableSessionStore({ sessionDir, cwd });
	const resourceExt = createPiResourceExtension({ cwd });
	const codemodeExt = new CodemodeExtension();

	let modelProvider = options.modelProvider;
	if (!modelProvider) {
		try {
			const { modelRuntime, settingsManager } = await setupRunnerModels(cwd, {
				provider: options.provider,
				model: options.model,
				thinking: options.thinking as any,
			});
			modelProvider = new PiAiModelProvider(modelRuntime, settingsManager);
		} catch {
			// In test environments or when ModelRuntime fails, provider remains undefined
		}
	}

	const coordinator = new SessionCoordinator({
		store,
		modelProvider,
		executionEnv,
	});

	const server = new StdioJsonRpcServer({
		stdin: options.stdin,
		stdout: options.stdout,
		handler: async (method: string, params: Record<string, unknown>) => {
			if (method === "session/prompt") {
				return coordinator.prompt(params.content as string, params.options as PromptOptions);
			}
			if (method === "session/abort") return coordinator.abort();
			if (method === "session/getState") return coordinator.getState();
			if (method === "session/setSubagentPolicy") return coordinator.setSubagentPolicy(params);
			throw new Error(`Unknown method: ${method}`);
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
		store,
		executionEnv,
		server,
		resourceExt,
		codemodeExt,
		modelProvider,
		close,
	};
}
