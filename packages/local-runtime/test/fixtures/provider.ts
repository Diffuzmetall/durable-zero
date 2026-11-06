import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { setTimeout as delay } from "node:timers/promises";

// Only the model is scripted. The Harness, SQLite, tool registry and filesystem execution are real.
function respond(_model: unknown, context: any, options: any) {
  const stream = createAssistantMessageEventStream();
  void (async () => {
    // MCP/resource changes may append system entries after a user prompt.
    const last = context.messages.findLast((message: any) => message.role !== "system");
    const prompt = typeof last?.content === "string" ? last.content : (last?.content ?? []).map((part: any) => part.text ?? "").join("");
    const message: any = {
      role: "assistant", content: [], api: "local-test-api", provider: "local-test", model: "scripted",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "pending", timestamp: Date.now(),
    };
    stream.push({ type: "start", partial: message });
    if (last?.role !== "toolResult" && (prompt.startsWith("tool:") || prompt.startsWith("invoke:"))) {
      const invocation = prompt.startsWith("invoke:") ? JSON.parse(prompt.slice("invoke:".length)) : {
        name: "bash", arguments: { command: "sleep 1; printf 'native-work-continued' > continued.txt; cat continued.txt" },
      };
      const call = { type: "toolCall", id: `native-tool-${Date.now()}`, ...invocation };
      message.content = [call];
      stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
      stream.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: message });
      message.stopReason = "toolUse";
      stream.push({ type: "done", reason: "toolUse", message });
      stream.end(message);
      return;
    }
    message.content = [{ type: "text", text: "" }];
    stream.push({ type: "text_start", contentIndex: 0, partial: message });
    message.content[0].text = "started:";
    stream.push({ type: "text_delta", contentIndex: 0, delta: "started:", partial: message });
    try {
      await delay(prompt.startsWith("slow:") ? 5000 : 100, undefined, { signal: options?.signal });
    } catch {
      message.stopReason = "aborted";
      message.errorMessage = "Aborted by test operator";
      stream.push({ type: "error", reason: "aborted", error: message });
      stream.end(message);
      return;
    }
    const text = last?.role === "toolResult" ? `native result: ${prompt}` : prompt;
    message.content[0].text += text;
    stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
    stream.push({ type: "text_end", contentIndex: 0, content: message.content[0].text, partial: message });
    message.stopReason = "stop";
    stream.push({ type: "done", reason: "stop", message });
    stream.end(message);
  })().catch((error) => { stream.end(); throw error; });
  return stream;
}

export default function register(api: ExtensionAPI): void {
  api.registerProvider(createProvider({
    id: "local-test", name: "Offline native integration fixture",
    auth: { apiKey: { resolve: async () => ({ auth: { apiKey: "local-test-not-a-secret" } }) } },
    models: [{ id: "scripted", provider: "local-test", name: "Scripted", api: "local-test-api", contextWindow: 32000, maxTokens: 2048, reasoning: false }],
    api: { stream: respond, streamSimple: respond },
  }));
}
