import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

test("terminal routes /mcp to native management, never to a model prompt", { timeout: 10000 }, async t => {
  const agent = await mkdtemp(join(tmpdir(), "zero-mcp-ui-"));
  const child = fork(new URL("fixtures/mcp-command.mjs", import.meta.url), [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"], env: { ...process.env, PI_CODING_AGENT_DIR: agent },
  });
  const messages = []; let output = ""; let error = "";
  child.on("message", message => messages.push(message));
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { error += chunk; });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    await rm(agent, { recursive: true, force: true });
  });
  async function until(predicate, label) {
    const deadline = Date.now() + 2500;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, `${label}: ${stripVTControlCharacters(output)} ${error}`);
      await delay(10);
    }
  }
  await until(() => messages.includes("ready"), "startup");
  child.stdin.write("/mcp\r");
  await until(() => messages.some(m => m?.mcp === ""), "MCP manager command not delivered");
  await until(() => stripVTControlCharacters(output).split("__MCP_SCREEN_CLEARED__").at(-1).includes("ctx ?"), "editor was not repainted after native manager cleared the screen");
  child.stdin.write("/mcp reconnect fixture\r");
  await until(() => messages.some(m => m?.mcp === "reconnect fixture"), "MCP command arguments lost");
  assert.equal(messages.filter(m => m?.content).length, 0);
  assert.doesNotMatch(stripVTControlCharacters(output), /Unsupported command/);
  child.send("detach");
  const [code] = await exited;
  assert.equal(code, 0, error);
});
