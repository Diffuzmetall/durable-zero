import test, { after, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DurableZeroClient, createIsolatedEnv, closeAllActiveClients } from "./durable-zero-client.mjs";

const CLI_PATH = process.env.R3_CLI_PATH || "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-3/packages/cli/bin/durable-zero.js";
const FIXTURE_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/fixtures/r3-provider-extension.mjs";
const OUTPUT_DIR = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3";

const wireLogFile = path.join(OUTPUT_DIR, "r3-final-wire-observations.jsonl");
// Truncate/create fresh wire log file
fs.writeFileSync(wireLogFile, "");
const wireLogStream = fs.createWriteStream(wireLogFile, { flags: "a" });

afterEach(async () => {
  await closeAllActiveClients();
});

after(async () => {
  wireLogStream.end();
  await closeAllActiveClients();
});

// -----------------------------------------------------------------
// JOURNEY 1: Happy Path - Single PID from Cold Startup through 2 Turns
// -----------------------------------------------------------------
test("Journey 1: Happy Path - Cold start, readiness, gated first prompt, and same-process second prompt generation-reset", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j1-"));
  const { tempCwd, tempGate, env } = createIsolatedEnv(tempRoot);
  const sessionId = "session-journey1-single-process";

  // Enable gate for turn 1
  fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
    wireLogStream,
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
  });

  await client.start();
  const pid = client.child.pid;
  assert.ok(pid > 0, "Expected valid child PID");

  // Step 1.1: Cold startup & readiness handshake
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

  // Step 1.2: Gated prompt 1 in same process
  const nonce = `J1Nonce-${Date.now()}`;
  const prompt1Content = `Verify multi-block ${nonce}`;

  const admission1 = await client.request("session/prompt", { content: prompt1Content }, 10000);
  assert.strictEqual(admission1.status, "accepted", "Expected accepted status");
  const turn1AdmissionId = admission1.id;

  // Thinking delta on contentIndex 0
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

  // Text delta on contentIndex 1
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

  // Barrier assertion: wire delta arrived BEFORE completion allowed
  const turn1Chunk1File = path.join(tempGate, "turn_1_chunk1_emitted.json");
  const turn1ReleaseFile = path.join(tempGate, "turn_1_release_completion.flag");
  const turn1CompletedFile = path.join(tempGate, "turn_1_completed.json");

  assert.ok(fs.existsSync(turn1Chunk1File), "Expected chunk1 to be emitted");
  assert.ok(!fs.existsSync(turn1ReleaseFile), "Release flag should not exist prematurely");
  assert.ok(!fs.existsSync(turn1CompletedFile), "Model provider should not have completed yet");

  // Release gate
  fs.writeFileSync(turn1ReleaseFile, "release");

  // Correlated completion
  const turnCompleteMsg1 = await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === turn1AdmissionId,
    10000,
    "turn_complete for turn 1"
  );
  assert.strictEqual(turnCompleteMsg1.params.event.status, "completed");

  const transcript1 = await client.request("session/getTranscript", {}, 10000);
  const userEntry1 = transcript1.entries.find((e) => e.kind === "pi.user" || e.role === "user");
  const assistantEntry1 = transcript1.entries.find((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.strictEqual(userEntry1?.text, prompt1Content);
  assert.strictEqual(assistantEntry1?.text, `Echo: ${prompt1Content}`);

  const turn1UserEntryId = userEntry1.id;
  const turn1AssistantEntryId = assistantEntry1.id;
  assert.ok(turn1UserEntryId && turn1AssistantEntryId, "Entry IDs must exist");
  assert.notStrictEqual(turn1UserEntryId, turn1AssistantEntryId, "User and assistant IDs must differ");
  assert.notStrictEqual(turn1UserEntryId, turn1AdmissionId, "Entry ID must differ from submissionId");

  // CRITICAL CAUSAL ASSERTION: Process must be EXACTLY THE SAME PID and still running
  assert.strictEqual(client.child.pid, pid, "Process PID must be identical between turns");
  assert.strictEqual(client.isExited, false, "Process must remain alive for second prompt");

  // Step 1.3: Second prompt in THAT SAME PROCESS (PID) with shared prefix
  const prompt2Content = "PrefixShared-Turn2-same-pid";
  fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

  const admission2 = await client.request("session/prompt", { content: prompt2Content }, 10000);
  const turn2AdmissionId = admission2.id;
  assert.notStrictEqual(turn2AdmissionId, turn1AdmissionId, "Sequential admission IDs must differ");

  await client.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === turn2AdmissionId,
    15000,
    "turn_complete for turn 2"
  );

  const transcript2 = await client.request("session/getTranscript", {}, 10000);
  const userEntries = transcript2.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
  const assistantEntries = transcript2.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.ok(userEntries.length >= 2, "Expected at least 2 user entries");
  assert.ok(assistantEntries.length >= 2, "Expected at least 2 assistant entries");

  const secondUser = userEntries[userEntries.length - 1];
  const secondAssistant = assistantEntries[assistantEntries.length - 1];

  assert.strictEqual(secondUser.text, prompt2Content);
  assert.strictEqual(secondAssistant.text, `Echo: ${prompt2Content}`);
  assert.notStrictEqual(secondUser.id, turn1UserEntryId, "Turn 2 user ID must differ from turn 1");

  // Clean shutdown of Journey 1 process
  const exitResult = await client.close("SIGTERM", 2000);
  assert.strictEqual(exitResult.code, 0, `Expected clean exit code 0, got ${exitResult.code}`);
});

