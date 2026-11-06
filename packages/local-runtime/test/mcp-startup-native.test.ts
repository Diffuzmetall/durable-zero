import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectRuntime } from "../src/client.ts";

const source = fileURLToPath(new URL("../../../", import.meta.url));
const root = process.env.ZERO_RUNTIME_ROOT ?? source;
const installed = process.env.ZERO_INSTALLED_PREFIX;
const runtimeModule = installed ? join(installed, "node_modules/@local-durable/runtime/dist/index.js") : join(root, "packages/local-runtime/dist/index.js");
async function until(check: () => boolean | Promise<boolean>, label: string, maxMs = 4000) {
  const deadline = Date.now() + maxMs;
  while (!await check()) { assert.ok(Date.now() < deadline, label); await delay(20); }
}

test("optional MCP stalled after initialize cannot block startup/reload; native shutdown cancels its transport", { timeout: 20000 }, async t => {
  const base = await mkdtemp(join(tmpdir(), "zero-mcp-startup-"));
  const agent = join(base, "agent"), cwd = join(base, "workspace"), sessionDir = join(base, "session");
  await mkdir(agent); await mkdir(cwd);
  const toolResponse = join(base, "provider-tool-response.json");
  let initialized = 0, cancelled = 0;
  const pending = new Set<http.ServerResponse>();
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
    const message = JSON.parse(body);
    if (message.method === "initialize") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {
        protocolVersion: message.params.protocolVersion, capabilities: {}, serverInfo: { name: "owned-stalled-peer", version: "1" },
      } }));
    } else if (message.method === "notifications/initialized") {
      initialized++; pending.add(res);
      res.once("close", () => { pending.delete(res); cancelled++; });
      // Deliberately never acknowledge this POST: MCP requestTimeoutMs does not cover notifications.
    } else { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [] } })); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  await writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { stalled: {
    url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/mcp`,
    headers: { Authorization: "Bearer isolated-test-fixture" }, exposure: "codemode", timeout: 1,
  } } }));
  const workerPath = join(base, "worker.mjs");
  await writeFile(workerPath, `
    import { startRuntime } from ${JSON.stringify(pathToFileURL(runtimeModule).href)};
    const runtime = await startRuntime(${JSON.stringify({ sessionDir, cwd, extensions: [process.env.ZERO_PROVIDER_FIXTURE ?? join(source, "packages/local-runtime/test/fixtures/provider.ts")], provider: "local-test", model: "scripted" })});
    process.on("message", async message => {
      if (message !== "close") return;
      await runtime.close();
      console.log("NATIVE_RUNTIME_CLOSED");
      process.disconnect();
    });
    console.log("NATIVE_RUNTIME_READY");
  `);
  const workers: ReturnType<typeof worker>[] = [];
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const client of connections) client.close();
    for (const { child, exited } of workers) if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      const watchdog = setTimeout(() => child.kill("SIGKILL"), 1000);
      try { await exited; } finally { clearTimeout(watchdog); }
    }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(base, { recursive: true, force: true });
  });
  function worker() {
    const child = spawn(process.execPath, [workerPath], {
      env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: agent, PI_ADDITIONAL_EXTENSIONS: "", ZERO_FIXTURE_TOOL_RESPONSE: toolResponse }, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
    const result = { child, exited: once(child, "exit"), stdout: () => stdout, stderr: () => stderr };
    workers.push(result); return result;
  }
  const first = worker();
  await until(() => first.stdout().includes("NATIVE_RUNTIME_READY"), "stalled notification blocked runtime readiness");
  await until(() => initialized === 1, "peer did not reach the stalled post-initialize notification");
  const client = await connectRuntime(sessionDir); connections.push(client);
  const identity = await client.request("runtime/info");
  await client.request("session/prompt", { content: "No external model or MCP call" });
  await until(async () => (await client.request("session/getTranscript") as any).entries.some((entry: any) => entry.role === "assistant"), "optional stalled peer blocked an ordinary native turn");
  await client.request("session/prompt", { content: "invoke:" + JSON.stringify({ name: "codemode", arguments: { code: 'text(await searchTools("zero_probe"));' } }) });
  await until(async () => {
    try { return JSON.parse(await readFile(toolResponse, "utf8")).name === "codemode"; } catch { return false; }
  }, "offline provider did not produce the real discovery call");
  const waiting: any = (await client.request("session/getView") as any).view;
  assert.ok(waiting.conversation.docs["pi.live"].generation, "generation is not awaiting readiness");
  assert.ok(!Object.values(waiting.tasks.tasks).some((task: any) => task.kind === "pi.tool"), "tool snapshot was taken before MCP readiness");
  await Promise.race([client.request("session/abort"), delay(2000).then(() => { throw new Error("MCP readiness ignored native abort"); })]);
  assert.equal((await client.request("session/getView") as any).view.conversation.docs["pi.live"].run, undefined);
  assert.equal(pending.size, 1, "turn abort unexpectedly disposed the runtime-owned connection");
  await Promise.race([client.request("session/reload"), delay(4000).then(() => { throw new Error("stalled notification blocked reload"); })]);
  assert.deepEqual(await client.request("runtime/info"), identity);
  await until(() => initialized === 2 && cancelled >= 1, "reload did not cancel the old connection before reopening");
  client.close();
  first.child.send("close");
  await until(() => first.child.exitCode !== null, "native close left owned MCP handles alive");
  await first.exited;
  assert.equal(first.child.exitCode, 0, first.stderr());
  assert.match(first.stdout(), /NATIVE_RUNTIME_CLOSED/);
  assert.equal(pending.size, 0, "shutdown left an initialized notification transport open");
  // The same directory can be acquired again only after the first native owner closed.
  const reopened = worker();
  await until(() => reopened.stdout().includes("NATIVE_RUNTIME_READY"), "native session owner was not released after close");
  await until(() => initialized === 3, "reopened MCP connection did not start");
  reopened.child.send("close");
  await until(() => reopened.child.exitCode !== null, "reopened native close leaked handles");
  await reopened.exited;
  assert.equal(reopened.child.exitCode, 0, reopened.stderr());
  assert.equal(pending.size, 0);
  console.log("PASS stalled post-initialize HTTP peer: ready, ordinary turn, abortable discovery, reload, transport cancellation, graceful close and same-session reopen");
});
