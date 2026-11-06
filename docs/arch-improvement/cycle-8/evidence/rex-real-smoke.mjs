import { connectRuntime } from "/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone/node_modules/@local-durable/runtime/dist/client.js";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const c = await connectRuntime("/home/ubuntu/.local/share/pi-durable-zero/test-sessions/rex-20261105T2146");
try {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const { view, revision } = await c.request("session/getView");
    const messages = view.conversation.entries.flatMap((entry) => entry.model ?? []);
    const text = (message) => typeof message.content === "string" ? message.content : (message.content ?? []).map((part) => part.text ?? "").join("");
    const tool = messages.find((message) => message.role === "toolResult" && text(message).includes("ZERO_NATIVE_TOOL_READY"));
    const answer = messages.find((message) => message.role === "assistant" && text(message).includes("ZERO_REX_READY") && !text(message).includes("Проверка установленного"));
    const error = messages.find((message) => message.role === "assistant" && message.stopReason === "error");
    if (error) throw new Error(error.errorMessage ?? "Native model turn failed");
    if (tool && answer) {
      const result = { pass: true, provider: "openai-codex", model: "gpt-6.1-sol", sessionId: view.session.id, revision, userEntries: messages.filter((message) => message.role === "user").length, nativeToolOutput: text(tool), finalAnswer: text(answer) };
      await writeFile("/tmp/zero-rex-real-smoke.json", JSON.stringify(result, null, 2) + "\n");
      console.log(JSON.stringify(result));
      break;
    }
    await delay(250);
  }
  if (Date.now() >= end) throw new Error("Timed out waiting for real-model Bash and final answer");
} finally { c.close(); await c.closed; }
