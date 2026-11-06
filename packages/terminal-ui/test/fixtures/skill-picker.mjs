import { runDurableTui } from "@local-durable/terminal-ui";

const snapshot = {
  session: { id: "skills", name: "Skill picker test", cwd: process.cwd(), directory: "/not-a-session" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: "Main" }], models: [], notices: [], connection: "online",
  skills: [{ name: "example", description: "Example picker skill", filePath: "/skills/example/SKILL.md", baseDir: "/skills/example" }],
  automation: { scheduled: 0, failed: 0, unavailable: true }, attention: { requests: [], unavailable: true },
};
const detached = new AbortController();
process.on("message", message => { if (message === "detach") detached.abort(); });
try {
  await runDurableTui({ current: () => snapshot, subscribe() { process.send?.("ready"); return () => {}; } }, {
    async submit(content, deliverAs) { process.send?.({ content, deliverAs }); },
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  }, undefined, { signal: detached.signal });
} finally { process.disconnect(); }
