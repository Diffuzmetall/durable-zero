import { createConnection } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { StdioJsonRpcServer } from "@durable-zero/protocol";

export function runtimeSocketPath(sessionDir: string): string {
  return resolve(sessionDir, ".terminal", "runtime.sock");
}

export async function connectRuntime(
  sessionDir: string,
  onNotification: (method: string, params: Record<string, unknown>) => void = () => {},
) {
  const socket = createConnection(runtimeSocketPath(sessionDir));
  await once(socket, "connect");
  const rpc = new StdioJsonRpcServer({
    stdin: socket,
    stdout: socket,
    handler: async (method, params) => { onNotification(method, params); },
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
