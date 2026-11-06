import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { connectRuntime } from "../src/client.ts";
import { getResolvedThemeColors } from "../../terminal-ui/src/index.js";

const source = fileURLToPath(new URL("../../../", import.meta.url));
const root = process.env.ZERO_RUNTIME_ROOT ?? source;
const viewport = { columns: 110, rows: 35, kittyProtocolActive: false };
const colors = getResolvedThemeColors();
const command = { args: "", colors, keybindings: {}, ...viewport };
async function until(check: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 10000;
  while (!await check()) { assert.ok(Date.now() < deadline, label); await delay(20); }
}

test("original Pi MCP manager: real menus, control ownership, disconnect cleanup and native calls", { timeout: 35000 }, async t => {
  const base = await mkdtemp(join(tmpdir(), "zero-mcp-menu-"));
  const cwd = join(base, "workspace"), agent = join(base, "agent"), sessionDir = join(base, "session");
  await mkdir(cwd); await mkdir(agent);
  const configPath = join(agent, "mcp.json");
  await writeFile(configPath, JSON.stringify({ mcpServers: { fixture: {
    command: process.execPath, args: [join(source, "packages/local-runtime/test/fixtures/mcp-server.mjs"), "MCP_MENU"], exposure: "codemode",
  } } }));
  const runtime = spawn(process.execPath, [join(root, "packages/local-runtime/bin/runtime.mjs"),
    "--session-dir", sessionDir, "--cwd", cwd, "--extension", process.env.ZERO_PROVIDER_FIXTURE ?? join(source, "packages/local-runtime/test/fixtures/provider.ts"),
    "--provider", "local-test", "--model", "scripted"], {
    env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: agent, PI_ADDITIONAL_EXTENSIONS: "" }, stdio: "pipe",
  });
  let startup = "", stderr = "", screen = "";
  runtime.stdout.on("data", data => { startup += data; }); runtime.stderr.on("data", data => { stderr += data; });
  const exited = once(runtime, "exit");
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const client of connections) client.close();
    if (runtime.exitCode === null && runtime.signalCode === null) {
      runtime.kill("SIGTERM");
      const watchdog = setTimeout(() => runtime.kill("SIGKILL"), 2000);
      try { await exited; } finally { clearTimeout(watchdog); }
    }
    await rm(base, { recursive: true, force: true });
  });
  await until(() => { assert.equal(runtime.exitCode, null, stderr); return startup.includes('"status":"ready"'); }, "runtime readiness");
  const receive = (method: string, params: Record<string, unknown>) => {
    if (method === "session/mcpTerminal" && params.op === "write") screen += stripVTControlCharacters(String(params.data));
  };
  let client = await connectRuntime(sessionDir, receive); connections.push(client);
  const observer = await connectRuntime(sessionDir); connections.push(observer);
  const identity = await observer.request("runtime/info");
  let settled = false;
  const menu = client.request("session/mcpCommand", command).then(() => { settled = true; });
  await until(() => screen.includes("MCP servers") && screen.includes("fixture"), `native root menu: ${stderr}`);
  assert.equal(settled, false);
  await assert.rejects(observer.request("session/mcpInput", { data: "\r" }), /does not own/);
  await assert.rejects(observer.request("session/mcpCommand", command), /already open/);
  await assert.rejects(observer.request("session/reload"), /close the MCP manager/);
  assert.deepEqual(await observer.request("runtime/info"), identity, "manager blocked ordinary runtime commands");
  screen = "";
  await client.request("session/mcpInput", { data: "\r" });
  await until(() => screen.includes("Reconnect") && screen.includes("Disable"), `native server menu: ${screen}`);
  await client.request("session/mcpResize", { ...viewport, columns: 85 });
  // Navigate the real SDK SelectList: Tools, Reconnect, Exposure.
  screen = "";
  await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\r" });
  await until(() => screen.includes("deferred") && screen.includes("direct"), `native exposure menu: ${screen}`);
  await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\r" });
  await until(async () => JSON.parse(await readFile(configPath, "utf8")).mcpServers.fixture.exposure === "direct", "native manager did not save exposure");
  await until(() => screen.includes("MCP server fixture"), "server menu after exposure change");
  screen = "";
  await client.request("session/mcpInput", { data: "\r" });
  await until(() => screen.includes("zero_probe"), "native offered tools screen");
  screen = "";
  await client.request("session/mcpInput", { data: "\x1b" });
  await until(() => screen.includes("Reconnect"), "return from offered tools");
  screen = "";
  await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\r" });
  await until(() => screen.includes("Tools") && screen.includes("connected"), "native reconnect did not settle");
  screen = "";
  await client.request("session/mcpInput", { data: "\x1b[5~" });
  for (let i = 0; i < 3; i++) await client.request("session/mcpInput", { data: "\x1b[B" });
  await client.request("session/mcpInput", { data: "\r" });
  await until(async () => JSON.parse(await readFile(configPath, "utf8")).mcpServers.fixture.enabled === false && screen.includes("Enable"), "native disable did not save/refresh");
  screen = "";
  await client.request("session/mcpInput", { data: "\r" });
  await until(async () => JSON.parse(await readFile(configPath, "utf8")).mcpServers.fixture.enabled !== false && screen.includes("Tools") && screen.includes("connected"), "native enable did not reconnect");
  screen = "";
  await client.request("session/mcpInput", { data: "\x1b" });
  await until(() => screen.includes("MCP servers"), "return to root menu");
  await client.request("session/mcpInput", { data: "\x1b" });
  await menu;
  console.log("PASS original SDK root/server/tools/exposure menus, reconnect, enable/disable, saved configuration, resize, Escape and ownership rejection");
  // Disconnect inside a nested menu must close only the UI, not Harness or the MCP connections.
  screen = "";
  const disconnectedMenu = client.request("session/mcpCommand", { ...command, keybindings: { "tui.select.cancel": "ctrl+x" } }).catch(() => {});
  await until(() => screen.includes("MCP servers"), "second root menu");
  screen = "";
  await client.request("session/mcpInput", { data: "\r" });
  await until(() => screen.includes("Reconnect"), "nested menu before disconnect");
  await observer.request("session/prompt", { content: "slow:abort while manager is open" });
  await observer.request("session/abort");
  client.close(); await disconnectedMenu;
  await until(async () => {
    try { await observer.request("session/reload"); return true; }
    catch (error) { if (String(error).includes("close the MCP manager")) return false; throw error; }
  }, "disconnected manager did not release its command UI");
  assert.deepEqual(await observer.request("runtime/info"), identity);
  client = await connectRuntime(sessionDir, receive); connections.push(client);
  const receipt: any = await client.request("session/prompt", { content: "invoke:" + JSON.stringify({ name: "mcp__fixture__zero_probe", arguments: {} }) });
  await until(async () => (await client.request("session/getTranscript") as any).entries.some((e: any) => e.role === "assistant" && e.text?.includes("MCP_MENU")), "native MCP call after UI disconnect/reload").catch(async error => {
    console.error(JSON.stringify({ receipt, entries: (await client.request("session/getTranscript") as any).entries.slice(-4),
      notices: (await client.request("session/getView") as any).view.notices, stderr }));
    throw error;
  });
  assert.ok(receipt.id);
  console.log("PASS nested-menu disconnect releases UI; same runtime survives; reloaded native MCP tool executes");
});
