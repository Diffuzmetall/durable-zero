import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connectRuntime, runtimeSocketPath } from "../src/client.ts";

const entry = fileURLToPath(new URL("../bin/runtime.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("fixtures/provider.ts", import.meta.url));

test("native session catalog: names persist, creation retries reuse one directory, resume stays scoped", { timeout: 20000 }, async t => {
  const base = await mkdtemp(join(tmpdir(), "zero-sessions-"));
  const cwd = join(base, "workspace"); await mkdir(cwd);
  const sessionDir = join(base, "state", "pi-durable-zero", "sessions", "original");
  const children: ReturnType<typeof spawn>[] = [];
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const c of connections) c.close();
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
      }
    }
    await rm(base, { recursive: true, force: true });
  });
  async function open(directory: string, source: "argument" | "environment" | "saved" = "argument") {
    const child = spawn(process.execPath, [entry, "--cwd", cwd, "--session-dir", directory,
      ...(source === "argument" ? ["--extension", fixture] : []), "--provider", "local-test", "--model", "scripted"], {
      env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: join(base, "agent"), PI_ADDITIONAL_EXTENSIONS: source === "environment" ? fixture : "" }, stdio: "pipe",
    });
    children.push(child);
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; }); child.stderr.on("data", chunk => { err += chunk; });
    const deadline = Date.now() + 7000;
    while (!out.includes('"status":"ready"')) {
      assert.equal(child.exitCode, null, err);
      assert.ok(Date.now() < deadline, `runtime startup: ${out} ${err}`);
      let early: Awaited<ReturnType<typeof connectRuntime>> | undefined;
      try {
        early = await connectRuntime(directory);
        await early.request("runtime/info");
        const initial = await early.request("session/getView") as { sessionName?: string };
        assert.equal(typeof initial.sessionName, "string", "runtime discovery must wait for catalog readiness");
      } catch (error) {
        if (!["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes((error as NodeJS.ErrnoException).code ?? "") &&
            !/closed|Disconnected|Server stopped/i.test((error as Error).message)) throw error;
      } finally { early?.close(); }
      await delay(5);
    }
    const client = await connectRuntime(directory); connections.push(client);
    return { child, client };
  }
  const original = await open(sessionDir, "environment");
  const rows: any = await original.client.request("session/list");
  assert.equal(rows.length, 1); assert.equal(rows[0].id, sessionDir);
  await original.client.request("session/rename", { name: "  Проект Zero  " });
  const named: any = await original.client.request("session/getView");
  assert.equal(named.sessionName, "Проект Zero");
  assert.equal(named.view.session.id, "original", "display name must not replace native identity");
  await assert.rejects(original.client.request("session/rename", { name: "\u001b[31m" }), /Invalid|control|name/i);
  await assert.rejects(original.client.request("session/rename", { name: "   " }), /Invalid|name/i);
  const requestId = randomUUID();
  const first: any = await original.client.request("session/create", { requestId });
  const retried: any = await original.client.request("session/create", { requestId });
  assert.equal(first.id, retried.id); assert.notEqual(first.id, sessionDir); assert.equal(first.cwd, cwd);
  assert.ok(Buffer.byteLength(runtimeSocketPath(first.id)) <= 103, "new sessions must fit the default Unix socket layout");
  assert.deepEqual(first.extensions, [fixture]);
  const listed: any = await original.client.request("session/list");
  assert.equal(listed.length, 2);
  await assert.rejects(original.client.request("session/describe", { id: join(base, "unrelated") }), /outside|catalog/i);
  const next = await open(first.id);
  const empty: any = await next.client.request("session/getTranscript");
  assert.equal(empty.entries.filter((e: any) => e.role === "user").length, 0);
  const originalInfo: any = await original.client.request("runtime/info");
  const nextInfo: any = await next.client.request("runtime/info");
  assert.notEqual(nextInfo.pid, originalInfo.pid);
  original.client.close(); await original.client.closed;
  const exited = once(original.child, "exit"); original.child.kill("SIGTERM"); await exited;
  const reopened = await open(sessionDir, "saved");
  const restored: any = await reopened.client.request("session/getView");
  assert.equal(restored.sessionName, "Проект Zero");
  assert.deepEqual((await reopened.client.request("session/describe", { id: sessionDir }) as any).extensions, [fixture]);
  assert.deepEqual((await reopened.client.request("session/create", { requestId: randomUUID() }) as any).extensions, [fixture], "reopening without options must retain the configured provider");
  assert.equal((await next.client.request("runtime/info") as any).pid, nextInfo.pid, "reopening another session must not stop this runtime");
});
