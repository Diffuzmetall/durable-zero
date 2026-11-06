import { parseArgs } from "node:util";
import { ZeroTerminalClient } from "./client.ts";
import { ensureRuntime } from "./launch.ts";
import type { SessionDescriptor } from "@local-durable/runtime/sessions";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({ args, options: {
    "session-dir": { type: "string" }, probe: { type: "boolean" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pi-zero-terminal --session-dir PATH [--probe]\nThe installed rich UI is the normal TTY interface. Piped input uses the readline probe.\n/quit or /detach disconnects this terminal only. Start pi-zero-runtime separately.\nRich UI commands: /new, /clear, /name NAME, /resume, /model, /thinking, /compact [instructions], /tasks, /agents, /abort, /reload [extension].\nSession switching detaches the old runtime without stopping active work. Reload refuses active work.");
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
  let sessionDir = values["session-dir"];
  for (;;) {
    const client = await ZeroTerminalClient.open(sessionDir);
    const detached = new AbortController();
    const detach = () => detached.abort();
    process.once("SIGTERM", detach);
    process.once("SIGHUP", detach);
    void client.closed.then(() => detached.abort(client.failure ?? new Error("Runtime disconnected. Reconnect to inspect the session. No prompt was replayed.")));
    let next: SessionDescriptor | undefined;
    let create = false;
    try {
      const selected = await runDurableTui(client, client, {
        getTerminalCapabilityOverrides: () => ({}),
        getEnableSkillCommands: () => client.current().enableSkillCommands,
        getAutocompleteMaxVisible: () => 10,
        getThemeSetting: () => undefined,
      }, undefined, { signal: detached.signal });
      if (!detached.signal.aborted && selected !== undefined) {
        create = selected === null;
        next = create ? await client.createSession() : await client.describeSession(selected!);
      }
    } finally {
      process.off("SIGTERM", detach);
      process.off("SIGHUP", detach);
      client.close();
      await client.closed;
    }
    if (!next) return;
    await ensureRuntime({ cwd: next.cwd, sessionDir: next.id, extensions: next.extensions,
      ...(create ? { provider: next.provider, model: next.model } : {}) });
    sessionDir = next.id;
  }
}
