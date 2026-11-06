import test from "node:test";
import assert from "node:assert/strict";
import type { DurableView } from "@durable-zero/adapter-pi-durable";
import { ZeroTerminalClient, parseViewEnvelope, presentView, type RuntimeConnector } from "../src/client.ts";

function nativeView(id = "session-one", conversationId = 1): DurableView {
  return {
    session: { id, directory: "/server/session", cwd: "/server/workspace" },
    conversation: { conversation: { id: conversationId }, entries: [], docs: {} },
    conversations: [{ id: 1, label: "Main" }],
    models: [{ provider: "test", modelId: "scripted", name: "Scripted", contextWindow: 4096 }],
    notices: [],
  } as unknown as DurableView;
}

function transport(initial = nativeView(), getView?: () => Promise<unknown>) {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  let notify: Parameters<RuntimeConnector>[1];
  let disconnect!: () => void;
  const closed = new Promise<void>(resolve => { disconnect = resolve; });
  let closeCalls = 0;
  let refusal: string | undefined;
  const connect: RuntimeConnector = async (_sessionDir, listener) => {
    notify = listener;
    return {
      request: async (method, params = {}) => {
        requests.push({ method, params });
        if (method === "session/getView") return getView ? getView() : { revision: 0, view: initial };
        if (refusal) throw new Error(refusal);
        return { status: "accepted", id: "native-id" };
      },
      closed,
      close: () => { closeCalls++; disconnect(); },
    };
  };
  return { connect, requests, notify: (method: string, params: Record<string, unknown>) => notify?.(method, params),
    disconnect, closeCalls: () => closeCalls, refuse: (message: string) => { refusal = message; } };
}

test("getView reads the view envelope and adds client-only presentation fields", async () => {
  const native = nativeView();
  const original = JSON.stringify(native);
  const rpc = transport(native);
  const client = await ZeroTerminalClient.open("/server/session", rpc.connect);
  assert.deepEqual(rpc.requests, [{ method: "session/getView", params: {} }]);
  assert.equal(client.current().conversation, native.conversation);
  assert.equal(client.current().session.name, native.session.id);
  assert.equal(client.current().connection, "online");
  assert.equal(client.current().automation.unavailable, true);
  assert.equal(JSON.stringify(native), original);
  client.close(); await client.closed;
});

test("session/view notifications update the native view without resubmitting prompts", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  let updates = 0;
  const off = client.subscribe(() => { updates++; });
  const next = nativeView("session-two");
  rpc.notify("session/event", { event: { type: "irrelevant" } });
  rpc.notify("session/view", { revision: 1, view: next });
  assert.equal(client.current().session.id, "session-two");
  assert.equal(updates, 1);
  assert.equal(rpc.requests.length, 1);
  off(); client.close(); await client.closed;
  assert.equal(updates, 1);
});

test("a view notification during initial request is not overwritten", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(resolveView => { resolve = resolveView; });
  const rpc = transport(nativeView(), () => pending);
  const opened = ZeroTerminalClient.open("session", rpc.connect);
  await Promise.resolve();
  rpc.notify("session/view", { revision: 3, view: nativeView("newer") });
  resolve({ revision: 2, view: nativeView("older") });
  const client = await opened;
  assert.equal(client.current().session.id, "newer");
  client.close(); await client.closed;
});

