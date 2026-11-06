import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionActions } from "../src/engine/shared/extension-runner.ts";

for (const exposure of ["codemode", "deferred"] as const) {
  test(`Pi registration removes direct activation after exposure changes to ${exposure}`, () => {
    const tool = { definition: { name: "dynamic", exposure: "direct" } };
    let configured = ["bash"];
    const actions = createExtensionActions({
      getRegisteredTools: () => [tool],
      onActiveToolsChanged: names => { configured = names; },
    }, ["bash"]);
    actions.refreshTools();
    assert.deepEqual(configured, ["bash", "dynamic"]);
    tool.definition.exposure = exposure;
    actions.refreshTools();
    assert.deepEqual(actions.getActiveTools(), ["bash"]);
    assert.deepEqual(configured, ["bash"], "the native model-tools callback must remove stale declarations");
    if (exposure === "deferred") {
      actions.setActiveTools(["bash", "dynamic"]);
      actions.refreshTools();
      assert.deepEqual(configured, ["bash", "dynamic"], "an unchanged exposure must preserve explicit tool_search activation");
    }
    tool.definition.exposure = "direct";
    actions.refreshTools();
    assert.deepEqual(configured, ["bash", "dynamic"]);
  });
}

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
