import { createServer, createConnection, type Socket } from "node:net";
import { chmod, mkdir, lstat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { runtimeSocketPath } from "./client.ts";
import { createClientOutput } from "./notifications.ts";
import { expandSkillCommand } from "./skills.ts";
export { runtimeSocketPath } from "./client.ts";
import { z } from "zod";
import { assembleDurableZero, type AssembleDurableZeroOptions, type DurableZeroInstance } from "@durable-zero/runner";
import { acquireSessionLock, parseConversationId } from "@durable-zero/adapter-pi-durable";
import { StdioJsonRpcServer, JsonRpcInvalidParamsError, JsonRpcMethodNotFoundError } from "@durable-zero/protocol";

const conversation = z.object({ conversationId: z.string().min(1).optional() }).strict();
const requests = {
  "session/prompt": z.object({
    content: z.string().min(1).refine((content) => content.trim().length > 0),
    options: z.object({
      conversationId: z.string().min(1).optional(),
      deliverAs: z.enum(["steer", "followUp"]).optional(),
    }).strict().optional(),
  }).strict(),
  "session/abort": conversation,
  "session/getState": conversation,
  "session/getTranscript": conversation.extend({ limit: z.number().int().positive().optional() }),
  "session/getStats": conversation,
  "session/getView": z.object({}).strict(),
  "session/compact": z.object({ instructions: z.string().optional() }).strict(),
  "models/set": z.object({
    provider: z.string().trim().min(1), modelId: z.string().trim().min(1),
    conversationId: z.string().regex(/^[1-9]\d*$/).optional(),
  }).strict(),
  "models/cycleThinking": z.object({}).strict(),
  "session/toggleTasks": z.object({}).strict(),
  "session/switchConversation": z.object({ conversationId: z.string().regex(/^[1-9]\d*$/) }).strict(),
};

export interface RuntimeOptions {
  sessionDir: string;
  cwd?: string;
  provider?: string;
  model?: string;
  extensions?: string[];
}

/** Owns one Zero assembly. A connection owns only its transport, never the Harness. */
export async function startRuntime(options: RuntimeOptions) {
  const socketPath = runtimeSocketPath(options.sessionDir);
  if (Buffer.byteLength(socketPath) > 103) {
    throw new Error("Unix socket path is too long. Use a shorter --session-dir path.");
  }
  await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
  // Reuse Zero's public process-owner lease for the endpoint directory, not a second Harness/session store.
  const releaseEndpoint = await acquireSessionLock(dirname(socketPath), options.cwd ?? process.cwd(), "terminal-transport");
  const input = new PassThrough();
  const output = new PassThrough();
  const clients = new Map<Socket, ReturnType<typeof createClientOutput>["notify"]>();
  let instance: DurableZeroInstance | undefined;
  let unsubscribeView: (() => void) | undefined;
  let viewRevision = 0;
  const envelope = () => ({
    view: instance!.view!.current(), revision: viewRevision,
    resources: {
      skills: (instance!.resources?.getSkills() ?? []).map(({ name, description, filePath, baseDir }) => ({ name, description, filePath, baseDir })),
      enableSkillCommands: instance!.resources?.getEnableSkillCommands() ?? false,
    },
  });
  const notify = (method: string, params: Record<string, unknown>) => {
    for (const send of clients.values()) send(method, params);
  };
  // Reuse Zero's dispatcher through its public stream interface, rather than copying its routing.
  const bridge = new StdioJsonRpcServer({
    stdin: output,
    stdout: input,
    handler: async (method, params) => { notify(method, params); },
  });
  bridge.start();
  const server = createServer((socket) => {
    if (!instance) { socket.destroy(); return; }
    const transport = createClientOutput(socket);
    const client = new StdioJsonRpcServer({
      stdin: socket,
      stdout: transport.output,
      handler: async (method, params) => {
        if (!Object.hasOwn(requests, method)) throw new JsonRpcMethodNotFoundError(method);
        const schema = requests[method as keyof typeof requests];
        const parsed = schema.safeParse(params);
        if (!parsed.success) throw new JsonRpcInvalidParamsError(parsed.error.message);
        const engine = instance!.engine;
        switch (method) {
          case "session/getView": return envelope();
          case "session/prompt": {
            const prompt = parsed.data as z.infer<typeof requests["session/prompt"]>;
            const content = await expandSkillCommand(prompt.content, instance!.resources?.getSkills() ?? []);
            return bridge.request(method, { ...prompt, content });
          }
          case "session/compact": await engine.compact((parsed.data as z.infer<typeof requests["session/compact"]>).instructions); return { ok: true };
          case "models/set": {
            const { conversationId, ...model } = parsed.data as z.infer<typeof requests["models/set"]>;
            await instance!.controller!.setModel(model, conversationId === undefined ? undefined : parseConversationId(conversationId));
            return { ok: true };
          }
          case "models/cycleThinking": await instance!.controller!.cycleThinking(); return { ok: true };
          case "session/toggleTasks": await instance!.controller!.toggleTasks(); return { ok: true };
          case "session/switchConversation": await instance!.controller!.switchConversation(parseConversationId((parsed.data as z.infer<typeof requests["session/switchConversation"]>).conversationId)); return { ok: true };
          default: return bridge.request(method, parsed.data);
        }
      },
    });
    clients.set(socket, transport.notify);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => { client.stop(); clients.delete(socket); });
    client.start();
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    for (const socket of clients.keys()) socket.destroy();
    if (server.listening) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    unsubscribeView?.();
    bridge.stop();
    input.destroy();
    output.destroy();
    try { await instance?.close(); } finally { await releaseEndpoint(); }
  })();
  try {
    const endpoint = await lstat(socketPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (endpoint) {
      if (!endpoint.isSocket()) throw new Error(`Refusing to remove a non-socket endpoint: ${socketPath}`);
      const probe = createConnection(socketPath);
      probe.setTimeout(500, () => probe.destroy(new Error("Endpoint probe timed out; refusing socket removal")));
      try {
        await once(probe, "connect");
        throw new Error(`Session already has a live endpoint: ${socketPath}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      } finally { probe.destroy(); }
      await unlink(socketPath);
    }
    const listening = once(server, "listening");
    server.listen(socketPath);
    await listening;
    await chmod(socketPath, 0o600);
    const assemblyOptions: AssembleDurableZeroOptions = {
      ...options,
      sessionDir: resolve(options.sessionDir),
      noGlobalExtensions: true,
      stdin: input,
      stdout: output,
    };
    instance = await assembleDurableZero(assemblyOptions);
    if (!instance.view || !instance.controller) throw new Error("The terminal runtime requires native presentation and control ports");
    const view = instance.view;
    unsubscribeView = view.subscribe(() => { ++viewRevision; notify("session/view", envelope()); });
    return { socketPath, close };
  } catch (error) {
    await close();
    throw error;
  }
}
