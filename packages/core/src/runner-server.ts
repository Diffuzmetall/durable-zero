export { DurableEngine, type DurableEngineOptions } from "./engine.ts";
import { setupRunnerModels } from "./model-setup.ts";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";
import { openDurable } from "./runtime.ts";
import type { OpenDurableOptions, OpenDurableResult } from "./runtime-types.ts";
import { DurableEventAdapter } from "./bridge/durable-event-adapter.ts";
import type { RunnerEvent } from "./bridge/contracts.ts";
import { parseCliArgs } from "./cli-args.ts";
import { handleActiveSessionCommand } from "./session-commands.ts";
import { parseRunnerCommand, type RunnerCommandPayload } from "@durable-zero/contracts";
import { getPiDurableVersion } from "./version.ts";
import { HostRpcManager } from "./host-rpc.ts";
import { startSubagentWatcher, type SubagentWatcherController } from "./subagent-watcher.ts";
import { RuntimeGraphSource } from "./runtime-graph-source.ts";
import { ROOT_CONVERSATION_ID } from "@earendil-works/pi-durable";
import { setupRunnerStdoutGuard, writeWireStdout, flushWireStdout } from "./stdout-guard.ts";
import { startRunnerControlChannel, type ControlChannelController } from "./control-channel.ts";

const argv = process.argv.slice(2);

// Handle --version flag dynamically (Defect D-9, AP-027)
if (argv.includes("--version") || argv.includes("-v")) {
	console.log(getPiDurableVersion());
	process.exit(0);
}

const args = parseCliArgs(argv);

function output(data: unknown): void {
	writeWireStdout(serializeJsonLine(data));
}

const hostRpc = new HostRpcManager(output);
const forwardToolCall = hostRpc.forwardToolCall;
const requestInteraction = hostRpc.requestInteraction;

