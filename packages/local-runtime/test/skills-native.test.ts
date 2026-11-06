import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { connectRuntime } from "../src/client.ts";

async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(20);
  }
  throw new Error(`Timeout: ${label}`);
}

test("native skill catalogue, expansion, rejection and reconnect without replay", { timeout: 16000 }, async t => {
  const root = process.env.ZERO_RUNTIME_ROOT ?? fileURLToPath(new URL("../../../", import.meta.url));
  const fixture = process.env.ZERO_PROVIDER_FIXTURE ?? join(root, "packages/local-runtime/test/fixtures/provider.ts");
  const base = await mkdtemp(join(tmpdir(), "zero-skill-native-"));
  const cwd = join(base, "workspace");
  const skillDir = join(cwd, ".pi", "skills", "example");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: example\ndescription: Native integration skill\n---\nSKILL_BODY_REACHED_NATIVE\n");
  const sessionDir = join(base, "session");
  const runtime = spawn(process.execPath, [resolve(root, "packages/local-runtime/bin/runtime.mjs"),
    "--session-dir", sessionDir, "--cwd", cwd, "--extension", fixture, "--provider", "local-test", "--model", "scripted"], {
    env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: join(base, "agent"), PI_ADDITIONAL_EXTENSIONS: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = ""; let stderr = "";
  runtime.stdout.on("data", chunk => { stdout += chunk; });
  runtime.stderr.on("data", chunk => { stderr += chunk; });
  const exited = once(runtime, "exit");
  const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
  t.after(async () => {
    for (const connection of connections) connection.close();
    if (runtime.exitCode === null && runtime.signalCode === null) { runtime.kill("SIGTERM"); await exited; }
    await rm(base, { recursive: true, force: true });
  });
  await until(async () => {
    assert.equal(runtime.exitCode, null, stderr);
    return stdout;
  }, value => value.includes('"status":"ready"'), "runtime ready");
  const client = await connectRuntime(sessionDir);
  connections.push(client);
  const initial: any = await client.request("session/getView");
  assert.equal(initial.resources.enableSkillCommands, true);
  assert.ok(initial.resources.skills.some((skill: any) => skill.name === "example"));
  const accepted: any = await client.request("session/prompt", { content: "/skill:example keep these arguments", options: { deliverAs: "followUp", conversationId: "1" } });
  assert.ok(accepted.id, "must retain a real native admission receipt");
  const transcript: any = await until(async () => client.request("session/getTranscript"),
    (value: any) => value.entries.some((entry: any) => entry.role === "assistant" && entry.text?.includes("SKILL_BODY_REACHED_NATIVE")), "native skill completion");
  const inputs = transcript.entries.filter((entry: any) => entry.role === "user");
  assert.equal(inputs.length, 1);
  assert.match(inputs[0].text, /<skill name="example"/);
  assert.match(inputs[0].text, /keep these arguments/);
  assert.doesNotMatch(inputs[0].text, /description: Native integration skill/);
  await assert.rejects(client.request("session/prompt", { content: "/skill:missing" }), /Unknown skill/);
  await rm(join(skillDir, "SKILL.md"));
  await assert.rejects(client.request("session/prompt", { content: "/skill:example" }), /ENOENT/);
  client.close(); await client.closed;
  const reopened = await connectRuntime(sessionDir);
  connections.push(reopened);
  const view: any = await reopened.request("session/getView");
  assert.ok(view.resources.skills.some((skill: any) => skill.name === "example"));
  const restored: any = await reopened.request("session/getTranscript");
  assert.equal(restored.entries.filter((entry: any) => entry.role === "user").length, 1, "errors and reconnect must not admit another input");
});
