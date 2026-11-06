import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { loadSummaries, applySubagentSummaries } from "../src/engine/runtime-hydration.ts";
import { nativeRuntimeState } from "./fixtures/runtime-state.ts";
import { SubagentsDoc, type SubagentsState } from "../src/engine/subagent-docs.ts";
import { LiveDoc, InboxDoc } from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openDurable } from "../src/engine/runtime.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("native commit publications update nonselected rows and hydrate the same documents", async () => {
  const base = await mkdtemp(join(tmpdir(), "zero-native-activity-"));
  let runtime: Awaited<ReturnType<typeof openDurable>> | undefined;
  try {
    runtime = await openDurable({ cwd: base, sessionDir: join(base, "session"), cli: { noGlobalExtensions: true },
      nativeExecutionEnvFactory: target => new NodeExecutionEnv({ cwd: target.cwd ?? base }) });
    const selected = runtime.view.current().conversation.conversation.id;
    // Ownerless, empty native conversation: no task, prompt, agent, or model is launched.
    const child = await runtime.harness.createConversation({ ownership: { kind: "ownerless" } }, context);
    await runtime.harness.commit(async tx => {
      await tx.doc(LiveDoc, child.id);
      await tx.doc(InboxDoc, child.id);
      await tx.doc(SubagentsDoc, selected);
      await tx.appendEntry(child.id, { kind: "pi.user", model: [{ role: "user", content: "NONSELECTED_NATIVE_ROW" }] });
    }, context);
    const row = runtime.view.current().conversations.find(row => row.id === child.id)!;
    assert.ok(row);
    assert.equal(row.title, "NONSELECTED_NATIVE_ROW");
    assert.deepEqual(row.live, await runtime.harness.snapshot(LiveDoc, child.id, context));
    assert.deepEqual(row.inbox, await runtime.harness.snapshot(InboxDoc, child.id, context));
    assert.ok(row.live && row.inbox, "publication omitted native documents");
    const hydrated = (await loadSummaries(runtime.harness, selected)).find(row => row.id === child.id)!;
    assert.deepEqual(hydrated, row);
    assert.equal(runtime.view.current().conversation.conversation.id, selected, "activity switched the selected conversation");
    assert.equal(row.lastStop, undefined, "an empty conversation was presented as completed");
  } finally { await runtime?.close(); await rm(base, { recursive: true, force: true }); }
});

// Passive native transcript records, not launched subagents or model calls.
test("nonselected conversation summaries recover actual assistant stop reasons", async () => {
  const native = await nativeRuntimeState();
  try {
    let summaries = await loadSummaries(native.harness, native.root.id);
    assert.equal(summaries.find(row => row.id === native.child.id)?.lastStop, undefined, "unknown activity became done");
    const assistant: AssistantMessage = {
      role: "assistant", content: [{ type: "text", text: "CHILD_REPLY" }], api: "fixture", provider: "fixture", model: "fixture", timestamp: 0,
      stopReason: "stop", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    };
    await native.harness.commit(async tx => {
      await tx.appendEntry(native.child.id, { kind: "pi.user", model: [{ role: "user", content: "ACTUAL_CHILD_TASK" }] });
      await tx.appendEntry(native.child.id, { kind: "pi.assistant", model: [assistant] });
    }, context);
    summaries = await loadSummaries(native.harness, native.root.id);
    const row = summaries.find(row => row.id === native.child.id)!;
    assert.equal(row.title, "ACTUAL_CHILD_TASK");
    assert.equal(row.lastStop, "stop");
    await native.harness.commit(tx => tx.appendEntry(native.child.id, { kind: "pi.assistant", model: [{ ...assistant, stopReason: "aborted" }] }), context);
    assert.equal((await loadSummaries(native.harness, native.root.id)).find(row => row.id === native.child.id)?.lastStop, "aborted");
  } finally { await native.close(); }
});

test("native durable.subagents metadata supplies names/tasks; parent prose is not completion evidence", async () => {
  const native = await nativeRuntimeState();
  try {
    const input = [{ id: native.child.id, label: `subagent ${native.child.id}` }];
    // Minimal metadata fixture: no native task execution or admission receipt is claimed.
    const doc = { agents: { worker: { name: "named-worker", conversationId: native.child.id, task: "Check the actual file", role: "checker" } } } as SubagentsState;
    const rows = applySubagentSummaries(input, native.root.id, doc);
    assert.equal(rows[0].label, "named-worker");
    assert.equal(rows[0].title, "Check the actual file");
    assert.equal(rows[0].role, "checker");
    assert.equal(rows[0].parentId, native.root.id);
    assert.equal(rows[0].lastStop, undefined);
    assert.equal(input[0].label, `subagent ${native.child.id}`, "projection mutated native source");
  } finally { await native.close(); }
});
