import test, { after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DurableZeroClient, createIsolatedEnv, closeAllActiveClients } from "./durable-zero-client.mjs";

const R2_CLI_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/packages/cli/bin/durable-zero.js";
const FIXTURE_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/fixtures/r3-provider-extension.mjs";

after(async () => {
  await closeAllActiveClients();
});

test("R2 Native Builtin Tool Execution Negative Control (should fail on R2 due to missing nativeEnv methods)", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-r2-negtest-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const sentinelFile = path.join(tempCwd, "sentinel-r2-probe.txt");
  const sentinelContent = "EXPECTED_SENTINEL_CONTENT_R2_NEGATIVE";
  fs.writeFileSync(sentinelFile, sentinelContent);

  const client = new DurableZeroClient({
    cliPath: R2_CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-r2-negative-control",
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
  });

  await client.start();

  const toolPrompt = `TOOL_ROUNDTRIP: ${sentinelFile}`;

  const toolEndPromise = client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "tool_execution_end" &&
      m.params?.event?.toolName === "read",
    10000,
    "tool_execution_end for read"
  );

  const admission = await client.request("session/prompt", { content: toolPrompt }, 10000);
  assert.ok(admission && admission.id, "Expected admission with id");

  const endEvt = await toolEndPromise;
  const toolResult = endEvt.params.event;

  // EXPECTED CORRECT BEHAVIOR ASSERTION:
  // On a fully compliant native runtime, tool execution must succeed (isError === false)
  // and yield the actual file content. On R2, this assertion genuinely FAILS because
  // env.absolutePath is not a function.
  assert.strictEqual(
    toolResult.isError,
    false,
    `Native builtin read tool failed with error: ${JSON.stringify(toolResult.result)}`
  );

  assert.ok(
    String(toolResult.result).includes(sentinelContent),
    `Expected tool result to contain sentinel content "${sentinelContent}", got: ${JSON.stringify(toolResult.result)}`
  );
});