// -----------------------------------------------------------------
// JOURNEY 2: Multi-Process Restart & Persistence (Phase A + Phase B)
// -----------------------------------------------------------------
test("Journey 2: Multi-Process Restart & Persistence - Resumed process verifies historical entries and executes third prompt in same restarted PID", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j2-"));
  const { tempCwd, tempGate, env } = createIsolatedEnv(tempRoot);
  const sessionId = "session-journey2-restart-persistence";

  // Phase A: Seed session with two turns in Client A
  const clientA = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
    wireLogStream,
  });

  t.after(async () => {
    await clientA.close("SIGTERM", 2000);
  });

  await clientA.start();
  const pidA = clientA.child.pid;

  const promptA1 = "SeedTurn1-Alpha";
  fs.writeFileSync(path.join(tempGate, "turn_1_release_completion.flag"), "release");
  const admA1 = await clientA.request("session/prompt", { content: promptA1 }, 10000);
  await clientA.waitForEvent(
    (m) => m.method === "session/event" && m.params?.event?.type === "turn_complete" && m.params?.event?.requestId === admA1.id,
    15000
  );

  const promptA2 = "SeedTurn2-Beta";
  fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");
  const admA2 = await clientA.request("session/prompt", { content: promptA2 }, 10000);
  await clientA.waitForEvent(
    (m) => m.method === "session/event" && m.params?.event?.type === "turn_complete" && m.params?.event?.requestId === admA2.id,
    15000
  );

  const transcriptA = await clientA.request("session/getTranscript", {}, 10000);
  const usersA = transcriptA.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
  const asstsA = transcriptA.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");
  assert.strictEqual(usersA.length, 2);
  assert.strictEqual(asstsA.length, 2);

  const turn1UserId = usersA[0].id;
  const turn1AsstId = asstsA[0].id;
  const turn2UserId = usersA[1].id;
  const turn2AsstId = asstsA[1].id;

  // Clean exit code 0 of Client A
  const exitA = await clientA.close("SIGTERM", 2000);
  assert.strictEqual(exitA.code, 0, "Phase A expected exit code 0");

  // Phase B: Restart in NEW process (Client B) with same session ID
  const clientB = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId,
    wireLogStream,
  });

  t.after(async () => {
    await clientB.close("SIGTERM", 2000);
  });

  await clientB.start();
  const pidB = clientB.child.pid;
  assert.notStrictEqual(pidB, pidA, "Restarted process must have a distinct PID");

  // Step 2.2: Verify historical transcript integrity in restarted process
  const stateB = await clientB.request("session/getState", {}, 10000);
  assert.strictEqual(stateB.sessionId, sessionId);

  const transcriptB = await clientB.request("session/getTranscript", {}, 10000);
  const usersB = transcriptB.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
  const asstsB = transcriptB.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

  assert.strictEqual(usersB.length, 2, "Expected 2 historical user entries on restart");
  assert.strictEqual(usersB[0].id, turn1UserId, "Historical turn 1 user ID mismatch");
  assert.strictEqual(asstsB[0].id, turn1AsstId, "Historical turn 1 assistant ID mismatch");
  assert.strictEqual(usersB[1].id, turn2UserId, "Historical turn 2 user ID mismatch");
  assert.strictEqual(asstsB[1].id, turn2AsstId, "Historical turn 2 assistant ID mismatch");

  // Step 2.3: Execute prompt 3 in THAT SAME RESTARTED PROCESS (Client B)
  assert.strictEqual(clientB.child.pid, pidB, "Process PID must be identical for turn 3");
  assert.strictEqual(clientB.isExited, false, "Restarted process must remain alive");

  const promptB3 = "Prompt3-post-restart-same-restarted-pid";
  try { fs.unlinkSync(path.join(tempGate, "enable_gate.flag")); } catch (_) {}
  fs.writeFileSync(path.join(tempGate, "turn_1_release_completion.flag"), "release");
  fs.writeFileSync(path.join(tempGate, "turn_3_release_completion.flag"), "release");

  const admB3 = await clientB.request("session/prompt", { content: promptB3 }, 10000);

  await clientB.waitForEvent(
    (m) =>
      m.method === "session/event" &&
      m.params?.event?.type === "turn_complete" &&
      m.params?.event?.requestId === admB3.id,
    15000,
    "turn_complete for turn 3"
  );

  const transcriptBFinal = await clientB.request("session/getTranscript", {}, 10000);
  const asstsBFinal = transcriptBFinal.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");
  assert.strictEqual(asstsBFinal.length, 3, "Expected 3 assistant entries after turn 3");
  assert.strictEqual(asstsBFinal[asstsBFinal.length - 1].text, `Echo: ${promptB3}`);

  const exitB = await clientB.close("SIGTERM", 2000);
  assert.strictEqual(exitB.code, 0, "Phase B expected clean exit code 0");
});

