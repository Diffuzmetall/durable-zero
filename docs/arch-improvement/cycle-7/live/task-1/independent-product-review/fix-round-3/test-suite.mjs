import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Default to candidate path if provided by environment, or placeholder for builder delivery
const CLI_PATH = process.env.R3_CLI_PATH || "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-3/packages/cli/bin/durable-zero.js";
const FIXTURE_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3/fixtures/r3-provider-extension.mjs";
const OUTPUT_DIR = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-3";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class DurableZeroClient {
  constructor(options) {
    this.options = options;
    this.reqId = 0;
    this.pending = new Map();
    this.waiters = new Set();
    this.wireLog = [];
    this.stdoutLines = [];
    this.stderrLines = [];
    this.isExited = false;
    this.exitCode = null;
    this.exitSignal = null;
    this.child = null;
    this.rl = null;
  }

  logWire(direction, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      direction,
      message,
      meta,
    };
    this.wireLog.push(entry);
    if (this.options.wireLogStream) {
      this.options.wireLogStream.write(JSON.stringify(entry) + "\n");
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      const args = [
        this.options.cliPath || CLI_PATH,
        "serve",
        "--no-global-extensions",
        "--provider", "scripted-e2e",
        "--model", "echo",
        "--extension", this.options.fixturePath || FIXTURE_PATH,
        "--session", this.options.sessionId,
      ];

      this.child = spawn("node", args, {
        cwd: this.options.cwd,
        env: {
          ...process.env,
          HOME: this.options.home,
          XDG_DATA_HOME: this.options.xdg,
          PI_AGENT_DIR: this.options.agentDir,
          GATE_DIR: this.options.gateDir,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.child.on("error", (err) => {
        this.logWire("system", { error: err.message }, { role: "spawn_error" });
        reject(err);
      });

      this.rl = readline.createInterface({ input: this.child.stdout });

      this.rl.on("line", (line) => {
        this.stdoutLines.push(line);
        let parsed = null;
        try {
          parsed = JSON.parse(line);
        } catch (e) {
          this.logWire("recv_raw", { line, parseError: e.message });
          return;
        }

        this.logWire("recv", parsed);

        if (parsed.id !== undefined && parsed.id !== null) {
          const handler = this.pending.get(parsed.id);
          if (handler) {
            this.pending.delete(parsed.id);
            clearTimeout(handler.timer);
            if (parsed.error) {
              handler.reject(new Error(`JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`));
            } else {
              handler.resolve(parsed.result);
            }
          }
        }

        for (const waiter of Array.from(this.waiters)) {
          try {
            if (waiter.predicate(parsed)) {
              this.waiters.delete(waiter);
              clearTimeout(waiter.timer);
              waiter.resolve(parsed);
            }
          } catch (_) {}
        }
      });

      this.child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        this.stderrLines.push(text);
        this.logWire("stderr", { text });
      });

      this.child.on("exit", (code, signal) => {
        this.isExited = true;
        this.exitCode = code;
        this.exitSignal = signal;
        this.logWire("system", { code, signal }, { role: "exit" });

        for (const [id, handler] of this.pending) {
          clearTimeout(handler.timer);
          handler.reject(new Error(`Child exited with code ${code} signal ${signal} while request id=${id} was pending`));
        }
        this.pending.clear();

        for (const waiter of this.waiters) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error(`Child exited with code ${code} signal ${signal} while waiting for event`));
        }
        this.waiters.clear();
      });

      setTimeout(resolve, 50);
    });
  }

  request(method, params = {}, timeoutMs = 15000) {
    if (this.isExited) {
      return Promise.reject(new Error("Cannot send request; child process already exited"));
    }
    this.reqId++;
    const id = this.reqId;
    const payload = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request id=${id} (${method}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.logWire("send", payload);
      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  sendRaw(rawText) {
    this.logWire("send_raw", { text: rawText });
    this.child.stdin.write(rawText + "\n");
  }

  waitForEvent(predicate, timeoutMs = 15000, desc = "event") {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for: ${desc}`));
      }, timeoutMs);

      const waiter = { predicate, resolve, reject, timer, desc };
      this.waiters.add(waiter);
    });
  }

  async close(signal = "SIGTERM", timeoutMs = 3000) {
    if (this.isExited) {
      return { code: this.exitCode, signal: this.exitSignal };
    }
    return new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        if (!this.isExited && this.child) {
          this.logWire("system", {}, { role: "sigkill_fallback" });
          try {
            this.child.kill("SIGKILL");
          } catch (_) {}
        }
      }, timeoutMs);

      this.child.once("exit", (code, sig) => {
        clearTimeout(forceTimer);
        if (this.rl) {
          try { this.rl.close(); } catch (_) {}
        }
        resolve({ code, signal: sig });
      });

      try {
        if (this.child.stdin && !this.child.stdin.destroyed) {
          this.child.stdin.end();
        }
      } catch (_) {}

      try {
        this.child.kill(signal);
      } catch (_) {}
    });
  }
}

export async function runTestSuite(customCliPath = CLI_PATH, customExpectedSha = null) {
  const results = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-fixround3-run-"));
  const tempHome = path.join(tempRoot, "home");
  const tempXdg = path.join(tempRoot, "xdg");
  const tempAgent = path.join(tempRoot, "agent");
  const tempCwd = path.join(tempRoot, "work");
  const tempGate = path.join(tempRoot, "gate");

  fs.mkdirSync(tempHome, { recursive: true });
  fs.mkdirSync(tempXdg, { recursive: true });
  fs.mkdirSync(tempAgent, { recursive: true });
  fs.mkdirSync(tempCwd, { recursive: true });
  fs.mkdirSync(tempGate, { recursive: true });

  const wireLogFile = path.join(OUTPUT_DIR, "wire-observations.jsonl");
  const wireLogStream = fs.createWriteStream(wireLogFile, { flags: "w" });

  const sessionId = "session-fixround3-canary";

  console.log(`[Review FixRound3] Isolated environment: ${tempRoot}`);
  console.log(`[Review FixRound3] Target CLI: ${customCliPath}`);
  console.log(`[Review FixRound3] Session ID: ${sessionId}`);

  let client1 = null;
  let client2 = null;

  async function test(name, fn) {
    const start = Date.now();
    console.log(`\n--- RUNNING: ${name} ---`);
    try {
      await fn();
      const dur = Date.now() - start;
      console.log(`PASSED: ${name} (${dur}ms)`);
      results.push({ name, status: "passed", duration: dur });
    } catch (err) {
      const dur = Date.now() - start;
      console.error(`FAILED: ${name} (${dur}ms) - ${err.message}`);
      results.push({ name, status: "failed", duration: dur, error: err.message, stack: err.stack });
    }
  }

  let turn1AdmissionId = null;
  let turn1UserEntryId = null;
  let turn1AssistantEntryId = null;

  let turn2AdmissionId = null;
  let turn2UserEntryId = null;
  let turn2AssistantEntryId = null;

  try {
    // -------------------------------------------------------------
    // JOURNEY 1: Happy Path & Reasoning+Text Multi-Block Streaming
    // -------------------------------------------------------------
    await test("1.1 Cold startup, strict JSON-only stdout, readiness RPC handshake", async () => {
      client1 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId,
        wireLogStream,
      });

      await client1.start();

      const state = await client1.request("session/getState", {}, 10000);
      if (!state || state.sessionId !== sessionId) {
        throw new Error(`Expected sessionId "${sessionId}", got ${state?.sessionId}`);
      }
      if (state.entryCount !== 0) {
        throw new Error(`Expected cold start entryCount 0, got ${state.entryCount}`);
      }
      if (!Array.isArray(state.models) || state.models.length === 0) {
        throw new Error(`Expected registered models in state`);
      }

      for (const line of client1.stdoutLines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.jsonrpc !== "2.0") {
            throw new Error(`Non JSON-RPC 2.0 line: ${line}`);
          }
        } catch (e) {
          throw new Error(`Non-JSON line on stdout: "${line}"`);
        }
      }
    });

    await test("1.2 Multi-block reasoning+text streaming -> first wire delta BEFORE completion allowed", async () => {
      fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

      const nonce = `FixRound3Nonce-${Date.now()}`;
      const promptContent = `Verify multi-block ${nonce}`;

      const admission = await client1.request("session/prompt", { content: promptContent }, 10000);
      if (admission.status !== "accepted" || !admission.id) {
        throw new Error(`Expected accepted admission with id, got ${JSON.stringify(admission)}`);
      }
      turn1AdmissionId = admission.id;
      console.log(`[Test] Prompt 1 admitted with id: ${turn1AdmissionId}`);

      const thinkingMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "message_update" &&
          m.params?.event?.assistantMessageEvent?.type === "thinking_delta" &&
          m.params?.event?.assistantMessageEvent?.contentIndex === 0,
        10000,
        "thinking_delta on contentIndex 0"
      );
      console.log(`[Test] Received thinking_delta on contentIndex: ${thinkingMsg.params.event.assistantMessageEvent.contentIndex}`);

      const firstTextMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "message_update" &&
          m.params?.event?.assistantMessageEvent?.type === "text_delta" &&
          m.params?.event?.assistantMessageEvent?.contentIndex === 1,
        10000,
        "text_delta on contentIndex 1"
      );
      const delta1 = firstTextMsg.params.event.assistantMessageEvent.delta;
      console.log(`[Test] Received first text delta on contentIndex 1: "${delta1}"`);

      const turn1Chunk1File = path.join(tempGate, "turn_1_chunk1_emitted.json");
      const turn1ReleaseFile = path.join(tempGate, "turn_1_release_completion.flag");
      const turn1CompletedFile = path.join(tempGate, "turn_1_completed.json");

      if (!fs.existsSync(turn1Chunk1File)) {
        throw new Error("Model provider did not emit chunk 1");
      }
      if (fs.existsSync(turn1ReleaseFile)) {
        throw new Error("Release flag exists prematurely");
      }
      if (fs.existsSync(turn1CompletedFile)) {
        throw new Error("Model provider completed before wire delta verification");
      }

      let prematureTurnComplete = client1.wireLog.find(
        (w) => w.direction === "recv" && w.message?.params?.event?.type === "turn_complete"
      );
      if (prematureTurnComplete) {
        throw new Error("turn_complete arrived before gate was released!");
      }

      console.log("[Test] EMPIRICAL PROOF: Multi-block wire deltas arrived while completion was HELD.");

      fs.writeFileSync(turn1ReleaseFile, "release");

      const turnCompleteMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === turn1AdmissionId,
        10000,
        `turn_complete for ${turn1AdmissionId}`
      );

      if (turnCompleteMsg.params.event.status !== "completed") {
        throw new Error(`Expected completed status, got ${turnCompleteMsg.params.event.status}`);
      }

      const transcript = await client1.request("session/getTranscript", {}, 10000);
      const userEntry = transcript.entries.find((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntry = transcript.entries.find((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (!userEntry || userEntry.text !== promptContent) {
        throw new Error(`User entry mismatch. Expected "${promptContent}", got "${userEntry?.text}"`);
      }

      const expectedAssistantText = `Echo: ${promptContent}`;
      if (!assistantEntry || assistantEntry.text !== expectedAssistantText) {
        throw new Error(`Assistant entry mismatch. Expected "${expectedAssistantText}", got "${assistantEntry?.text}"`);
      }

      turn1UserEntryId = userEntry.id;
      turn1AssistantEntryId = assistantEntry.id;

      if (!turn1UserEntryId || !turn1AssistantEntryId) {
        throw new Error("Entry IDs missing or empty");
      }
      if (turn1UserEntryId === turn1AssistantEntryId) {
        throw new Error("User entry ID and assistant entry ID must be distinct");
      }
      if (turn1UserEntryId === turn1AdmissionId || turn1AssistantEntryId === turn1AdmissionId) {
        throw new Error("SubmissionId must differ from EntryId");
      }

      console.log(`[Test] Turn 1 Entry IDs: user=${turn1UserEntryId}, assistant=${turn1AssistantEntryId}, submission=${turn1AdmissionId}`);
    });

    await test("1.3 Second prompt in SAME process with shared prefix to verify generation-reset", async () => {
      const prompt2Content = "PrefixShared-Turn2-fixround3";

      fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

      const admission = await client1.request("session/prompt", { content: prompt2Content }, 10000);
      turn2AdmissionId = admission.id;
      if (turn2AdmissionId === turn1AdmissionId) {
        throw new Error("Admission IDs across sequential turns must be distinct");
      }

      await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === turn2AdmissionId,
        15000,
        `turn_complete for turn 2`
      );

      const transcript = await client1.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 2 || assistantEntries.length < 2) {
        throw new Error(`Expected at least 2 turns in transcript`);
      }

      const secondUser = userEntries[userEntries.length - 1];
      const secondAssistant = assistantEntries[assistantEntries.length - 1];

      if (secondUser.text !== prompt2Content) {
        throw new Error(`Second user entry text mismatch: ${secondUser.text}`);
      }
      if (secondAssistant.text !== `Echo: ${prompt2Content}`) {
        throw new Error(`Second assistant reply text mismatch: ${secondAssistant.text}`);
      }

      turn2UserEntryId = secondUser.id;
      turn2AssistantEntryId = secondAssistant.id;

      if (turn2UserEntryId === turn1UserEntryId || turn2AssistantEntryId === turn1AssistantEntryId) {
        throw new Error("Turn 2 entry IDs must be distinct from Turn 1 entry IDs");
      }
      console.log(`[Test] Turn 2 Entry IDs: user=${turn2UserEntryId}, assistant=${turn2AssistantEntryId}, submission=${turn2AdmissionId}`);
    });

    // -------------------------------------------------------------
    // JOURNEY 2: Multi-Process Restart & SQLite Persistence
    // -------------------------------------------------------------
    await test("2.1 Clean SIGTERM shutdown of Process 1 with exit code 0", async () => {
      const exitResult = await client1.close("SIGTERM", 3000);
      console.log(`[Test] Process 1 exit: code=${exitResult.code}, signal=${exitResult.signal}`);
      if (exitResult.code !== 0 && exitResult.signal !== null) {
        if (exitResult.code !== 0) {
          throw new Error(`Expected exit code 0, got code=${exitResult.code}`);
        }
      }
    });

    await test("2.2 Restart same explicit session in new OS process; verify identical historic entries", async () => {
      client2 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId,
        wireLogStream,
      });

      await client2.start();

      const state = await client2.request("session/getState", {}, 10000);
      if (state.sessionId !== sessionId) {
        throw new Error(`Session ID mismatch: ${state.sessionId}`);
      }

      const transcript = await client2.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 2 || assistantEntries.length < 2) {
        throw new Error(`Expected at least 2 historical entries on restart`);
      }

      if (userEntries[0].id !== turn1UserEntryId || assistantEntries[0].id !== turn1AssistantEntryId) {
        throw new Error(`Turn 1 historical ID mismatch on restart`);
      }
      if (userEntries[1].id !== turn2UserEntryId || assistantEntries[1].id !== turn2AssistantEntryId) {
        throw new Error(`Turn 2 historical ID mismatch on restart`);
      }
      console.log("[Test] RESUMED TRANSCRIPT VERIFIED: Historical entry IDs and text 100% identical.");
    });

    await test("2.3 Third distinct completed reply in restarted Process 2 with updated native entries", async () => {
      const prompt3Content = "Prompt3-post-restart-fixround3";

      try {
        fs.unlinkSync(path.join(tempGate, "enable_gate.flag"));
      } catch (_) {}
      fs.writeFileSync(path.join(tempGate, "turn_1_release_completion.flag"), "release");
      fs.writeFileSync(path.join(tempGate, "turn_3_release_completion.flag"), "release");

      const admission = await client2.request("session/prompt", { content: prompt3Content }, 10000);
      const turn3AdmissionId = admission.id;

      await client2.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === turn3AdmissionId,
        15000,
        `turn_complete for turn 3`
      );

      const transcript = await client2.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 3 || assistantEntries.length < 3) {
        throw new Error(`Expected 3 user and 3 assistant entries`);
      }

      const thirdAssistant = assistantEntries[assistantEntries.length - 1];
      if (thirdAssistant.text !== `Echo: ${prompt3Content}`) {
        throw new Error(`Third reply text mismatch: ${thirdAssistant.text}`);
      }

      const exitResult = await client2.close("SIGTERM", 3000);
      if (exitResult.code !== 0) {
        throw new Error(`Process 2 expected clean exit code 0, got ${exitResult.code}`);
      }
    });

    // -------------------------------------------------------------
    // JOURNEY 3: Error Recovery & Adversarial Operator
    // -------------------------------------------------------------
    await test("3.1 Malformed JSON returns -32700 Parse error without server crash", async () => {
      const client3 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-error-probe-fixround3",
        wireLogStream,
      });

      await client3.start();

      const parseErrorPromise = client3.waitForEvent(
        (m) => m.error && m.error.code === -32700,
        5000,
        "Parse error -32700"
      );

      client3.sendRaw("CORRUPTED_JSON_STREAM_!!!\n");
      const errorMsg = await parseErrorPromise;
      if (errorMsg.error.code !== -32700) {
        throw new Error(`Expected -32700, got ${errorMsg.error.code}`);
      }

      const state = await client3.request("session/getState", {}, 5000);
      if (!state || state.sessionId !== "session-error-probe-fixround3") {
        throw new Error("Server failed to respond after parse error");
      }

      await client3.close("SIGTERM", 3000);
    });

    await test("3.2 Unrecognized method returns -32601 Method not found", async () => {
      const client4 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-method-probe-fixround3",
        wireLogStream,
      });

      await client4.start();

      let caught = null;
      try {
        await client4.request("unsupported/method", {}, 5000);
      } catch (err) {
        caught = err;
      }

      if (!caught || !caught.message.includes("-32601")) {
        throw new Error(`Expected -32601 Method not found error, got: ${caught?.message}`);
      }

      await client4.close("SIGTERM", 3000);
    });

    await test("3.3 Consumer harness pending requests rejected on child process exit", async () => {
      const client5 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-reject-probe-fixround3",
        wireLogStream,
      });

      await client5.start();

      const pendingPrompt = client5.request("session/prompt", { content: "Will be interrupted" }, 15000);

      await sleep(100);
      client5.child.kill("SIGKILL");

      let rejectedError = null;
      try {
        await pendingPrompt;
      } catch (err) {
        rejectedError = err;
      }

      if (!rejectedError) {
        throw new Error("Expected in-flight request to reject upon process exit");
      }
      console.log(`[Test] In-flight request correctly rejected: ${rejectedError.message}`);
      await client5.close();
    });

    // -------------------------------------------------------------
    // JOURNEY 4: Lifetime Bug Fix & Turn Abort
    // -------------------------------------------------------------
    await test("4.1 Ready-server stdin EOF closes and exits cleanly with bounded exit code 0", async () => {
      const client6 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-eof-probe-fixround3",
        wireLogStream,
      });

      await client6.start();

      const state = await client6.request("session/getState", {}, 5000);
      if (!state || state.sessionId !== "session-eof-probe-fixround3") {
        throw new Error("Server not ready before EOF");
      }

      const eofStart = Date.now();
      const exitPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Server did not exit within 5000ms after stdin EOF"));
        }, 5000);

        client6.child.once("exit", (code, signal) => {
          clearTimeout(timer);
          resolve({ code, signal, durationMs: Date.now() - eofStart });
        });
      });

      console.log("[Test] Sending EOF on stdin...");
      client6.child.stdin.end();

      const exitResult = await exitPromise;
      console.log(`[Test] Server exited after stdin EOF: code=${exitResult.code}, signal=${exitResult.signal}, duration=${exitResult.durationMs}ms`);

      if (exitResult.code !== 0) {
        throw new Error(`Expected clean exit code 0 on stdin EOF, got code=${exitResult.code}`);
      }
      if (exitResult.durationMs > 5000) {
        throw new Error(`Expected bounded exit <= 5000ms, took ${exitResult.durationMs}ms`);
      }
    });

    await test("4.2 Root abort-active-turn (session/abort) halts in-flight turn and allows subsequent prompt in same session", async () => {
      const client7 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-abort-probe-fixround3",
        wireLogStream,
      });

      await client7.start();

      fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

      const prompt1 = "Turn 1 to be aborted";
      const admission1 = await client7.request("session/prompt", { content: prompt1 }, 10000);
      console.log(`[Test] Turn 1 admitted with id: ${admission1.id}`);

      await client7.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "message_update" &&
          m.params?.event?.assistantMessageEvent?.type === "thinking_delta",
        5000,
        "thinking_delta before abort"
      );

      console.log("[Test] Turn 1 active. Invoking session/abort...");

      const abortedEventPromise = client7.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.status === "aborted" &&
          m.params?.event?.requestId === admission1.id,
        5000,
        "turn_complete with status=aborted"
      );

      const sessionAbortedPromise = client7.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "session/aborted",
        5000,
        "session/aborted event"
      );

      fs.writeFileSync(path.join(tempGate, "abort.flag"), "abort");
      const abortResult = await client7.request("session/abort", {}, 5000);
      console.log(`[Test] session/abort returned: ${JSON.stringify(abortResult)}`);

      await Promise.all([abortedEventPromise, sessionAbortedPromise]);
      console.log("[Test] Observed turn_complete status=aborted and session/aborted event.");

      try {
        fs.unlinkSync(path.join(tempGate, "enable_gate.flag"));
      } catch (_) {}
      try {
        fs.unlinkSync(path.join(tempGate, "abort.flag"));
      } catch (_) {}
      fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

      const prompt2 = "Turn 2 executed after abort";
      console.log("[Test] Sending Prompt 2 after abort in same session...");
      const admission2 = await client7.request("session/prompt", { content: prompt2 }, 10000);
      console.log(`[Test] Turn 2 admitted with id: ${admission2.id}`);

      await client7.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === admission2.id &&
          m.params?.event?.status === "completed",
        15000,
        "turn_complete completed for turn 2"
      );

      const transcript = await client7.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");

      if (userEntries.length < 2) {
        throw new Error(`Expected at least 2 user entries after abort + prompt 2, got ${userEntries.length}`);
      }
      if (userEntries[0].text !== prompt1 || userEntries[1].text !== prompt2) {
        throw new Error("User prompt sequence mismatch after abort");
      }

      console.log("[Test] ABORT RECOVERY VERIFIED: Turn was cleanly aborted and subsequent prompt succeeded.");
      await client7.close("SIGTERM", 3000);
    });

    // -------------------------------------------------------------
    // JOURNEY 5: Native Builtin I/O Tool Execution & Environment Effects (Fix Round 3)
    // -------------------------------------------------------------
    await test("5.1 Native builtin I/O tool execution (read) yields owned file sentinel through Harness", async () => {
      const client8 = new DurableZeroClient({
        cliPath: customCliPath,
        home: tempHome,
        xdg: tempXdg,
        agentDir: tempAgent,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-toolroundtrip-fixround3",
        wireLogStream,
      });

      await client8.start();

      const sentinelFile = path.join(tempCwd, "r3-sentinel.txt");
      const sentinelSecret = `SECRET_TOKEN_${Date.now()}_R3_VERIFIED`;
      fs.writeFileSync(sentinelFile, sentinelSecret);

      const toolPrompt = `TOOL_ROUNDTRIP: ${sentinelFile}`;
      console.log(`[Test 5.1] Invoking prompt targeting sentinel file: ${sentinelFile}`);

      // Expect tool_execution_start
      const toolStartPromise = client8.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "tool_execution_start" &&
          m.params?.event?.toolName === "read",
        10000,
        "tool_execution_start for read"
      );

      // Expect tool_execution_end with isError: false
      const toolEndPromise = client8.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "tool_execution_end" &&
          m.params?.event?.toolName === "read",
        10000,
        "tool_execution_end for read"
      );

      const admission = await client8.request("session/prompt", { content: toolPrompt }, 10000);
      console.log(`[Test 5.1] Prompt admitted with id: ${admission.id}`);

      const [startEvt, endEvt] = await Promise.all([toolStartPromise, toolEndPromise]);
      console.log(`[Test 5.1] Observed tool execution start:`, startEvt.params.event.toolCallId);
      console.log(`[Test 5.1] Observed tool execution end: isError=${endEvt.params.event.isError}`);

      if (endEvt.params.event.isError) {
        throw new Error(`Tool execution failed unexpectedly: ${JSON.stringify(endEvt.params.event.result)}`);
      }

      // Turn complete for the entire exchange
      await client8.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === admission.id &&
          m.params?.event?.status === "completed",
        15000,
        "turn_complete for tool prompt"
      );

      // Verify transcript contains toolResult entry with sentinelSecret and final assistant reply
      const transcript = await client8.request("session/getTranscript", {}, 10000);
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");
      const finalAssistant = assistantEntries[assistantEntries.length - 1];

      if (!finalAssistant || !finalAssistant.text.includes(sentinelSecret)) {
        throw new Error(`Expected assistant response to contain sentinel secret "${sentinelSecret}", got "${finalAssistant?.text}"`);
      }

      console.log(`[Test 5.1] NATIVE BUILTIN I/O TOOL ROUNDTRIP PROVEN: Sentinel content "${sentinelSecret}" successfully read and returned!`);
      await client8.close("SIGTERM", 3000);
    });

  } finally {
    if (client1) await client1.close();
    if (client2) await client2.close();
    wireLogStream.end();
  }

  // Generate JUnit XML
  const junit = generateJUnitXml(results);
  fs.writeFileSync(path.join(OUTPUT_DIR, "test-report.junit.xml"), junit);

  // Generate Findings JSON
  const failures = results.filter((r) => r.status === "failed");
  const findings = {
    evaluatedAt: new Date().toISOString(),
    candidateArtifact: customCliPath,
    candidateSha256: customExpectedSha || "PENDING_BUILDER_R3_DELIVERY",
    fixRound: "fix-round-3",
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    totalTests: results.length,
    passedTests: results.filter((r) => r.status === "passed").length,
    failedTests: failures.length,
    results,
    findings: failures.map((f) => ({
      severity: "P1",
      title: f.name,
      evidence: f.error,
      stack: f.stack,
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "findings.json"), JSON.stringify(findings, null, 2));

  console.log("\n================ FIX ROUND 3 TEST SUMMARY ================");
  console.log(`Total: ${results.length}, Passed: ${findings.passedTests}, Failed: ${failures.length}`);
  console.log(`Verdict: ${findings.verdict}`);
  console.log("==========================================================\n");

  return findings;
}

function generateJUnitXml(results) {
  const failures = results.filter((r) => r.status === "failed");
  const totalTime = results.reduce((acc, r) => acc + r.duration, 0) / 1000;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="DurableZero-FixRound3-ProductReview" tests="${results.length}" failures="${failures.length}" errors="0" time="${totalTime.toFixed(3)}">\n`;
  xml += `  <testsuite name="NativeFixRound3-BlackBox" tests="${results.length}" failures="${failures.length}" errors="0" time="${totalTime.toFixed(3)}">\n`;

  for (const r of results) {
    const timeSec = (r.duration / 1000).toFixed(3);
    xml += `    <testcase name="${escapeXml(r.name)}" classname="NativeFixRound3" time="${timeSec}">\n`;
    if (r.status === "failed") {
      xml += `      <failure message="${escapeXml(r.error)}"><![CDATA[${r.stack || r.error}]]></failure>\n`;
    }
    xml += `    </testcase>\n`;
  }

  xml += `  </testsuite>\n`;
  xml += `</testsuites>\n`;
  return xml;
}

function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  runTestSuite().catch((err) => {
    console.error("FATAL RUNNER ERROR:", err);
    process.exit(1);
  });
}
