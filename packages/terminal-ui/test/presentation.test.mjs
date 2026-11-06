import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import { DurableTui, CustomEditor, initTheme, theme, toolCardRenderer, resetToolCards, runDurableTui } from "@local-durable/terminal-ui";

const root = new URL("../", import.meta.url);
const provenance = JSON.parse(await readFile(new URL("PROVENANCE.json", root), "utf8"));
const view = () => ({
  session: { id: "isolated", name: "Isolated terminal", directory: "/not-a-session-directory", cwd: process.cwd() },
  conversation: { conversation: { id: 1 }, entries: [{ id: 1, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: "Preserved native transcript", timestamp: 1 }] }], docs: {} },
  conversations: [{ id: 1, label: "Main" }], models: [], notices: [],
  connection: "online", skills: [], automation: { scheduled: 0, failed: 0, unavailable: true },
  attention: { requests: [], unavailable: true },
});

test("editor, message components, themes and tool cards match the installed artifact", async () => {
  const selected = provenance.files.filter(entry => /(?:components\/|theme\/|tool-cards\/|licenses\/|SOURCE\.json$)/.test(entry.path));
  assert.ok(selected.length > 20);
  for (const entry of selected) {
    const bytes = await readFile(new URL(`vendor/${entry.path}`, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, entry.path);
  }
  assert.equal(typeof CustomEditor, "function");
  assert.equal(typeof runDurableTui, "function");
});

test("installed layout components render native transcript and offline status without opening a session", () => {
  initTheme();
  const tui = new DurableTui(process.cwd(), "/not-a-session-directory", {
    submit() {}, followUp() {}, abort() {}, openAgent() {}, selectModel() {}, cycleThinking() {},
  });
  try {
    const native = view();
    tui.setSessionTitle(native.session.name);
    tui.apply(native);
    let text = stripVTControlCharacters(tui.ui.children.flatMap(component => component.render(100)).join("\n"));
    assert.match(text, /Preserved native transcript/);
    assert.match(text, /Isolated terminal/);
    tui.apply({ ...native, connection: "offline" });
    text = stripVTControlCharacters(tui.ui.children.flatMap(component => component.render(100)).join("\n"));
    assert.match(text, /offline/);
    assert.doesNotMatch(text, /Attention state unavailable|Native automation state unavailable/);
  } finally {
    tui.stop({ preserveScreen: true });
  }
});

test("disconnected optional panels stay hidden without suppressing genuine notices", () => {
  initTheme();
  const tui = new DurableTui(process.cwd(), "/not-a-session-directory", {
    submit() {}, followUp() {}, abort() {}, openAgent() {}, selectModel() {}, cycleThinking() {},
  });
  const native = view();
  const goal = { id: "goal-test", objective: "Connected goal", status: "running", limits: "none", callsUsed: 1, updatedAt: 1, createdAt: 1 };
  const attention = { requests: [{ id: "reply-1", name: "Worker", message: "Real question" }] };
  const automation = { scheduled: 2, failed: 1, nativeGoals: { active: goal.id, goals: { [goal.id]: goal } } };
  const render = () => stripVTControlCharacters(tui.ui.children.flatMap(component => component.render(140)).join("\n"));
  try {
    tui.apply({ ...native, attention: { ...attention, unavailable: true }, automation: { ...automation, unavailable: true },
      notices: [{ id: 1, level: "error", message: "Actual runtime failure" }] });
    let text = render();
    assert.doesNotMatch(text, /Attention state unavailable|Native automation state unavailable|Real question|Connected goal|sched 2/);
    assert.match(text, /Actual runtime failure/);
    tui.apply({ ...native, attention, automation });
    text = render();
    assert.match(text, /Real question/);
    assert.match(text, /Connected goal/);
    assert.match(text, /sched 2/);
  } finally { tui.stop({ preserveScreen: true }); }
});

test("the installed unknown-tool card hides private arguments", () => {
  initTheme();
  const args = { path: "file.ts", authorization: "never-render-this-secret" };
  const state = {};
  const card = toolCardRenderer("custom-tool");
  const context = { state, args, toolCallId: "native-tool-id", isPartial: false, isError: false, onInvalidate() {} };
  try {
    const body = card.renderCall(args, theme, context);
    const text = stripVTControlCharacters(body.render(80).join("\n"));
    assert.match(text, /custom-tool|file.ts/);
    assert.doesNotMatch(text, /never-render-this-secret|authorization/);
    assert.equal(context.toolCallId, "native-tool-id");
  } finally { resetToolCards(); }
});

test("detach before UI start releases presentation resources", async () => {
  const signal = new AbortController();
  signal.abort();
  const source = { current: view, subscribe() { throw new Error("must not subscribe after detach"); } };
  const settings = { getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => false,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined };
  assert.equal(await runDurableTui(source, {}, settings, undefined, { signal: signal.signal }), undefined);
});
