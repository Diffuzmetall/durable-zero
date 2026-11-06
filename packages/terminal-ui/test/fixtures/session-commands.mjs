import { runDurableTui } from "@local-durable/terminal-ui";
const snapshot = {
  session: { id: "current", name: "Current", cwd: process.cwd(), directory: "/current" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: "Main" }], models: [], notices: [], connection: "online", skills: [],
  automation: { scheduled: 0, failed: 0, unavailable: true }, attention: { requests: [], unavailable: true },
};
const detached = new AbortController();
process.on("message", message => { if (message === "detach") detached.abort(); });
try {
  const result = await runDurableTui({ current: () => snapshot, subscribe() { process.send?.("ready"); return () => {}; } }, {
    async listSessions() { return [{ id: "/other", name: "Other session", cwd: "/workspace" }]; },
    async renameSession(name) { process.send?.({ rename: name.trim() }); return name.trim(); },
    async submit(content) { process.send?.({ prompt: content }); },
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  }, undefined, { signal: detached.signal });
  process.send?.({ selectedSession: result === undefined ? "detached" : result });
} finally { process.disconnect(); }