async function main() {
	await setupRunnerStdoutGuard();

	let activeDurable: OpenDurableResult | null = null;
	let activeWatcher: SubagentWatcherController | null = null;
	let activeGraphSource: RuntimeGraphSource | null = null;
	let activeControlChannel: ControlChannelController | null = null;
	let isTerminating = false;

	const handleExit = async (signalOrReason: string) => {
		if (isTerminating) return;
		isTerminating = true;
		try { activeControlChannel?.close(); } catch (err) {
			console.warn(`[Runner] Error closing control channel on ${signalOrReason}: ${err instanceof Error ? err.message : String(err)}`);
		}
		try { activeGraphSource?.teardown(); } catch (err) {
			console.warn(`[Runner] Error closing runtime graph source on ${signalOrReason}: ${err instanceof Error ? err.message : String(err)}`);
		}
		try { if (typeof activeWatcher?.close === "function") activeWatcher.close(); } catch (err) {
			console.warn(`[Runner] Error closing subagent watcher on ${signalOrReason}: ${err instanceof Error ? err.message : String(err)}`);
		}
		if (activeDurable) {
			try {
				await activeDurable.close();
				activeDurable = null;
			} catch (err) {
				console.warn(`[Runner] Error closing durable on ${signalOrReason}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	};

	process.on("SIGTERM", () => { void handleExit("SIGTERM").then(() => process.exit(0)); });
	process.on("SIGINT", () => { void handleExit("SIGINT").then(() => process.exit(0)); });

	const success = (id: string | undefined, command: string, data?: unknown) => {
		output({ id, type: "response", command, success: true, data });
	};

	const error = (id: string | undefined, command: string, message: string) => {
		output({ id, type: "response", command, success: false, error: message });
	};

	if (args.noSession) {
		const cwd = args.cwd ?? process.cwd();
		const { scopedModelList, defaultModel, defaultThinkingLevel, modelScope } = await setupRunnerModels(cwd, args);
		output({ type: "ready", kind: "ready", ready: true, pid: process.pid, mode: "probe", ...modelScope });
		attachJsonlLineReader(process.stdin, (line) => {
			if (!line.trim()) return;
			try {
				const cmd = parseRunnerCommand(line);
				if (cmd.type === "get_available_models") {
					success(cmd.id, "get_available_models", { models: scopedModelList });
				} else if (cmd.type === "get_state") {
					success(cmd.id, "get_state", {
						model: defaultModel ? { provider: defaultModel.provider, id: defaultModel.id, modelId: defaultModel.id } : null,
						thinkingLevel: defaultThinkingLevel,
						isStreaming: false,
						isCompacting: false,
						steeringMode: "one-at-a-time",
						followUpMode: "one-at-a-time",
						sessionId: "catalog",
						autoCompactionEnabled: true,
						messageCount: 0,
						pendingMessageCount: 0,
					});
				} else {
					success(cmd.id, cmd.type, {});
				}
			} catch (err) {
				error(undefined, "unknown", "INVALID_COMMAND");
			}
		});
		return;
	}

	const adapter = new DurableEventAdapter((event: RunnerEvent) => {
		output(event);
	});

	const cwd = args.cwd ?? process.cwd();
	const { modelRuntime } = await setupRunnerModels(cwd, args);

	const durable = await openDurable({
		cwd: args.cwd,
		continueSession: args.continueSession,
		session: args.session,
		cli: { provider: args.provider, model: args.model, thinking: args.thinking, skills: args.skills, extension: args.extension },
		prompt: { systemPromptPath: args.systemPromptPath, appendSystemPromptPath: args.appendSystemPromptPath },
		toolsFilePath: args.toolsFilePath,
		forwardToolCall,
		requestInteraction,
	});
	activeDurable = durable;
	activeControlChannel = startRunnerControlChannel(durable.view.current().session.directory, durable.harness);

	const modelScope = {
		scopedModelIds: durable.view.current().models.map((m) => `${m.provider}/${m.modelId}`),
		defaultModelId: durable.view.current().models[0] ? `${durable.view.current().models[0].provider}/${durable.view.current().models[0].modelId}` : undefined,
	};

	const graphScope = {
		sessionId: String(durable.view.current().session?.id ?? "unknown"),
		rootConversationId: "1",
		buildId: getPiDurableVersion(),
	};
	activeGraphSource = new RuntimeGraphSource(durable.view, graphScope, {
		harness: durable.harness,
	});
	activeGraphSource.subscribe((snapshot) => {
		output({ type: "runtime_graph_snapshot", snapshot });
	});

	activeWatcher = await startSubagentWatcher(
		durable.harness,
		adapter,
		() => durable.view.current(),
	);

	output({
		type: "ready",
		kind: "ready",
		ready: true,
		pid: process.pid,
		...modelScope,
		session: durable.view.current().session,
		conversations: durable.view.current().conversations,
		activeConversationId: ROOT_CONVERSATION_ID,
	});

	attachJsonlLineReader(process.stdin, async (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		let cmd: RunnerCommandPayload;
		try {
			cmd = parseRunnerCommand(trimmed);
		} catch (err) {
			let fallbackId: string | undefined;
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed?.id === "string") fallbackId = parsed.id;
			} catch {}
			output({
				id: fallbackId,
				type: "response",
				command: "unknown",
				success: false,
				error: `INVALID_COMMAND_PAYLOAD: ${err instanceof Error ? err.message : String(err)}`,
			});
			return;
		}

		if (cmd.type === "host_tool_result") {
			const handled = hostRpc.handleHostToolResult(cmd);
			if (handled) {
				success(cmd.id, "host_tool_result", { ok: true });
			} else {
				error(cmd.id, "host_tool_result", `No pending tool call found for callId: ${cmd.callId}`);
			}
			await flushWireStdout();
			return;
		}

		if (cmd.type === "host_interaction_response") {
			const handled = hostRpc.handleHostInteractionResponse(cmd);
			if (handled) {
				success(cmd.id, "host_interaction_response", { ok: true });
			} else {
				error(cmd.id, "host_interaction_response", `No pending interaction found for id: ${cmd.id}`);
			}
			await flushWireStdout();
			return;
		}

		const respond: CommandResponder = { success, error };
		await handleActiveSessionCommand(cmd, durable, modelRuntime, args, respond);
		await flushWireStdout();
	});
}

main().catch((err: unknown) => {
	console.error("Runner fatal error:", err);
	process.exit(1);
});