test("commands use exact runtime method and parameter contracts", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  await client.submit("  original body  ", "steer");
  await client.submit("later", "followUp");
  await client.abort();
  await client.compact();
  await client.compact("keep tool results");
  await client.setModel({ provider: "test", modelId: "other" });
  await client.cycleThinking();
  await client.toggleTasks();
  await client.switchConversation(42);
  await client.reload();
  await client.reload("./extension.ts");
  assert.deepEqual(rpc.requests.slice(1), [
    { method: "session/prompt", params: { content: "  original body  ", options: { deliverAs: "steer", conversationId: "1" } } },
    { method: "session/prompt", params: { content: "later", options: { deliverAs: "followUp", conversationId: "1" } } },
    { method: "session/abort", params: { conversationId: "1" } },
    { method: "session/compact", params: {} },
    { method: "session/compact", params: { instructions: "keep tool results" } },
    { method: "models/set", params: { provider: "test", modelId: "other", conversationId: "1" } },
    { method: "models/cycleThinking", params: {} },
    { method: "session/toggleTasks", params: {} },
    { method: "session/switchConversation", params: { conversationId: "42" } },
    { method: "session/reload", params: {} },
    { method: "session/reload", params: { path: "./extension.ts" } },
  ]);
  client.close(); await client.closed;
});

test("unsupported operations reject without RPC calls", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  await assert.rejects(client.renameSession("name"), /Unsupported capability: session rename/);
  await assert.rejects(client.listSessions(), /Unsupported capability: session list/);
  assert.equal(rpc.requests.length, 1);
  client.close(); await client.closed;
});

test("RPC refusals propagate and commands are never retried", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  rpc.refuse("host refused model");
  await assert.rejects(client.setModel({ provider: "test", modelId: "wrong" }), /host refused model/);
  assert.equal(rpc.requests.length, 2);
  client.close(); await client.closed;
});

test("disconnect marks the view offline and blocks commands without replay", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  rpc.disconnect(); await client.closed;
  assert.equal(client.current().connection, "offline");
  await assert.rejects(client.submit("never replay"), /disconnected/);
  assert.equal(rpc.requests.length, 1);
});

test("invalid initial envelopes close transport and reject direct native views", async () => {
  assert.throws(() => parseViewEnvelope(nativeView()));
  const rpc = transport(nativeView(), async () => ({ view: { session: {} } }));
  await assert.rejects(ZeroTerminalClient.open("session", rpc.connect));
  assert.equal(rpc.closeCalls(), 1);
});

test("invalid notifications detach rather than fabricating a native view", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  rpc.notify("session/view", { event: nativeView() });
  await client.closed;
  assert.match(client.failure?.message ?? "", /Invalid session\/view/);
  assert.equal(client.current().connection, "offline");
  assert.equal(rpc.requests.length, 1);
});

test("a newer getView response wins over an older pending notification", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(resolveView => { resolve = resolveView; });
  const rpc = transport(nativeView(), () => pending);
  const opened = ZeroTerminalClient.open("session", rpc.connect);
  await Promise.resolve();
  rpc.notify("session/view", { revision: 4, view: nativeView("old-notification") });
  resolve({ revision: 5, view: nativeView("new-response") });
  const client = await opened;
  assert.equal(client.current().session.id, "new-response");
  client.close(); await client.closed;
});

test("only the highest pending revision survives initialization", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(resolveView => { resolve = resolveView; });
  const rpc = transport(nativeView(), () => pending);
  const opened = ZeroTerminalClient.open("session", rpc.connect);
  await Promise.resolve();
  rpc.notify("session/view", { revision: 8, view: nativeView("highest") });
  rpc.notify("session/view", { revision: 6, view: nativeView("older") });
  resolve({ revision: 7, view: nativeView("response") });
  const client = await opened;
  assert.equal(client.current().session.id, "highest");
  client.close(); await client.closed;
});

test("older and duplicate view revisions cannot replace current native values", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  let updates = 0;
  const off = client.subscribe(() => { updates++; });
  const highest = nativeView("highest");
  const unchanged = JSON.stringify(highest);
  rpc.notify("session/view", { revision: 9, view: highest });
  rpc.notify("session/view", { revision: 8, view: nativeView("older") });
  rpc.notify("session/view", { revision: 9, view: nativeView("duplicate") });
  assert.equal(client.current().session.id, "highest");
  assert.equal(client.current().conversation, highest.conversation);
  assert.equal(JSON.stringify(highest), unchanged);
  assert.equal(updates, 1);
  off(); client.close(); await client.closed;
});

