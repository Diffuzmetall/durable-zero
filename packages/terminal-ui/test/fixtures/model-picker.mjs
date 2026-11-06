import { runDurableTui } from "@local-durable/terminal-ui";

let snapshot = {
  session: { id: "test", name: "Picker test", cwd: process.cwd(), directory: "/not-a-session" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: "Main" }, { id: 2, label: "Child" }],
  models: [{ provider: "fixture", modelId: "first", name: "First", contextWindow: 4096 }], notices: [],
  connection: "online", skills: [], automation: { scheduled: 0, failed: 0, unavailable: true }, attention: { requests: [], unavailable: true },
};
let changed;
const detached = new AbortController();
process.on("message", message => {
  if (message === "switch") {
    snapshot = { ...snapshot, conversation: { ...snapshot.conversation, conversation: { id: 2 } } };
    changed?.();
    process.send?.("switched");
  } else if (message === "detach") detached.abort();
});
try {
  await runDurableTui({ current: () => snapshot, subscribe(listener) { changed = listener; process.send?.("ready"); return () => { changed = undefined; }; } }, {
    async setModel(model) { process.send?.({ model }); },
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => false,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  }, undefined, { signal: detached.signal });
} finally { process.disconnect(); }
