import test, { after, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DurableZeroClient, createIsolatedEnv, closeAllActiveClients } from "./durable-zero-client.mjs";

const CLI_PATH = process.env.R3_CLI_PATH || "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-3/packages/cli/bin/durable-zero.js";
const FIXTURE_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/fixtures/r3-provider-extension.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-suite-"));
const { tempCwd, tempGate, env } = createIsolatedEnv(tempRoot);
const sessionId = "session-fixround3-verified";

afterEach(async () => {
  await closeAllActiveClients();
});

after(async () => {
  await closeAllActiveClients();
});

let turn1AdmissionId = null;
let turn1UserEntryId = null;
let turn1AssistantEntryId = null;

let turn2AdmissionId = null;
let turn2UserEntryId = null;
let turn2AssistantEntryId = null;

// -----------------------------------------------------------------
// JOURNEY 1: Happy Path & Reasoning+Text Multi-Block Streaming
// -----------------------------------------------------------------
test("1.1 Cold startup, strict JSON-only stdout, readiness RPC handshake", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();

  const state = await client.request("session/getState", {}, 10000);
  assert.ok(state, "Expected state object");
  assert.strictEqual(state.sessionId, sessionId, "Session ID mismatch");
  assert.strictEqual(state.entryCount, 0, "Expected entryCount 0 on cold startup");
  assert.ok(Array.isArray(state.models) && state.models.length > 0, "Expected models array");

  for (const line of client.stdoutLines) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.jsonrpc, "2.0", `Expected JSON-RPC 2.0 line: ${line}`);
  }

  await client.close("SIGTERM", 2000);
});

test("1.2 Multi-block reasoning+text streaming -> first wire delta BEFORE completion allowed", async () => {
  fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();

  const nonce = `FixRound3Nonce-${Date.now()}`;
  const promptContent = `Verify multi-block ${nonce}`;

  const admission = await client.request("session/prompt", { content: promptContent }, 10000);
  assert.strictEqual(admission.status, "accepted", "Expected accepted status");
  turn1AdmissionId = admission.id;

  // 1. Observe thinking_delta on contentIndex: 0
  const thinkingMsg = await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "message_update" &&
      m.params?.event?.assistantMessageEvent?.type === "thinking_delta" &&
      m.params?.event?.assistantMessageEvent?.contentIndex === 0,
    10000,
    "thinking_delta on contentIndex 0"
  );
  assert.strictEqual(thinkingMsg.params.event.assistantMessageEvent.contentIndex, 0);

  // 2. Observe text_delta on contentIndex: 1
  const firstTextMsg = await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "message_update" &&
      m.params?.event?.assistantMessageEvent?.type === "text_delta" &&
      m.params?.event?.assistantMessageEvent?.contentIndex === 1,
    10000,
    "text_delta on contentIndex 1"
  );
  assert.strictEqual(firstTextMsg.params.event.assistantMessageEvent.contentIndex, 1);

  // 3. Verify wire delta arrived BEFORE completion gate release
  const turn1Chunk1File = path.join(tempGate, "turn_1_chunk1_emitted.json");
  const turn1ReleaseFile = path.join(tempGate, "turn_1_release_completion.flag");
  const turn1CompletedFile = path.join(tempGate, "turn_1_completed.json");

  assert.ok(fs.existsSync(turn1Chunk1File), "Expected chunk1 to be emitted");
  assert.ok(!fs.existsSync(turn1ReleaseFile), "Release flag should not exist yet");
  assert.ok(!fs.existsSync(turn1CompletedFile), "Model provider should not have completed yet");

  // Release gate
  fs.writeFileSync(turn1ReleaseFile, "release");

  // Wait for correlated turn_complete
  const turnCompleteMsg = await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === turn1AdmissionId,
    10000,
    "turn_complete for turn 1"
  );
  assert.strictEqual(turnCompleteMsg.params.event.status, "completed");

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const userEntry = transcript.entries.find((e) => e.kind === "pi.user" || e.role === "user");
  const assistantEntry = transcript.entries.find((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.strictEqual(userEntry?.text, promptContent, "User text mismatch");
  assert.strictEqual(assistantEntry?.text, `Echo: ${promptContent}`, "Assistant text mismatch");

  turn1UserEntryId = userEntry.id;
  turn1AssistantEntryId = assistantEntry.id;
  assert.ok(turn1UserEntryId && turn1AssistantEntryId, "Entry IDs must exist");
  assert.notStrictEqual(turn1UserEntryId, turn1AssistantEntryId, "User and assistant IDs must differ");
  assert.notStrictEqual(turn1UserEntryId, turn1AdmissionId, "Entry ID must differ from submissionId");

  await client.close("SIGTERM", 2000);
});

