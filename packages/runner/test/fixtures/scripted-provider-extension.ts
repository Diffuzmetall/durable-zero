import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function streamHandler(model: any, context: any) {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		const lastMsg = context.messages[context.messages.length - 1];
		let text = "Echo: hello world";
		if (lastMsg) {
			if (typeof lastMsg.content === "string") {
				text = lastMsg.content;
			} else if (Array.isArray(lastMsg.content)) {
				text = lastMsg.content
					.map((part: any) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
					.join("");
			}
		}

		const partial: any = {
			role: "assistant",
			content: [{ type: "text", text: "" }],
			api: "echo-api",
			provider: "scripted-e2e",
			model: "echo",
			usage: {
				input: 10,
				output: 10,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 20,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		stream.push({ type: "start", partial: { ...partial } });
		stream.push({ type: "text_start", contentIndex: 0, partial: { ...partial } });
		partial.content[0].text = text;
		stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: { ...partial } });
		stream.push({ type: "text_end", contentIndex: 0, content: text, partial: { ...partial } });
		stream.push({ type: "done", reason: "stop", message: { ...partial } });
		stream.end({ ...partial });
	});
	return stream;
}

export const scriptedProvider = createProvider({
	id: "scripted-e2e",
	name: "Scripted E2E Provider",
	auth: {
		apiKey: {
			resolve: async () => ({ auth: { apiKey: "scripted-test-key" } }),
		},
	},
	models: [
		{
			id: "echo",
			provider: "scripted-e2e",
			name: "Echo Model",
			api: "echo-api",
			contextWindow: 128000,
			maxTokens: 4096,
			reasoning: false,
		},
	],
	api: {
		stream: streamHandler,
		streamSimple: streamHandler,
	},
});

export default function (api: ExtensionAPI): void {
	api.registerProvider(scriptedProvider);
}
