import { parseArgs } from "node:util";
import { startRuntime } from "./index.ts";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    "session-dir": { type: "string" }, cwd: { type: "string" },
    provider: { type: "string" }, model: { type: "string" },
    extension: { type: "string", multiple: true }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pi-zero-runtime --session-dir PATH [--cwd PATH] [--provider ID --model ID] [--extension PATH]\nRun independently from pi-zero-terminal. SIGTERM stops the runtime; terminal disconnect does not.");
    return;
  }
  if (!values["session-dir"]) throw new Error("--session-dir is required. Use a new isolated session directory.");
  const runtime = await startRuntime({
    sessionDir: values["session-dir"],
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(values.provider !== undefined ? { provider: values.provider } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.extension !== undefined ? { extensions: values.extension } : {}),
  });
  console.log(JSON.stringify({ status: "ready", pid: process.pid, socketPath: runtime.socketPath }));
  await new Promise<void>((resolve, reject) => {
    const stop = () => {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
      runtime.close().then(resolve, reject);
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });
}
