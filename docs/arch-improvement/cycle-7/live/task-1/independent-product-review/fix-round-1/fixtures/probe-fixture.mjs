
import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

function streamHandler(model, context, options) {
  const stream = createAssistantMessageEventStream();
  setTimeout(async () => {
    const partial = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "" }
      ],
      api: "echo-api",
      provider: "scripted-e2e",
      model: "echo",
      usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "pending",
      timestamp: Date.now()
    };
    stream.push({ type: "start", partial: { ...partial } });
    stream.push({ type: "thinking_start", contentIndex: 0, partial: { ...partial } });
    partial.content[0].thinking = "Plan A";
    stream.push({ type: "thinking_delta", contentIndex: 0, delta: "Plan A", partial: { ...partial } });
    stream.push({ type: "thinking_end", contentIndex: 0, content: "Plan A", partial: { ...partial } });

    await new Promise(r => setTimeout(r, 120));

    stream.push({ type: "text_start", contentIndex: 1, partial: { ...partial } });
    partial.content[1].text = "Result B";
    stream.push({ type: "text_delta", contentIndex: 1, delta: "Result B", partial: { ...partial } });
    stream.push({ type: "text_end", contentIndex: 1, content: "Result B", partial: { ...partial } });

    await new Promise(r => setTimeout(r, 120));

    partial.stopReason = "stop";
    stream.push({ type: "done", reason: "stop", message: { ...partial } });
    stream.end({ ...partial });
  }, 10);
  return stream;
}

export const scriptedProvider = createProvider({
  id: "scripted-e2e",
  name: "Scripted E2E Provider",
  auth: { apiKey: { resolve: async () => ({ auth: { apiKey: "key" } }) } },
  models: [{ id: "echo", provider: "scripted-e2e", name: "Echo", api: "echo-api", contextWindow: 128000, maxTokens: 4096, reasoning: true }],
  api: { stream: streamHandler, streamSimple: streamHandler },
});
export default function(api) { api.registerProvider(scriptedProvider); }
