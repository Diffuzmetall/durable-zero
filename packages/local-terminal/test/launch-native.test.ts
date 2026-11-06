import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectRuntime } from "@local-durable/runtime/client";

const root = fileURLToPath(new URL("../../../", import.meta.url));
async function until(check: () => boolean | Promise<boolean>, label: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await check()) return; await delay(25); }
  throw new Error(`Timeout: ${label}`);
}

test("short launcher starts once, survives detach, reuses its workspace session and reloads", { timeout: 25000 }, async t => {
  const base = await mkdtemp(join(tmpdir(), "zero-launch-"));
  const cwd = join(base, "workspace"); await mkdir(cwd);
  const env = { ...process.env, HOME: join(base, "home"), XDG_STATE_HOME: join(base, "state"), PI_CODING_AGENT_DIR: join(base, "agent"), PI_ADDITIONAL_EXTENSIONS: "" };
  const sessionDir = join(env.XDG_STATE_HOME, "pi-durable-zero/sessions", createHash("sha256").update(cwd).digest("hex").slice(0, 16));
  let runtimePid: number | undefined;
  const children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    if (runtimePid) {
      process.kill(runtimePid, "SIGTERM");
      await until(async () => { try { const c = await connectRuntime(sessionDir); c.close(); return false; } catch { return true; } }, "owned runtime stopped");
    }
    await rm(base, { recursive: true, force: true });
  });
  function launch(args: string[]) {
    const child = spawn(process.execPath, [join(root, "packages/local-terminal/bin/pi-durable-zero.mjs"), ...args], { env, stdio: "pipe" });
    children.push(child);
    let stdout = "", stderr = "";
    child.stdout!.on("data", chunk => { stdout += chunk; });
    child.stderr!.on("data", chunk => { stderr += chunk; });
    const exited = once(child, "exit");
    return { child, stdout: () => stdout, stderr: () => stderr, exited };
  }
  const first = launch(["--cwd", cwd, "--extension", join(root, "packages/local-runtime/test/fixtures/provider.ts"), "--provider", "local-test", "--model", "scripted"]);
  await until(() => { assert.equal(first.child.exitCode, null, first.stderr()); return first.stdout().includes("> "); }, "launcher opens terminal");
  runtimePid = Number(first.stderr().match(/Runtime PID: (\d+)/)?.[1]);
  assert.ok(runtimePid);
  first.child.stdin!.write("tool: launcher disconnection\n");
  await until(() => first.stdout().includes("[tool: bash]"), "native tool starts");
  first.child.stdin!.write("/detach\n"); await first.exited;
  assert.equal(first.child.exitCode, 0, first.stderr());
  await until(async () => { try { return await readFile(join(cwd, "continued.txt"), "utf8") === "native-work-continued"; } catch { return false; } }, "work continues without launcher or terminal");
  const second = launch(["--cwd", cwd]);
  await until(() => second.stdout().includes("> "), "same command reconnects");
  assert.match(second.stderr(), new RegExp(`Runtime PID: ${runtimePid}\\b`));
  await until(() => second.stdout().includes("native result:"), "restored native completion");
  second.child.stdin!.write("/reload\n");
  await until(() => second.stdout().includes("Reloaded runtime resources."), "reload through visible command");
  second.child.stdin!.write("/detach\n"); await second.exited;
  assert.equal(second.child.exitCode, 0, second.stderr());
  const other = join(base, "other"); await mkdir(other);
  const wrong = launch(["--cwd", other, "--session-dir", sessionDir]); await wrong.exited;
  assert.notEqual(wrong.child.exitCode, 0);
  assert.match(wrong.stderr(), /another working directory/);
  const override = launch(["--cwd", cwd, "--model", "ignored"]); await override.exited;
  assert.notEqual(override.child.exitCode, 0);
  assert.match(override.stderr(), /already exists/);
  const c = await connectRuntime(sessionDir);
  try {
    const info: any = await c.request("runtime/info"); assert.equal(info.pid, runtimePid);
    const transcript: any = await c.request("session/getTranscript");
    assert.equal(transcript.entries.filter((e: any) => e.role === "user").length, 1);
  } finally { c.close(); }
});