test("1.3 Second prompt in SAME process with shared prefix to verify generation-reset", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();

  const prompt2Content = "PrefixShared-Turn2-fixround3";
  fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

  const admission = await client.request("session/prompt", { content: prompt2Content }, 10000);
  turn2AdmissionId = admission.id;
  assert.notStrictEqual(turn2AdmissionId, turn1AdmissionId, "Sequential admission IDs must differ");

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === turn2AdmissionId,
    15000,
    "turn_complete for turn 2"
  );

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
  const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.ok(userEntries.length >= 2, "Expected at least 2 user entries");
  assert.ok(assistantEntries.length >= 2, "Expected at least 2 assistant entries");

  const secondUser = userEntries[userEntries.length - 1];
  const secondAssistant = assistantEntries[assistantEntries.length - 1];

  assert.strictEqual(secondUser.text, prompt2Content);
  assert.strictEqual(secondAssistant.text, `Echo: ${prompt2Content}`);

  turn2UserEntryId = secondUser.id;
  turn2AssistantEntryId = secondAssistant.id;
  assert.notStrictEqual(turn2UserEntryId, turn1UserEntryId, "Turn 2 user ID must differ from turn 1");

  await client.close("SIGTERM", 2000);
});

// -----------------------------------------------------------------
// JOURNEY 2: Multi-Process Restart & SQLite Persistence
// -----------------------------------------------------------------
test("2.1 Clean SIGTERM shutdown of Process with exit code 0", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();
  const exitResult = await client.close("SIGTERM", 2000);
  assert.strictEqual(exitResult.code, 0, `Expected clean exit code 0, got ${exitResult.code}`);
});

test("2.2 Restart same explicit session in new OS process; verify identical historic entries", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();

  const state = await client.request("session/getState", {}, 10000);
  assert.strictEqual(state.sessionId, sessionId);

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
  const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.ok(userEntries.length >= 2, "Expected historical user entries");
  assert.strictEqual(userEntries[0].id, turn1UserEntryId, "Turn 1 user ID mismatch on restart");
  assert.strictEqual(assistantEntries[0].id, turn1AssistantEntryId, "Turn 1 assistant ID mismatch on restart");
  assert.strictEqual(userEntries[1].id, turn2UserEntryId, "Turn 2 user ID mismatch on restart");
  assert.strictEqual(assistantEntries[1].id, turn2AssistantEntryId, "Turn 2 assistant ID mismatch on restart");

  await client.close("SIGTERM", 2000);
});

test("2.3 Third distinct completed reply in restarted Process with updated native entries", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
  });

  await client.start();

  const prompt3Content = "Prompt3-post-restart-fixround3";
  try { fs.unlinkSync(path.join(tempGate, "enable_gate.flag")); } catch (_) {}
  fs.writeFileSync(path.join(tempGate, "turn_1_release_completion.flag"), "release");
  fs.writeFileSync(path.join(tempGate, "turn_3_release_completion.flag"), "release");

  const admission = await client.request("session/prompt", { content: prompt3Content }, 10000);

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === admission.id,
    15000,
    "turn_complete for turn 3"
  );

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");
  assert.ok(assistantEntries.length >= 3, "Expected at least 3 assistant entries");
  assert.strictEqual(assistantEntries[assistantEntries.length - 1].text, `Echo: ${prompt3Content}`);

  await client.close("SIGTERM", 2000);
});

// -----------------------------------------------------------------
// JOURNEY 3: Error Recovery & Adversarial Operator
// -------------------------------------------------------------
test("3.1 Malformed JSON returns -32700 Parse error without server crash", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-error-probe-fixround3",
  });

  await client.start();

  const parseErrorPromise = client.waitForEvent(
    (m) => m.error && m.error.code === -32700,
    5000,
    "Parse error -32700"
  );

  client.sendRaw("CORRUPTED_JSON_STREAM_!!!\n");
  const errorMsg = await parseErrorPromise;
  assert.strictEqual(errorMsg.error.code, -32700);

  const state = await client.request("session/getState", {}, 5000);
  assert.strictEqual(state.sessionId, "session-error-probe-fixround3");

  await client.close("SIGTERM", 2000);
});

test("3.2 Unrecognized method returns -32601 Method not found", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-method-probe-fixround3",
  });

  await client.start();

  let caught = null;
  try {
    await client.request("unsupported/method", {}, 5000);
  } catch (err) {
    caught = err;
  }

  assert.ok(caught && caught.message.includes("-32601"), "Expected -32601 error");
  await client.close("SIGTERM", 2000);
});

test("3.3 Consumer harness pending requests rejected on child process exit", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-reject-probe-fixround3",
  });

  await client.start();

  const pendingPrompt = client.request("session/prompt", { content: "Will be interrupted" }, 15000);
  await new Promise((r) => setTimeout(r, 100));

  client.child.kill("SIGKILL");

  let rejectedError = null;
  try {
    await pendingPrompt;
  } catch (err) {
    rejectedError = err;
  }

  assert.ok(rejectedError, "Expected in-flight request to reject upon process exit");
  await client.close();
});

