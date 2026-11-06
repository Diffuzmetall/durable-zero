import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectRuntime } from "../src/client.ts";

const source = fileURLToPath(new URL("../../../", import.meta.url));
const root = process.env.ZERO_RUNTIME_ROOT ?? source;
const provider = process.env.ZERO_PROVIDER_FIXTURE ?? join(source, "packages/local-runtime/test/fixtures/provider.ts");
const peer = join(source, "packages/local-runtime/test/fixtures/mcp-server.mjs");
async function until(read: () => Promise<any>, accept: (value: any) => boolean, label: string) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(20);
  }
  throw new Error(`Timeout: ${label}`);
}

for (const exposure of ["codemode", "direct", "deferred"]) {
test(`real MCP ${exposure} discovery/call, safe resource reload and connection continuity`, { timeout: 35000 }, async t => {
  const base = await mkdtemp(join(tmpdir(), "zero-mcp-"));
  const cwd = join(base, "workspace");
  const agent = join(base, "agent");
  const sessionDir = join(base, "session");
  await mkdir(cwd); await mkdir(agent);
  const config = (generation: string) => writeFile(join(agent, "mcp.json"), JSON.stringify({ mcpServers: {
    fixture: { command: process.execPath, args: [peer, generation, "600"], exposure, env: { ZERO_MCP_TRACE: join(base, "mcp-trace") } },
  } }));
  await config("MCP_V1");
  const policy = join(base, "policy.ts");
  await writeFile(policy, `export default api => { api.on("tool_call", event => {
    if (event.toolName === "codemode" && event.input.code.includes("POLICY_BLOCK_MARKER")) return { block: true, reason: "MCP_POLICY_BLOCKED" };
  }); };`);
  const runtime = spawn(process.execPath, [join(root, "packages/local-runtime/bin/runtime.mjs"),
    "--session-dir", sessionDir, "--cwd", cwd, "--extension", provider, "--extension", policy, "--provider", "local-test", "--model", "scripted"], {
    env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: agent, PI_ADDITIONAL_EXTENSIONS: "" }, stdio: "pipe",
  });
  let stdout = ""; let stderr = "";
  runtime.stdout.on("data", chunk => { stdout += chunk; });
  runtime.stderr.on("data", chunk => { stderr += chunk; });
  const exited = once(runtime, "exit");
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const client of connections) client.close();
    if (runtime.exitCode === null && runtime.signalCode === null) { runtime.kill("SIGTERM"); await exited; }
    await rm(base, { recursive: true, force: true });
  });
  await until(async () => { assert.equal(runtime.exitCode, null, stderr); return stdout; }, v => v.includes('"status":"ready"'), "runtime ready");
  const events: any[] = [];
  const client = await connectRuntime(sessionDir, (method, params) => { if (method === "session/event") events.push(params.event); });
  connections.push(client);
  const state: any = await client.request("session/getState");
  async function callMcp(expected: string) {
    const start = events.length;
    const receipt: any = await client.request("session/prompt", { content: "invoke:" + JSON.stringify({ name: "codemode", arguments: {
      code: 'text(await searchTools("zero_probe")); text(await tools.mcp__fixture__zero_probe({}));',
    } }) });
    await until(async () => events.slice(start), v => v.some((e: any) => e.type === "turn_complete" && e.requestId === receipt.id), "native settlement");
    const transcript: any = await client.request("session/getTranscript");
    assert.ok(transcript.entries.some((e: any) => e.kind === "pi.tool-result"));
    const view: any = await client.request("session/getView");
    assert.ok(transcript.entries.some((e: any) => e.role === "assistant" && e.text?.includes(expected)), JSON.stringify({ receipt, events: events.slice(start), state: await client.request("session/getState"), entries: transcript.entries.slice(-4), notices: view.view.notices, stderr, peer: await readFile(join(base, "mcp-trace"), "utf8").catch(() => "not started") }));
  }
  await callMcp("MCP_V1");
  console.log("PASS real MCP startup, discovery and native Codemode call");
  const initial: any = await client.request("session/getView");
  await config("MCP_V2");
  const skillDir = join(cwd, ".pi/skills/reloaded");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: reloaded\ndescription: Reloaded skill\n---\nRELOADED_SKILL\n");
  await assert.rejects(client.request("session/reload", { path: join(base, "missing.ts") }), /ENOENT/);
  assert.equal((await client.request("session/getState") as any).sessionId, state.sessionId);
  await client.request("session/reload");
  const updated: any = await client.request("session/getView");
  assert.equal(updated.view.session.id, state.sessionId);
  assert.ok(updated.revision > initial.revision);
  assert.ok(updated.resources.skills.some((s: any) => s.name === "reloaded"));
  await callMcp("MCP_V2");
  console.log("PASS reload refreshes MCP/skills without changing the native session or terminal connection");
  const blockedStart = events.length;
  const blocked: any = await client.request("session/prompt", { content: "invoke:" + JSON.stringify({ name: "codemode", arguments: {
    code: 'text("POLICY_BLOCK_MARKER"); text(await tools.mcp__fixture__zero_probe({}));',
  } }) });
  await until(async () => events.slice(blockedStart), v => v.some((e: any) => e.type === "turn_complete" && e.requestId === blocked.id), "blocked native settlement");
  const blockedTranscript: any = await client.request("session/getTranscript");
  assert.ok(blockedTranscript.entries.some((e: any) => e.role === "assistant" && e.text?.includes("MCP_POLICY_BLOCKED")));
  console.log("PASS native discovery respects SDK permission hooks");
  const busy: any = await client.request("session/prompt", { content: "slow: keep running" });
  await assert.rejects(client.request("session/reload"), /busy|active work|running/i);
  await client.request("session/abort");
  await until(async () => events, v => v.some((e: any) => e.type === "turn_complete" && e.requestId === busy.id), "abort settlement");
  console.log("PASS reload refuses to interrupt active native work");
  const transcript: any = await client.request("session/getTranscript");
  assert.equal(transcript.entries.filter((e: any) => e.role === "user").length, 4);
  const calls = await readFile(join(base, "mcp-trace"), "utf8");
  assert.equal(calls.split("\n").filter(line => line === "tools/call").length, 2);
});
}
