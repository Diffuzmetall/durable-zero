import test from "node:test";
import assert from "node:assert/strict";
import { createDurableController } from "../src/engine/runtime-controller.ts";

function fixture() {
  const submitted: number[] = [];
  const aborted: number[] = [];
  const hooks: number[] = [];
  const configured: number[] = [];
  const activeModels: unknown[] = [];
  const conversations = new Map<number, any>();
  for (const id of [1, 2, 3]) conversations.set(id, {
    id,
    agent: async () => { hooks.push(id); return { tools: [] }; },
    submit: async () => {
      submitted.push(id);
      return { id: id * 10, wait: () => new Promise(() => {}) };
    },
    abort: async () => { aborted.push(id); },
    configure: async () => { configured.push(id); },
    commit: async (callback: (tx: any) => Promise<void>) => callback({
      doc: async (_doc: unknown, conversationId: number) => {
        assert.equal(conversationId, id);
        return { agents: id === 1 ? { nested: { settled: false, conversationId: 3 } } : {} };
      },
    }),
  });
  const bindings = { current: conversations.get(2) };
  const controller = createDurableController({
    bindings,
    opened: { conversation: async (id: number) => conversations.get(id) },
    modelRuntime: { getModel: () => ({ id: "model", provider: "test", reasoning: false }) },
    getState: () => ({ conversation: { docs: {} } }), notice: () => {}, fail: () => {},
    setActiveModelRef: (ref: unknown) => { activeModels.push(ref); },
    extensionRunner: { emitBeforeAgentStart: async () => undefined },
  } as any);
  return { controller, bindings, submitted, aborted, hooks, configured, activeModels, conversations };
}

test("explicit root submission preserves the viewed child and runs hooks against root", async () => {
  const { controller, bindings, submitted, hooks } = fixture();
  const receipt = await controller.submit("root input", "followUp", 1);
  assert.deepEqual(submitted, [1]);
  assert.deepEqual(hooks, [1]);
  assert.equal(receipt.conversationId, "1");
  assert.equal(bindings.current.id, 2);
});

test("explicit root abort targets root and its children, not the viewed conversation", async () => {
  const { controller, bindings, aborted } = fixture();
  await controller.abort(1);
  assert.deepEqual(aborted, [1, 3]);
  assert.equal(bindings.current.id, 2);
});

test("omitted target preserves native selected-conversation behavior", async () => {
  const { controller, submitted, aborted, hooks } = fixture();
  const receipt = await controller.submit("selected input", "steer");
  await controller.abort();
  assert.equal(receipt.conversationId, "2");
  assert.deepEqual(submitted, [2]);
  assert.deepEqual(hooks, [2]);
  assert.deepEqual(aborted, [2]);
});

test("model selection rejects a changed conversation inside the command queue", async () => {
  const { controller, bindings, conversations, configured, activeModels } = fixture();
  const pending = controller.setModel({ provider: "test", modelId: "model" }, 2);
  bindings.current = conversations.get(3);
  await assert.rejects(pending, /Conversation changed/);
  assert.deepEqual(configured, []);
  assert.deepEqual(activeModels, []);
});

test("model selection preserves matching-target and untargeted native behavior", async () => {
  const { controller, configured } = fixture();
  await controller.setModel({ provider: "test", modelId: "model" }, 2);
  await controller.setModel({ provider: "test", modelId: "model" });
  assert.deepEqual(configured, [2, 2]);
});

test("a missing explicit target rejects without touching the selected conversation", async () => {
  const { controller, submitted, aborted } = fixture();
  await assert.rejects(controller.submit("missing", "followUp", 99), /does not exist/);
  await assert.rejects(controller.abort(99), /does not exist/);
  assert.deepEqual(submitted, []);
  assert.deepEqual(aborted, []);
});