// -----------------------------------------------------------------
// JOURNEY 3: Error Recovery & Adversarial Operator
// -----------------------------------------------------------------
test("Journey 3.1: Malformed JSON returns -32700 Parse error without server crash", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j31-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-error-probe-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
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
});

test("Journey 3.2: Unrecognized method returns -32601 Method not found", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j32-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-method-probe-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
  });

  await client.start();

  let caught = null;
  try {
    await client.request("unsupported/method", {}, 5000);
  } catch (err) {
    caught = err;
  }

  assert.ok(caught && caught.message.includes("-32601"), "Expected -32601 error");
});

test("Journey 3.3: Consumer harness pending requests rejected on child process exit", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j33-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-reject-probe-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close();
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
});

// -----------------------------------------------------------------
// JOURNEY 4: Lifetime Bug Fix & Turn Abort
// -----------------------------------------------------------------
test("Journey 4.1: Ready-server stdin EOF closes and exits cleanly with bounded exit code 0", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j41-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-eof-probe-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close();
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

test("Journey 4.2: Root abort-active-turn (session/abort) halts in-flight turn and allows subsequent prompt in same session", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j42-"));
  const { tempCwd, tempGate, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-abort-probe-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
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
});

// -----------------------------------------------------------------
// JOURNEY 5: Native Builtin I/O Tool Execution & Environment Effects (Fix Round 3)
// -----------------------------------------------------------------
test("Journey 5.1: Native builtin I/O tool execution (read) yields owned file sentinel through Harness", async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-j51-"));
  const { tempCwd, env } = createIsolatedEnv(tempRoot);

  const client = new DurableZeroClient({
    cliPath: CLI_PATH,
    fixturePath: FIXTURE_PATH,
    cwd: tempCwd,
    env,
    sessionId: "session-toolroundtrip-fixround3",
    wireLogStream,
  });

  t.after(async () => {
    await client.close("SIGTERM", 2000);
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
});
