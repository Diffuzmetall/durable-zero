import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

async function until(predicate, label) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, label);
    await delay(10);
  }
}

test("skill picker inserts only; ordinary Enter forwards the explicit command", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "zero-skills-ui-"));
  const child = fork(new URL("fixtures/skill-picker.mjs", import.meta.url), [], {
    stdio: ["pipe", "pipe", "pipe", "ipc"], env: { ...process.env, PI_CODING_AGENT_DIR: directory },
  });
  const messages = []; let output = ""; let error = "";
  child.on("message", message => messages.push(message));
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { error += chunk; });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    await rm(directory, { recursive: true, force: true });
  });
  await until(() => messages.includes("ready"), `UI startup: ${error}`);
  child.stdin.write("/skill-selector example\r");
  await until(() => stripVTControlCharacters(output).includes("Example picker skill"), "picker did not show the runtime catalogue");
  child.stdin.write("\r");
  await until(() => stripVTControlCharacters(output).includes("/skill:example"), "picker did not insert skill command");
  assert.equal(messages.filter(message => message?.content).length, 0, "picker submitted without user confirmation");
  child.stdin.write("explain this\r");
  await until(() => messages.some(message => message?.content), "Enter rejected the skill command");
  assert.deepEqual(messages.find(message => message?.content), { content: "/skill:example explain this", deliverAs: "steer" });
  assert.doesNotMatch(stripVTControlCharacters(output), /Attention state unavailable|Native automation state unavailable|Unsupported command/);
  child.send("detach");
  const [code] = await exited;
  assert.equal(code, 0, error);
});
