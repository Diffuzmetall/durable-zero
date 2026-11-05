import fs from "node:fs";
import path from "node:path";
import { createProvider, createAssistantMessageEventStream } from "@earendil-works/pi-ai";

let callCount = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function streamHandler(model, context, options) {
  const stream = createAssistantMessageEventStream();
  callCount++;
  const turnId = callCount;
  const gateDir = process.env.GATE_DIR;

  let isAborted = Boolean(options?.signal?.aborted);
  if (options?.signal) {
    options.signal.addEventListener("abort", () => {
      isAborted = true;
    });
  }

  setTimeout(async () => {
    try {
      const lastMsg = context.messages[context.messages.length - 1];
      let rawText = "hello world";
      if (lastMsg) {
        if (typeof lastMsg.content === "string") {
          rawText = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          const extracted = lastMsg.content
            .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
            .join("");
          if (extracted) {
            rawText = extracted;
          }
        }
      }

      const text = rawText.startsWith("Echo: ") ? rawText : `Echo: ${rawText}`;
      const plan = `Plan for: ${rawText.slice(0, 20)}`;

      const partial = {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "" },
        ],
        api: "echo-api",
        provider: "scripted-e2e",
        model: "echo",
        usage: {
          input: 10,
          output: 20,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 30,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "pending",
        timestamp: Date.now(),
      };

      stream.push({ type: "start", partial: { ...partial } });

      function abortAndEnd() {
        partial.stopReason = "stop";
        stream.end({ ...partial });
        if (gateDir) {
          fs.writeFileSync(
            path.join(gateDir, `turn_${turnId}_aborted.json`),
            JSON.stringify({ turnId, time: Date.now() }, null, 2)
          );
        }
      }

      if (isAborted) {
        abortAndEnd();
        return;
      }

      // 1. Thinking block (contentIndex: 0)
      stream.push({ type: "thinking_start", contentIndex: 0, partial: { ...partial } });
      partial.content[0].thinking = plan;
      stream.push({ type: "thinking_delta", contentIndex: 0, delta: plan, partial: { ...partial } });
      stream.push({ type: "thinking_end", contentIndex: 0, content: plan, partial: { ...partial } });

      if (gateDir) {
        fs.writeFileSync(
          path.join(gateDir, `turn_${turnId}_thinking_emitted.json`),
          JSON.stringify({ turnId, plan, time: Date.now() }, null, 2)
        );
      }

      await sleep(120);
      if (isAborted || (gateDir && fs.existsSync(path.join(gateDir, "abort.flag")))) {
        abortAndEnd();
        return;
      }

      // 2. Text block (contentIndex: 1)
      stream.push({ type: "text_start", contentIndex: 1, partial: { ...partial } });

      const mid = Math.max(1, Math.floor(text.length / 2));
      const chunk1 = text.slice(0, mid);
      const chunk2 = text.slice(mid);

      partial.content[1].text = chunk1;
      stream.push({ type: "text_delta", contentIndex: 1, delta: chunk1, partial: { ...partial } });

      if (gateDir) {
        fs.writeFileSync(
          path.join(gateDir, `turn_${turnId}_chunk1_emitted.json`),
          JSON.stringify({ turnId, chunk1, time: Date.now() }, null, 2)
        );
      }

      await sleep(120);
      if (isAborted || (gateDir && fs.existsSync(path.join(gateDir, "abort.flag")))) {
        abortAndEnd();
        return;
      }

      // 3. Gated completion barrier (honoring abort signal and gate release)
      if (gateDir) {
        const gateEnable = path.join(gateDir, "enable_gate.flag");
        const gateRelease = path.join(gateDir, `turn_${turnId}_release_completion.flag`);
        const abortFlag = path.join(gateDir, "abort.flag");

        if (fs.existsSync(gateEnable)) {
          const deadline = Date.now() + 15000;
          while (!fs.existsSync(gateRelease) && !fs.existsSync(abortFlag)) {
            if (isAborted || options?.signal?.aborted) {
              abortAndEnd();
              return;
            }
            if (Date.now() > deadline) {
              throw new Error(`Gate timeout waiting for ${gateRelease}`);
            }
            await sleep(20);
          }
        }
      }

      if (isAborted || (gateDir && fs.existsSync(path.join(gateDir, "abort.flag")))) {
        abortAndEnd();
        return;
      }

      partial.content[1].text = text;
      stream.push({ type: "text_delta", contentIndex: 1, delta: chunk2, partial: { ...partial } });
      stream.push({ type: "text_end", contentIndex: 1, content: text, partial: { ...partial } });

      if (gateDir) {
        fs.writeFileSync(
          path.join(gateDir, `turn_${turnId}_chunk2_emitted.json`),
          JSON.stringify({ turnId, chunk2, time: Date.now() }, null, 2)
        );
      }

      await sleep(120);
      if (isAborted || (gateDir && fs.existsSync(path.join(gateDir, "abort.flag")))) {
        abortAndEnd();
        return;
      }

      partial.stopReason = "stop";
      stream.push({ type: "done", reason: "stop", message: { ...partial } });
      stream.end({ ...partial });

      if (gateDir) {
        fs.writeFileSync(
          path.join(gateDir, `turn_${turnId}_completed.json`),
          JSON.stringify({ turnId, text, time: Date.now() }, null, 2)
        );
      }
    } catch (err) {
      if (gateDir) {
        fs.writeFileSync(
          path.join(gateDir, `turn_${turnId}_error.json`),
          JSON.stringify({ turnId, error: err.message, stack: err.stack }, null, 2)
        );
      }
      stream.push({ type: "error", error: { message: err.message } });
    }
  }, 10);

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
      reasoning: true,
    },
  ],
  api: {
    stream: streamHandler,
    streamSimple: streamHandler,
  },
});

export default function (api) {
  api.registerProvider(scriptedProvider);
}
