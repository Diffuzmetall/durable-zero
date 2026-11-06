import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectRuntime, runtimeSocketPath } from "../src/client.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("fixtures/provider.ts", import.meta.url));

async function until(predicate: () => boolean | Promise<boolean>, label: string, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error(`Timeout: ${label}`);
}

function launch(file: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [resolve(root, file), ...args], { cwd: root, env, stdio: "pipe" });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { error += chunk.toString(); });
  return { child, output: () => output, error: () => error };
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await until(() => child.exitCode !== null || child.signalCode !== null, `runtime ${child.pid} graceful stop`, 5000);
  assert.equal(child.exitCode, 0);
}

test("native Zero: terminal detach, ongoing tool, reconnect, abort and runtime restart", { timeout: 24000 }, async (t) => {
  const base = await mkdtemp(join(tmpdir(), "pi-zero-"));
  const sessionDir = join(base, "session");
  const cwd = join(base, "workspace");
  await mkdir(cwd);
  const env = { ...process.env, HOME: join(base, "home"), XDG_CONFIG_HOME: join(base, "config"), PI_CODING_AGENT_DIR: join(base, "agent"), PI_ADDITIONAL_EXTENSIONS: "" };
  const children: ChildProcessWithoutNullStreams[] = [];
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const client of connections) client.close();
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    await Promise.all(children.map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((done) => child.once("exit", () => done()))));
    await rm(base, { recursive: true, force: true });
  });
  const runtimeArgs = ["--session-dir", sessionDir, "--cwd", cwd, "--extension", fixture, "--provider", "local-test", "--model", "scripted"];
  const runtime = launch("packages/local-runtime/bin/runtime.mjs", runtimeArgs, env);
  children.push(runtime.child);
  await until(() => {
    assert.equal(runtime.child.exitCode, null, runtime.error());
    return runtime.output().includes('"status":"ready"');
  }, "runtime ready");
  assert.equal((await stat(runtimeSocketPath(sessionDir))).mode & 0o777, 0o600);
  console.log("PASS runtime ready; private socket; native Harness selected");

  const duplicate = launch("packages/local-runtime/bin/runtime.mjs", runtimeArgs, env);
  children.push(duplicate.child);
  await until(() => duplicate.child.exitCode !== null, "second runtime rejected");
  assert.notEqual(duplicate.child.exitCode, 0);
  assert.match(duplicate.error(), /already open.*process|live endpoint|EADDRINUSE/i);
  console.log("PASS competing runtime rejected without removing the active socket");

  const terminal = launch("packages/local-terminal/bin/terminal.mjs", ["--session-dir", sessionDir], env);
  children.push(terminal.child);
  await until(() => terminal.output().includes("> "), "terminal input ready");
  terminal.child.stdin.write("tool: survive disconnection\n");
  await until(() => terminal.output().includes("[tool: bash]"), `native tool started: ${terminal.error()}`);
  assert.match(terminal.output(), /\[accepted: \d+\]/);
  terminal.child.kill("SIGTERM");
  await until(() => terminal.child.signalCode !== null, "terminal process disconnected");
  assert.equal(terminal.child.signalCode, "SIGTERM");
  assert.equal(runtime.child.exitCode, null);
  // No RPC client remains. This marker is written by the real native bash tool after detach.
  await until(async () => { try { await access(join(cwd, "continued.txt")); return true; } catch { return false; } }, "native work while all terminals are disconnected");
  assert.equal(await readFile(join(cwd, "continued.txt"), "utf8"), "native-work-continued");
  console.log("PASS native tool continued with zero terminal clients");

  const events: any[] = [];
  const client = await connectRuntime(sessionDir, (method, params) => { if (method === "session/event") events.push(params.event); });
  connections.push(client);
  let transcript: any;
  await until(async () => {
    transcript = await client.request("session/getTranscript");
    return transcript.entries.some((entry: any) => entry.role === "assistant" && entry.text?.includes("native result:"));
  }, "native completion persisted");
  assert.equal(transcript.entries.filter((entry: any) => entry.role === "user").length, 1);
  const entryIds = transcript.entries.map((entry: any) => entry.id);
  const state: any = await client.request("session/getState");
  await assert.rejects(client.request("session/prompt", { content: "   " }), /Invalid|custom|refine/i);
  await assert.rejects(client.request("unknown/method"), /Method not found/);
  await assert.rejects(client.request("models/set", { provider: "local-test", modelId: "scripted", conversationId: "2" }), /Conversation changed/);
  await client.request("models/set", { provider: "local-test", modelId: "scripted", conversationId: "1" });
  console.log("PASS model selection rejects a stale expected conversation at the native boundary");

  const reopened = launch("packages/local-terminal/bin/terminal.mjs", ["--session-dir", sessionDir], env);
  children.push(reopened.child);
  await until(() => reopened.output().includes("native-work-continued") && reopened.output().includes("> "), "reopened terminal restores history");
  assert.equal(reopened.output().split("[user] tool: survive disconnection").length - 1, 1);
  reopened.child.stdin.write("/detach\n");
  await until(() => reopened.child.exitCode !== null, "second terminal detach");
  assert.equal(reopened.child.exitCode, 0, reopened.error());
  console.log("PASS reopen restores transcript without prompt resubmission");

  const admission: any = await client.request("session/prompt", { content: "slow: abort this" });
  await until(() => events.some((event) => event.type === "message_update" && event.assistantMessageEvent?.delta === "started:"), "streamed output before abort");
  await client.request("session/abort");
  await until(() => events.some((event) => event.type === "turn_complete" && event.requestId === admission.id && event.status === "aborted"), "native submission abort");
  client.close();
  await client.closed;
  console.log("PASS streamed output and abort correlate to a native admission ID");

  await stop(runtime.child);
  const restarted = launch("packages/local-runtime/bin/runtime.mjs", runtimeArgs, env);
  children.push(restarted.child);
  await until(() => {
    assert.equal(restarted.child.exitCode, null, restarted.error());
    return restarted.output().includes('"status":"ready"');
  }, "runtime restart ready");
  const restored = await connectRuntime(sessionDir);
  connections.push(restored);
  const restoredState: any = await restored.request("session/getState");
  const restoredTranscript: any = await restored.request("session/getTranscript");
  assert.equal(restoredState.sessionId, state.sessionId);
  for (const id of entryIds) assert.ok(restoredTranscript.entries.some((entry: any) => entry.id === id));
  assert.equal(restoredTranscript.entries.filter((entry: any) => entry.role === "user").length, 2);
  restored.close();
  await restored.closed;
  await stop(restarted.child);
  console.log("PASS graceful runtime restart preserves native session and entry IDs");

  const crashed = launch("packages/local-runtime/bin/runtime.mjs", runtimeArgs, env);
  children.push(crashed.child);
  await until(() => crashed.output().includes('"status":"ready"'), "crash fixture ready");
  crashed.child.kill("SIGKILL");
  await until(() => crashed.child.signalCode === "SIGKILL", "runtime killed without endpoint cleanup");
  assert.ok((await stat(runtimeSocketPath(sessionDir))).isSocket(), "crash leaves the stale Unix socket");
  const recovered = launch("packages/local-runtime/bin/runtime.mjs", runtimeArgs, env);
  children.push(recovered.child);
  await until(() => {
    assert.equal(recovered.child.exitCode, null, recovered.error());
    return recovered.output().includes('"status":"ready"');
  }, "runtime recovers the owned stale endpoint");
  const recoveredClient = await connectRuntime(sessionDir);
  connections.push(recoveredClient);
  const { view: recoveredView }: any = await recoveredClient.request("session/getView");
  assert.equal(recoveredView.session.id, state.sessionId);
  assert.ok(recoveredView.conversation.entries.length > 0);
  recoveredClient.close();
  await recoveredClient.closed;
  await stop(recovered.child);
  console.log("PASS SIGKILL recovery preserves native state and removes only the stale socket");
});
