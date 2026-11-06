import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { connectRuntime } from "@local-durable/runtime/client";
import { runnerEventSchema } from "@durable-zero/contracts";
import { z } from "zod";
import { ZeroTerminalClient, type RuntimeConnection } from "./client.ts";

const admissionSchema = z.object({ status: z.literal("accepted"), id: z.string().min(1) });

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    "session-dir": { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pi-zero-terminal --session-dir PATH\nCommands: /abort, /history, /detach. Ctrl-C aborts; Ctrl-D detaches.\nStart pi-zero-runtime separately. Reconnecting never resubmits a prompt.");
    return;
  }
  if (!values["session-dir"]) throw new Error("--session-dir is required. Start pi-zero-runtime with the same path first.");
  let transport!: RuntimeConnection;
  const streamedText = new Map<number, string>();
  const client = await ZeroTerminalClient.open(values["session-dir"], async (directory, notify) => {
    transport = await connectRuntime(directory, (method, params) => {
      notify?.(method, params);
      if (method !== "session/event") return;
      const parsed = runnerEventSchema.safeParse(params.event);
      if (!parsed.success) { process.stderr.write("[Unsupported runtime event]\n"); return; }
      const event = parsed.data;
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        const { contentIndex, delta } = event.assistantMessageEvent;
        streamedText.set(contentIndex, (streamedText.get(contentIndex) ?? "") + delta);
        process.stdout.write(delta);
      } else if (event.type === "message_end") {
        for (const [index, block] of event.message.content.entries()) {
          if (block.type !== "text") continue;
          const printed = streamedText.get(index) ?? "";
          // A final-only message prints in full. A streamed message prints only its missing suffix.
          if (block.text.startsWith(printed)) process.stdout.write(block.text.slice(printed.length));
          else process.stdout.write(`\n[final] ${block.text}`);
        }
        streamedText.clear();
        process.stdout.write("\n");
      } else if (event.type === "tool_execution_start") {
        process.stdout.write(`\n[tool: ${event.toolName}]\n`);
      } else if (event.type === "tool_execution_end") {
        process.stdout.write(`\n[${event.toolName}: ${event.isError ? "error" : "done"}] ${event.result}\n`);
      } else if (event.type === "turn_complete") {
        process.stdout.write(`\n[${event.status}: ${event.requestId}]${event.error ? ` ${event.error}` : ""}\n> `);
      }
    });
    return transport;
  });
  const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  // Start buffering lines before history or any other await can let piped input drain.
  const input = lines[Symbol.asyncIterator]();
  const showHistory = () => {
    // The native view is authoritative and contains the selected conversation's complete history.
    for (const entry of client.current().conversation.entries) {
      for (const message of entry.model ?? []) {
        const text = typeof message.content === "string" ? message.content
          : message.content.filter(block => block.type === "text").map(block => block.text).join("");
        if (text) console.log(`[${message.role}] ${text}`);
      }
    }
  };
  const abort = () => { void client.abort().catch((error: Error) => console.error(error.message)); };
  lines.on("SIGINT", abort);
  const disconnected = client.closed.then(() => lines.close());
  try {
    console.log("Connected. /abort /history /detach — runtime continues after detach.");
    await showHistory();
    process.stdout.write("> ");
    for await (const line of input) {
      const command = line.trim();
      if (!command) continue;
      if (command === "/detach") break;
      if (command === "/abort") { await client.abort(); continue; }
      if (command === "/history") { await showHistory(); continue; }
      if (command === "/reload" || command.startsWith("/reload ")) {
        try { await client.reload(command.slice("/reload".length).trim() || undefined); console.log("Reloaded runtime resources."); }
        catch (error) { console.error(error instanceof Error ? error.message : String(error)); }
        continue;
      }
      if (command.startsWith("/")) { console.error("Unknown command. Use /abort, /history, /reload or /detach."); continue; }
      const admission = admissionSchema.parse(await transport.request("session/prompt", {
        content: line, options: { conversationId: String(client.current().conversation.conversation.id) },
      }));
      console.log(`[accepted: ${admission.id}]`);
    }
  } finally {
    lines.off("SIGINT", abort);
    lines.close();
    client.close();
    await disconnected;
    console.log("Detached. Runtime was not stopped.");
  }
}
