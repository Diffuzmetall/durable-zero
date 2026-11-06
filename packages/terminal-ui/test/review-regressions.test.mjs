import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { activityStatus, activityCounts } from "../vendor/extensions/activity-panel/activity.js";

async function until(predicate, label) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, label);
    await delay(10);
  }
}

test("native summary rows report unavailable rather than inferred idle", () => {
  assert.equal(activityStatus({ id: 2, label: "Child" }).kind, "unavailable");
  assert.equal(activityCounts([{ id: 2, label: "Child" }]).unavailable, 1);
  assert.equal(activityStatus({ id: 2, label: "Child", inbox: { items: [] } }).kind, "unavailable");
  assert.equal(activityStatus({ id: 2, label: "Child", live: {} }).kind, "idle");
  assert.equal(activityStatus({ id: 2, label: "Child", live: { run: { id: 5 } } }).kind, "working");
});

test("normal model picker rejects a selection after the conversation changes", { timeout: 8000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "zero-picker-"));
  const child = fork(new URL("fixtures/model-picker.mjs", import.meta.url), [], {
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
  await until(() => messages.includes("ready"), `UI did not become ready: ${error}`);
  child.stdin.write("/model\r");
  await until(() => stripVTControlCharacters(output).includes("Select model"), "normal picker did not open");
  child.send("switch");
  await until(() => messages.includes("switched"), "native conversation did not change");
  child.stdin.write("\r");
  await until(() => messages.some(message => message?.model) || stripVTControlCharacters(output).includes("Conversation changed"), "picker did not handle the selection");
  assert.ok(!messages.some(message => message?.model), "normal picker switched the model in a different conversation");
  assert.match(stripVTControlCharacters(output), /Conversation changed/);
  child.send("detach");
  const [code] = await exited;
  assert.equal(code, 0, error);
});
