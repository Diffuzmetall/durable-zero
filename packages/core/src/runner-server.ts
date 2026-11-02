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
import { createBridgeSender, initBridgeInboundChannel, createForwardToolCall, createRequestInteraction } from "./bridge-channel.ts";
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

const sendToBridge = createBridgeSender();
const forwardToolCall = createForwardToolCall(sendToBridge);
const requestInteraction = createRequestInteraction(sendToBridge);

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
		try { activeWatcher?.close(); } catch (err) {
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

	if (args.noSession) {
		const cwd = args.cwd ?? process.cwd();
		const { modelScope } = await setupRunnerModels(cwd, args);
		output({ type: "ready", kind: "ready", ready: true, pid: process.pid, mode: "probe" });
		sendToBridge({ kind: "model-scope", ...modelScope });
		initBridgeInboundChannel(modelScope, sendToBridge);
		return;
	}

	const adapter = new DurableEventAdapter((event: RunnerEvent) => {
		output(event);
	});

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
	initBridgeInboundChannel(modelScope, sendToBridge, (fault) => {
		output({ type: "session_fault", fault: fault.message });
	});

	activeGraphSource = new RuntimeGraphSource(durable.harness, durable.runtimeContext, (evt) => {
		output(evt);
	});
	activeGraphSource.start();

	activeWatcher = startSubagentWatcher({
		harness: durable.harness,
		runtimeContext: durable.runtimeContext,
		parentAdapter: adapter,
		createChildAdapter: (parentRef: string, conversationId: string | number) =>
			adapter.createChildAdapter(parentRef, conversationId),
		onNotice: (level, message) => {
			output({ type: "notice", level, message });
		},
	});

	output({
		type: "ready",
		ready: true,
		session: durable.view.current().session,
		conversations: durable.view.current().conversations,
		activeConversationId: ROOT_CONVERSATION_ID,
	});

	attachJsonlLineReader(process.stdin, async (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		let cmd: RunnerCommandPayload;
		try {
			cmd = parseRunnerCommand(JSON.parse(trimmed));
		} catch (err) {
			output({
				id: typeof (JSON.parse(trimmed) as { id?: unknown })?.id === "string" ? (JSON.parse(trimmed) as { id: string }).id : undefined,
				success: false,
				error: `INVALID_COMMAND_PAYLOAD: ${err instanceof Error ? err.message : String(err)}`,
			});
			return;
		}

		await handleActiveSessionCommand(cmd, durable, output);
		await flushWireStdout();
	});
}

main().catch((err: unknown) => {
	console.error("Runner fatal error:", err);
	process.exit(1);
});
