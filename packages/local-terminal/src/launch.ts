import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { connectRuntime, runtimeSocketPath } from "@local-durable/runtime/client";

const infoSchema = z.object({ pid: z.number().int().positive(), entrypoint: z.string(), cwd: z.string() });

export interface RuntimeLaunchOptions {
  cwd: string;
  sessionDir: string;
  provider?: string | undefined;
  model?: string | undefined;
  extensions?: readonly string[] | undefined;
}

/** Composition/launch only: the detached runtime still owns the single native Harness. */
export async function ensureRuntime(options: RuntimeLaunchOptions) {
  const cwd = await realpath(options.cwd);
  if (!(await stat(cwd)).isDirectory()) throw new Error("--cwd must be a directory");
  const sessionDir = resolve(options.sessionDir);
  if (Buffer.byteLength(runtimeSocketPath(sessionDir)) > 103) throw new Error("Unix socket path is too long. Use a shorter --session-dir path.");
  const runtimeFile = fileURLToPath(new URL("../bin/runtime.mjs", import.meta.resolve("@local-durable/runtime")));
  const expectedRuntime = await realpath(runtimeFile);
  const logPath = join(sessionDir, ".terminal/runtime.log");
  async function inspect() {
    const client = await connectRuntime(sessionDir);
    const timer = setTimeout(() => client.close(), 3000);
    try {
      const info = infoSchema.parse(await client.request("runtime/info"));
      if (await realpath(info.entrypoint) !== expectedRuntime) throw new Error(`Session uses another installation (runtime PID ${info.pid}). Use another --session-dir or stop that runtime explicitly; it was not replaced.`);
      if (info.cwd !== cwd) throw new Error("This session belongs to another working directory. Use its --cwd or another --session-dir.");
      return info;
    } finally { clearTimeout(timer); client.close(); await client.closed; }
  }
  let info: z.infer<typeof infoSchema> | undefined;
  try { info = await inspect(); }
  catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
  const created = !info;
  if (!info) {
    await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
    const log = await open(logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    const runtimeArgs = [runtimeFile, "--session-dir", sessionDir, "--cwd", cwd];
    for (const key of ["provider", "model"] as const) if (options[key]) runtimeArgs.push(`--${key}`, options[key]!);
    for (const extension of options.extensions ?? []) runtimeArgs.push("--extension", resolve(cwd, extension));
    let startupError: Error | undefined;
    let runtime;
    try {
      runtime = spawn(process.execPath, runtimeArgs, { cwd, detached: true, stdio: ["ignore", log.fd, log.fd] });
      runtime.on("error", error => { startupError = error; });
      runtime.unref();
    } finally { await log.close(); }
    const deadline = Date.now() + 90000;
    while (!info && Date.now() < deadline) {
      try { info = await inspect(); }
      catch (error) {
        if (startupError) throw startupError;
        if (runtime.exitCode !== null || runtime.signalCode !== null) throw new Error(`Runtime failed to start. Log: ${logPath}`, { cause: error });
        if (!(["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "") || /closed|Disconnected|Server stopped/i.test((error as Error).message))) throw error;
        await delay(50);
      }
    }
    if (!info) throw new Error(`Runtime startup timed out; it was not restarted. PID ${runtime.pid}. Log: ${logPath}`);
  }
  console.error(`Zero session: ${sessionDir}\nRuntime PID: ${info.pid} · log: ${logPath}`);
  return { ...info, sessionDir, created };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    cwd: { type: "string" }, "session-dir": { type: "string" },
    provider: { type: "string" }, model: { type: "string" },
    extension: { type: "string", multiple: true }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pi-durable-zero [--cwd PATH] [--session-dir PATH] [--provider ID --model ID] [--extension PATH]\nStarts an independent runtime and the rich terminal. The default session is reused per working directory.\n/new starts a separate session; /name NAME persists its display name; /resume opens the host session picker.\n/detach closes only the terminal; /reload refreshes resources when idle.\nExisting runtimes from a different installation are never silently replaced.");
    return;
  }
  const cwd = await realpath(values.cwd ?? process.cwd());
  const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
  const sessionDir = resolve(values["session-dir"] ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "pi-durable-zero", "sessions", key));
  const info = await ensureRuntime({ cwd, sessionDir, provider: values.provider, model: values.model, extensions: values.extension });
  if (!info.created && (values.provider || values.model || values.extension?.length)) throw new Error("Runtime already exists. Use /model or /reload, or specify a new --session-dir for startup options.");
  const terminal = spawn(process.execPath, [fileURLToPath(new URL("../bin/terminal.mjs", import.meta.url)), "--session-dir", sessionDir], { cwd, stdio: "inherit" });
  // Signals belong to the visible client, never the detached runtime.
  const stop = () => terminal.kill("SIGTERM");
  process.once("SIGTERM", stop);
  try {
    process.exitCode = await new Promise<number>((resolve, reject) => {
      terminal.once("error", reject);
      terminal.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } finally { process.off("SIGTERM", stop); }
}