test("view envelopes require a nonnegative integer revision", async () => {
  for (const revision of [undefined, -1, 1.25, "2", NaN, Infinity]) {
    assert.throws(() => parseViewEnvelope({ revision, view: nativeView() }));
  }
  const native = nativeView();
  assert.equal(parseViewEnvelope({ revision: 0, view: native }).view, native);
  const rpc = transport(nativeView(), async () => ({ revision: -1, view: native }));
  await assert.rejects(ZeroTerminalClient.open("session", rpc.connect));
  assert.equal(rpc.closeCalls(), 1);
});

test("prompt and abort target only the conversation in the accepted native view", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  await client.switchConversation(42);
  await client.submit("before native selection");
  const selected = nativeView("session-one", 42);
  rpc.notify("session/view", { revision: 2, view: selected });
  await client.submit("child prompt", "followUp");
  await client.abort();
  await client.setModel({ provider: "test", modelId: "child-model" });
  assert.deepEqual(rpc.requests.slice(1), [
    { method: "session/switchConversation", params: { conversationId: "42" } },
    { method: "session/prompt", params: { content: "before native selection", options: { deliverAs: "steer", conversationId: "1" } } },
    { method: "session/prompt", params: { content: "child prompt", options: { deliverAs: "followUp", conversationId: "42" } } },
    { method: "session/abort", params: { conversationId: "42" } },
    { method: "models/set", params: { provider: "test", modelId: "child-model", conversationId: "42" } },
  ]);
  client.close(); await client.closed;
});

test("presentation uses selected native live documents without inventing activity for summary rows", () => {
  const native = nativeView("activity", 2);
  const live = { run: { id: 77 }, tools: [] };
  const inbox = { items: [] };
  const authoritative = {
    ...native,
    conversation: { ...native.conversation, docs: { "pi.live": live, "pi.inbox": inbox } },
    conversations: [{ id: 1, label: "Main" }, { id: 2, label: "Selected" }, { id: 3, label: "Unknown" }],
  } as unknown as DurableView;
  const before = JSON.stringify(authoritative);
  const presented = presentView(authoritative, "online");
  const selected = presented.conversations.find(row => row.id === 2)!;
  assert.ok("live" in selected);
  assert.equal(selected.live, live);
  assert.ok("inbox" in selected);
  assert.equal(selected.inbox, inbox);
  assert.equal(presented.conversations[2], authoritative.conversations[2]);
  assert.ok(!("live" in presented.conversations[2]));
  assert.equal(JSON.stringify(authoritative), before);
});

test("runtime resource metadata populates skills and survives disconnect without submission", async () => {
  const resources = { enableSkillCommands: true, skills: [{ name: "example", description: "Example", filePath: "/skills/example/SKILL.md", baseDir: "/skills/example" }] };
  const rpc = transport(nativeView(), async () => ({ revision: 0, view: nativeView(), resources }));
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  assert.deepEqual(client.current().skills, resources.skills);
  assert.equal(client.current().enableSkillCommands, true);
  rpc.notify("session/view", { revision: 1, view: nativeView(), resources });
  rpc.disconnect(); await client.closed;
  assert.deepEqual(client.current().skills, resources.skills);
  assert.equal(rpc.requests.length, 1);
  assert.throws(() => parseViewEnvelope({ revision: 0, view: nativeView(), resources: { ...resources, enableSkillCommands: "yes" } }));
});

test("input validation prevents invalid RPC parameters", async () => {
  const rpc = transport();
  const client = await ZeroTerminalClient.open("session", rpc.connect);
  await assert.rejects(client.submit("  "));
  assert.throws(() => client.switchConversation(NaN));
  assert.throws(() => client.switchConversation(0));
  assert.throws(() => client.setModel({ provider: "", modelId: "model" }));
  assert.equal(rpc.requests.length, 1);
  assert.equal(presentView(nativeView(), "online").tasksExpanded, false);
  client.close(); await client.closed;
});
