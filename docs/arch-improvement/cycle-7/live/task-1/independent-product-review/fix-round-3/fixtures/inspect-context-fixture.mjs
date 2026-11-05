import fs from "node:fs";
import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

function streamHandler(model, context, options) {
  const stream = createAssistantMessageEventStream();
  const logPath = process.env.INSPECT_LOG || "/tmp/inspect-context.json";

  const serialized = {
    model: { id: model.id, provider: model.provider },
    contextKeys: Object.keys(context || {}),
    messagesCount: context.messages?.length,
    messages: context.messages?.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
    optionsKeys: Object.keys(options || {}),
  };

  fs.writeFileSync(logPath, JSON.stringify(serialized, null, 2));

  setTimeout(() => {
    const partial = {
      role: "assistant",
      content: [{ type: "text", text: "OK" }],
      api: "echo-api",
      provider: "scripted-e2e",
      model: "echo",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    };
    stream.push({ type: "start", partial });
    stream.push({ type: "text_start", contentIndex: 0, partial });
    stream.push({ type: "text_delta", contentIndex: 0, delta: "OK", partial });
    stream.push({ type: "text_end", contentIndex: 0, content: "OK", partial });
    stream.push({ type: "done", reason: "stop", message: partial });
    stream.end(partial);
  }, 50);

  return stream;
}

export const scriptedProvider = createProvider({
  id: "scripted-e2e",
  name: "Scripted E2E Provider",
  auth: { apiKey: { resolve: async () => ({ auth: { apiKey: "key" } }) } },
  models: [{ id: "echo", provider: "scripted-e2e", name: "Echo", api: "echo-api", contextWindow: 128000, maxTokens: 4096, reasoning: false }],
  api: { stream: streamHandler, streamSimple: streamHandler },
});

export default function (api) {
  api.registerProvider(scriptedProvider);
}
