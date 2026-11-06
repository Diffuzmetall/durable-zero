import type { Socket } from "node:net";
import { Writable } from "node:stream";

type Packet = { data: string | Record<string, unknown>; bytes: number };
const MAX_QUEUED_EVENT_BYTES = 8 * 1024 * 1024;
// Keep a count-bounded reserve for large native terminal frames and RPC replies.
const MAX_QUEUED_LARGE_FRAMES = 4;

/** One bounded output path for native RPC replies and causal events, with replaceable snapshots. */
export function createClientOutput(socket: Socket) {
  const events: Packet[] = [];
  let queuedBytes = 0;
  let oversizedQueued = 0;
  let view: Packet | undefined;
  let graph: Packet | undefined;
  const flush = () => {
    while (!socket.destroyed && !socket.writableNeedDrain) {
      const packet = events.shift() ?? graph ?? view;
      if (!packet) return;
      if (packet === graph) graph = undefined;
      else if (packet === view) view = undefined;
      else if (packet.bytes > MAX_QUEUED_EVENT_BYTES) oversizedQueued--;
      else queuedBytes -= packet.bytes;
      socket.write(typeof packet.data === "string" ? packet.data : JSON.stringify(packet.data) + "\n");
    }
  };
  const enqueue = (packet: Packet) => {
    if (socket.destroyed) return;
    const oversized = packet.bytes > MAX_QUEUED_EVENT_BYTES;
    if (oversized ? oversizedQueued >= MAX_QUEUED_LARGE_FRAMES : queuedBytes + packet.bytes > MAX_QUEUED_EVENT_BYTES) {
      socket.destroy();
      return;
    }
    if (oversized) oversizedQueued++;
    else queuedBytes += packet.bytes;
    events.push(packet);
    flush();
  };
  // The protocol writes complete JSON lines. Replies share the same bound as causal notifications.
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      enqueue({ data: chunk.toString("utf8"), bytes: chunk.length });
      callback();
    },
  });
  socket.on("drain", flush);
  socket.once("close", () => {
    socket.off("drain", flush);
    events.length = 0;
    queuedBytes = 0;
    oversizedQueued = 0;
    view = graph = undefined;
  });
  const notify = (method: string, params: Record<string, unknown>) => {
    if (socket.destroyed) return;
    const data = { jsonrpc: "2.0", method, params };
    if (method === "session/view") view = { data, bytes: 0 };
    else if (method === "session/event" && (params.event as { type?: string } | undefined)?.type === "runtime_graph_snapshot") graph = { data, bytes: 0 };
    else {
      const line = JSON.stringify(data) + "\n";
      enqueue({ data: line, bytes: Buffer.byteLength(line) });
      return;
    }
    flush();
  };
  return { output, notify };
}
