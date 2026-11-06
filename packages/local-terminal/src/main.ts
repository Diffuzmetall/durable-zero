import { parseArgs } from "node:util";
import { ZeroTerminalClient } from "./client.ts";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    "session-dir": { type: "string" }, probe: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pi-zero-terminal --session-dir PATH [--probe]\nThe installed rich UI is the normal TTY interface. Piped input uses the readline probe.\n/quit or /detach disconnects this terminal only. Start pi-zero-runtime separately.\nCommands: /model, /thinking, /compact [instructions], /tasks, /agents, /abort.\nReload, session creation, session listing and session rename are unsupported.");
    return;
  }
  if (!values["session-dir"]) throw new Error("--session-dir is required. Start pi-zero-runtime with the same path first.");
  if (values.probe || !process.stdin.isTTY || !process.stdout.isTTY) {
    const { main: probe } = await import("./probe.ts");
    await probe(["--session-dir", values["session-dir"]]);
    return;
  }
  // Load only the public UI entry. The terminal remains independent of the runtime owner.
  const { runDurableTui } = await import("@local-durable/terminal-ui");
  const client = await ZeroTerminalClient.open(values["session-dir"]);
  const detached = new AbortController();
  const detach = () => detached.abort();
  process.once("SIGTERM", detach);
  process.once("SIGHUP", detach);
  void client.closed.then(() => detached.abort(client.failure ?? new Error("Runtime disconnected. Reconnect to inspect the session. No prompt was replayed.")));
  try {
    await runDurableTui(client, client, {
      getTerminalCapabilityOverrides: () => ({}),
      getEnableSkillCommands: () => client.current().enableSkillCommands,
      getAutocompleteMaxVisible: () => 10,
      getThemeSetting: () => undefined,
    }, undefined, { signal: detached.signal });
  } finally {
    process.off("SIGTERM", detach);
    process.off("SIGHUP", detach);
    client.close();
    await client.closed;
  }
}
