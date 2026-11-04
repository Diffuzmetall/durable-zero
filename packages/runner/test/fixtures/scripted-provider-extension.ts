import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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
		},
	],
	api: {
		stream: (_model, context) => {
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() => {
				const lastMsg = context.messages[context.messages.length - 1];
				let text = "Echo: hello world";
				if (lastMsg) {
					if (typeof lastMsg.content === "string") {
						text = lastMsg.content;
					} else if (Array.isArray(lastMsg.content)) {
						text = lastMsg.content
							.map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
							.join("");
					}
				}
				stream.push({ type: "text_start", contentIndex: 0 });
				stream.push({ type: "text_delta", contentIndex: 0, delta: text });
				stream.push({ type: "text_end", contentIndex: 0, content: text });
				stream.end({
					role: "assistant",
					content: [{ type: "text", text }],
					stopReason: "stop",
				});
			});
			return stream;
		},
	},
});

export default function (api: ExtensionAPI): void {
	api.registerProvider(scriptedProvider);
}
