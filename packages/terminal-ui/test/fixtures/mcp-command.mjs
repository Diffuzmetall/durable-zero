import { runDurableTui } from "@local-durable/terminal-ui";
const snapshot = {
  session: { id: "mcp", name: "MCP command", cwd: process.cwd(), directory: "/not-a-session" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: "Main" }], models: [], notices: [], connection: "online", skills: [],
  automation: { scheduled: 0, failed: 0, unavailable: true }, attention: { requests: [], unavailable: true },
};
const detached = new AbortController();
let refresh;
process.on("message", message => { if (message === "detach") detached.abort(); });
try {
  await runDurableTui({ current: () => snapshot, subscribe(listener) { refresh = listener; process.send?.("ready"); return () => {}; } }, {
    async mcpCommand(args, host) {
      host.suspend();
      process.stdout.write("\x1b[2J\x1b[H__MCP_SCREEN_CLEARED__\n");
      await new Promise(resolve => setTimeout(resolve, 30));
      refresh();  // Runtime notifications still arrive while the native manager owns the terminal.
      await new Promise(resolve => setTimeout(resolve, 30));
      host.resume();
      process.send?.({ mcp: args });
    },
    async submit(content) { process.send?.({ content }); },
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  }, undefined, { signal: detached.signal });
} finally { process.disconnect(); }