// -----------------------------------------------------------------
// JOURNEY 4: Lifetime Bug Fix & Turn Abort
// -----------------------------------------------------------------
test("4.1 Ready-server stdin EOF closes and exits cleanly with bounded exit code 0", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-eof-probe-fixround3",
  });

  await client.start();
  const state = await client.request("session/getState", {}, 5000);
  assert.ok(state, "Server not ready before EOF");

  const eofStart = Date.now();
  const exitPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Server did not exit within 5000ms after stdin EOF"));
    }, 5000);

    client.child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, durationMs: Date.now() - eofStart });
    });
  });

  client.child.stdin.end();
  const exitResult = await exitPromise;

  assert.strictEqual(exitResult.code, 0, "Expected exit code 0 on stdin EOF");
  assert.ok(exitResult.durationMs <= 5000, `Expected bounded exit <= 5000ms, took ${exitResult.durationMs}ms`);
});

test("4.2 Root abort-active-turn (session/abort) halts in-flight turn and allows subsequent prompt in same session", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-abort-probe-fixround3",
  });

  await client.start();
  fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

  const prompt1 = "Turn 1 to be aborted";
  const admission1 = await client.request("session/prompt", { content: prompt1 }, 10000);

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "message_update" &&
      m.params?.event?.assistantMessageEvent?.type === "thinking_delta",
    5000,
    "thinking_delta before abort"
  );

  const abortedEventPromise = client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.status === "aborted" &&
      m.params?.event?.requestId === admission1.id,
    5000,
    "turn_complete with status=aborted"
  );

  const sessionAbortedPromise = client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "session/aborted",
    5000,
    "session/aborted event"
  );

  fs.writeFileSync(path.join(tempGate, "abort.flag"), "abort");
  const abortResult = await client.request("session/abort", {}, 5000);
  assert.strictEqual(abortResult, null);

  await Promise.all([abortedEventPromise, sessionAbortedPromise]);

  try { fs.unlinkSync(path.join(tempGate, "enable_gate.flag")); } catch (_) {}
  try { fs.unlinkSync(path.join(tempGate, "abort.flag")); } catch (_) {}
  fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

  const prompt2 = "Turn 2 executed after abort";
  const admission2 = await client.request("session/prompt", { content: prompt2 }, 10000);

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === admission2.id &&
      m.params?.event?.status === "completed",
    15000,
    "turn_complete for turn 2"
  );

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");

  assert.ok(userEntries.length >= 2, "Expected at least 2 user entries");
  assert.strictEqual(userEntries[0].text, prompt1);
  assert.strictEqual(userEntries[1].text, prompt2);

  await client.close("SIGTERM", 2000);
});

// -----------------------------------------------------------------
// JOURNEY 5: Native Builtin I/O Tool Execution & Environment Effects (Fix Round 3)
// -----------------------------------------------------------------
test("5.1 Native builtin I/O tool execution (read) yields owned file sentinel through Harness", async () => {
  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-toolroundtrip-fixround3",
  });

  await client.start();

  const sentinelFile = path.join(tempCwd, "r3-sentinel.txt");
  const sentinelSecret = `SECRET_TOKEN_${Date.now()}_R3_VERIFIED`;
  fs.writeFileSync(sentinelFile, sentinelSecret);

  const toolPrompt = `TOOL_ROUNDTRIP: ${sentinelFile}`;

  const toolStartPromise = client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "tool_execution_start" &&
      m.params?.event?.toolName === "read",
    10000,
    "tool_execution_start for read"
  );

  const toolEndPromise = client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "tool_execution_end" &&
      m.params?.event?.toolName === "read",
    10000,
    "tool_execution_end for read"
  );

  const admission = await client.request("session/prompt", { content: toolPrompt }, 10000);
  assert.ok(admission && admission.id, "Expected admission ID");

  const [startEvt, endEvt] = await Promise.all([toolStartPromise, toolEndPromise]);
  assert.ok(startEvt, "Expected tool execution start");

  // On R3 with full NativeNodeEnv, tool execution must succeed with isError === false
  assert.strictEqual(
    endEvt.params.event.isError,
    false,
    `Native builtin read tool failed: ${JSON.stringify(endEvt.params.event.result)}`
  );

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === admission.id &&
      m.params?.event?.status === "completed",
    15000,
    "turn_complete for tool prompt"
  );

  const transcript = await client.request("session/getTranscript", {}, 10000);
  const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");
  const finalAssistant = assistantEntries[assistantEntries.length - 1];

  assert.ok(
    finalAssistant && finalAssistant.text.includes(sentinelSecret),
    `Expected assistant response to contain sentinel secret "${sentinelSecret}", got "${finalAssistant?.text}"`
  );

  await client.close("SIGTERM", 2000);
});
