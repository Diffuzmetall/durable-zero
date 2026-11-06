import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { createClientOutput } from "../src/notifications.ts";

function fixture(blocked = false) {
  const output: { method?: string; params: Record<string, unknown>; id?: number }[] = [];
  class Stream extends EventEmitter {
    writableNeedDrain = blocked;
    destroyed = false;
    write(line: string) { output.push(JSON.parse(line)); return !this.writableNeedDrain; }
    destroy() { this.destroyed = true; this.emit("close"); return this; }
  }
  const socket = new Stream();
  const transport = createClientOutput(socket as unknown as Socket);
  const drain = () => { socket.writableNeedDrain = false; socket.emit("drain"); };
  return { socket, output, send: transport.notify, writer: transport.output, drain };
}

test("an available reader receives notifications immediately", () => {
  const { send, output } = fixture();
  send("session/view", { revision: 1 });
  send("session/event", { event: { type: "message_end" } });
  assert.deepEqual(output.map((value) => value.method), ["session/view", "session/event"]);
});

test("a blocked reader retains only the latest view and graph, preserving causal event order", () => {
  const { send, output, drain } = fixture(true);
  for (let revision = 1; revision <= 100; revision++) {
    send("session/view", { revision });
    send("session/event", { event: { type: "runtime_graph_snapshot", revision } });
  }
  send("session/event", { event: { type: "tool_execution_start" } });
  send("session/event", { event: { type: "tool_execution_end" } });
  assert.equal(output.length, 0);
  drain();
  assert.deepEqual(output.slice(0, 2).map((value) => (value.params.event as any).type), ["tool_execution_start", "tool_execution_end"]);
  assert.equal((output[2]!.params.event as any).revision, 100);
  assert.equal(output[3]!.params.revision, 100);
  assert.equal(output.length, 4);
});

test("excess causal backlog disconnects the reader instead of growing indefinitely", () => {
  const { send, socket, output, drain } = fixture(true);
  const delta = "x".repeat(5 * 1024 * 1024);
  send("session/event", { event: { type: "message_update", delta } });
  send("session/event", { event: { type: "message_update", delta } });
  assert.equal(socket.destroyed, true);
  drain();
  assert.equal(output.length, 0);
});

test("the full oversized native terminal sequence and a reply can drain together", () => {
  const { send, writer, socket, output, drain } = fixture(true);
  const message = { role: "assistant", content: [{ type: "text", text: "x".repeat(9 * 1024 * 1024) }] };
  send("session/event", { event: { type: "message_start" } });
  send("session/event", { event: { type: "message_end", message } });
  send("session/event", { event: { type: "turn_end", message } });
  send("session/event", { event: { type: "agent_end", messages: [message] } });
  writer.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: message }) + "\n");
  send("session/event", { event: { type: "turn_complete" } });
  assert.equal(socket.destroyed, false);
  drain();
  assert.deepEqual(output.filter((value) => value.method).map((value) => (value.params.event as any).type), ["message_start", "message_end", "turn_end", "agent_end", "turn_complete"]);
  assert.equal(output[4]!.id, 1);
});

test("oversized frame count is bounded", () => {
  const { writer, socket } = fixture(true);
  const reply = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "x".repeat(9 * 1024 * 1024) }) + "\n";
  for (let i = 0; i < 4; i++) writer.write(reply);
  assert.equal(socket.destroyed, false);
  writer.write(reply);
  assert.equal(socket.destroyed, true);
});

test("RPC replies share the causal byte bound", () => {
  const { writer, socket, output, drain } = fixture(true);
  const reply = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "x".repeat(5 * 1024 * 1024) }) + "\n";
  writer.write(reply);
  assert.equal(socket.destroyed, false);
  writer.write(reply);
  assert.equal(socket.destroyed, true);
  drain();
  assert.equal(output.length, 0);
});

test("a reply and notifications retain their causal queue order", () => {
  const { writer, send, output, drain } = fixture(true);
  send("session/event", { event: { type: "message_end" } });
  writer.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }) + "\n");
  send("session/event", { event: { type: "turn_complete" } });
  drain();
  assert.equal((output[0]!.params.event as any).type, "message_end");
  assert.equal(output[1]!.id, 1);
  assert.equal((output[2]!.params.event as any).type, "turn_complete");
});

test("closing a reader discards its pending notifications", () => {
  const { send, socket, output, drain } = fixture(true);
  send("session/view", { revision: 1 });
  socket.destroy();
  drain();
  send("session/view", { revision: 2 });
  assert.equal(output.length, 0);
});
