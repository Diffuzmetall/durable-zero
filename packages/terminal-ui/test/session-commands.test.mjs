import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";

for (const command of ["/new", "/clear", "/name New name", "/resume"]) {
  test(`rich terminal session command ${command}`, { timeout: 7000 }, async t => {
    const agent = await mkdtemp(join(tmpdir(), "zero-session-ui-"));
    const child = fork(new URL("fixtures/session-commands.mjs", import.meta.url), [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"], env: { ...process.env, PI_CODING_AGENT_DIR: agent },
    });
    const messages = []; let output = "", error = "";
    child.on("message", m => messages.push(m)); child.stdout.on("data", c => { output += c; }); child.stderr.on("data", c => { error += c; });
    const exited = once(child, "exit");
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
      await rm(agent, { recursive: true, force: true });
    });
    async function until(check, label) {
      const end = Date.now() + 2500;
      while (!check()) { assert.ok(Date.now() < end, `${label}: ${stripVTControlCharacters(output)} ${error}`); await delay(10); }
    }
    await until(() => messages.includes("ready"), "ready");
    child.stdin.write(`${command}\r`);
    if (command === "/resume") {
      await until(() => stripVTControlCharacters(output).includes("Other session"), "session picker");
      child.stdin.write("\r");
      await until(() => messages.some(m => m?.selectedSession === "/other"), "resume selection");
    } else if (command.startsWith("/name")) {
      await until(() => messages.some(m => m?.rename === "New name"), "rename");
      child.send("detach");
    } else {
      await until(() => messages.some(m => m?.selectedSession === null), "new-session request");
    }
    await exited;
    assert.equal(child.exitCode, 0, error);
    assert.equal(messages.filter(m => m?.prompt).length, 0, "session commands must never become prompts");
    assert.doesNotMatch(stripVTControlCharacters(output), /Unsupported capability/);
  });
}
