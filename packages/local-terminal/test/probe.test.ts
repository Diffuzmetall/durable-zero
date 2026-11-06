import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const source = new URL("../src/probe.ts", import.meta.url).href;
async function fixture(t: test.TestContext, events: unknown[] = []) {
  const directory = await mkdtemp(join(tmpdir(), "zero-probe-"));
  await mkdir(join(directory, ".terminal"));
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const entries = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, conversationId: 1, kind: "pi.user",
    model: [{ role: "user", content: `native-history-${i + 1}`, timestamp: i }] }));
  const view = { session: { id: "probe", directory, cwd: directory },
    conversation: { conversation: { id: 1 }, entries, docs: {} }, conversations: [{ id: 1, label: "Main" }], models: [], notices: [] };
  const server = createServer(socket => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString();
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line) continue;
        const request = JSON.parse(line);
        requests.push(request);
        void (async () => {
          let result: unknown;
          if (request.method === "session/getView") result = { revision: 0, view };
          else if (request.method === "session/getTranscript") {
            // The old path waits while piped lines drain without an attached iterator.
            await delay(80);
            result = { entries: entries.slice(0, 256).map(entry => ({ id: String(entry.id), role: "user", text: entry.model[0].content })) };
          } else if (request.method === "session/prompt") {
            result = { status: "accepted", id: "123" };
            for (const event of events) socket.write(JSON.stringify({ jsonrpc: "2.0", method: "session/event", params: { event } }) + "\n");
          } else result = { ok: true };
          if (!socket.destroyed) socket.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
        })();
      }
    });
  });
  server.listen(join(directory, ".terminal", "runtime.sock"));
  await once(server, "listening");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `import {main} from ${JSON.stringify(source)}; await main(["--session-dir", ${JSON.stringify(directory)}]);`], { stdio: "pipe" });
  let output = ""; let error = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { error += chunk; });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return { child, requests, output: () => output, error: () => error, exited };
}

test("probe preserves immediate piped input and uses the complete native history", { timeout: 8000 }, async t => {
  const run = await fixture(t);
  run.child.stdin.end("immediate prompt\n/detach\n");
  const [code] = await run.exited;
  assert.equal(code, 0, run.error());
  assert.ok(run.requests.some(request => request.method === "session/prompt" && request.params.content === "immediate prompt"), "immediate piped prompt was lost");
  assert.match(run.output(), /\[accepted: 123\]/);
  assert.match(run.output(), /\[user\] native-history-300\b/);
  assert.ok(!run.requests.some(request => request.method === "session/getTranscript"), "probe requested an oldest-first transcript page");
});

test("probe prints message_end text once and appends only an unprinted streamed suffix", { timeout: 8000 }, async t => {
  const run = await fixture(t, [
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "nonstreamed answer" }] } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "streamed prefix" } },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "streamed prefix plus suffix" }] } },
  ]);
  const readyUntil = Date.now() + 5000;
  while (!run.output().includes("> ")) {
    assert.equal(run.child.exitCode, null, run.error());
    assert.ok(Date.now() < readyUntil, "probe did not become ready");
    await delay(10);
  }
  run.child.stdin.end("answer\n/detach\n");
  const [code] = await run.exited;
  assert.equal(code, 0, run.error());
  assert.equal(run.output().split("nonstreamed answer").length - 1, 1);
  assert.equal(run.output().split("streamed prefix").length - 1, 1);
  assert.match(run.output(), /streamed prefix plus suffix/);
});
