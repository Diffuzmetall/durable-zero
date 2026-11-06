import { createConnection } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { StdioJsonRpcServer } from "@durable-zero/protocol";
import { z } from "zod";

export const mcpTerminalOperation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("write"), data: z.string() }),
  z.object({ op: z.literal("setTitle"), title: z.string() }),
  z.object({ op: z.literal("setProgress"), active: z.boolean() }),
  z.object({ op: z.literal("setProgramStatus"), status: z.object({
    state: z.enum(["idle", "working", "blocked", "done", "error", "clear"]),
    app: z.string().optional(), kind: z.enum(["permission", "question", "auth"]).optional(), message: z.string().optional(),
  }).transform(status => ({ state: status.state,
    ...(status.app === undefined ? {} : { app: status.app }),
    ...(status.kind === undefined ? {} : { kind: status.kind }),
    ...(status.message === undefined ? {} : { message: status.message }),
  })) }),
  z.object({ op: z.literal("drainInput"), maxMs: z.number().optional(), idleMs: z.number().optional() }),
]);
export type McpTerminalOperation = z.infer<typeof mcpTerminalOperation>;

export function runtimeSocketPath(sessionDir: string): string {
  return resolve(sessionDir, ".terminal", "runtime.sock");
}

export async function connectRuntime(
  sessionDir: string,
  onNotification: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown> = () => {},
) {
  const socket = createConnection(runtimeSocketPath(sessionDir));
  await once(socket, "connect");
  const rpc = new StdioJsonRpcServer({
    stdin: socket,
    stdout: socket,
    handler: async (method, params) => onNotification(method, params),
  });
  socket.on("error", () => socket.destroy());
  const closed = new Promise<void>((done) => socket.once("close", () => { rpc.stop(); done(); }));
  rpc.start();
  return {
    request: (method: string, params: Record<string, unknown> = {}) => {
      if (socket.destroyed) return Promise.reject(new Error("Disconnected. Reconnect to inspect the session; do not automatically resubmit."));
      return rpc.request(method, params);
    },
    closed,
    close: () => { rpc.stop(); socket.destroy(); },
  };
}
