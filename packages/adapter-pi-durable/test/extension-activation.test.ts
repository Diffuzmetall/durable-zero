import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionActions } from "../src/engine/shared/extension-runner.ts";

test("Pi registration activates direct/model-only tools, not indirect/hidden/opt-out tools", () => {
  const registered: Array<{ definition: { name: string; exposure?: string; defaultActive?: boolean } }> = [];
  const actions = createExtensionActions({ getRegisteredTools: () => registered }, ["bash"]);
  registered.push({ definition: { name: "mcp__fixture__probe", exposure: "direct" } },
    { definition: { name: "private", exposure: "hidden" } }, { definition: { name: "indirect", exposure: "codemode" } },
    { definition: { name: "later", exposure: "deferred" } }, { definition: { name: "optout", exposure: "direct", defaultActive: false } },
    { definition: { name: "model", exposure: "model-only" } });
  actions.refreshTools();
  assert.deepEqual(actions.getActiveTools(), ["bash", "mcp__fixture__probe", "model"]);
  actions.setActiveTools(["bash"]);
  actions.refreshTools();
  assert.deepEqual(actions.getActiveTools(), ["bash"], "refresh reactivated an explicitly deselected tool");
  registered[0].definition.exposure = "hidden";
  actions.refreshTools();
  registered[0].definition.exposure = "direct";
  actions.refreshTools();
  assert.deepEqual(actions.getActiveTools(), ["bash", "mcp__fixture__probe"]);
  registered[0].definition.exposure = "hidden";
  actions.refreshTools();
  assert.deepEqual(actions.getActiveTools(), ["bash"], "hidden tool stayed declared");
});
