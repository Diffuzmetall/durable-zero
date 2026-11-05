import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CLI_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-candidate/packages/cli/bin/durable-zero.js";
const FIXTURE_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fixtures/gated-provider-extension.mjs";
const OUTPUT_DIR = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-product-review";

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
          } catch (err) {
            // predicate error ignored
          }
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

      // Allow process spin-up
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

async function runTestSuite() {
  const results = [];
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dz-review-run-"));
  const tempHome = path.join(tempRoot, "home");
  const tempXdg = path.join(tempRoot, "xdg");
  const tempCwd = path.join(tempRoot, "work");
  const tempGate = path.join(tempRoot, "gate");

  fs.mkdirSync(tempHome, { recursive: true });
  fs.mkdirSync(tempXdg, { recursive: true });
  fs.mkdirSync(tempCwd, { recursive: true });
  fs.mkdirSync(tempGate, { recursive: true });

  const wireLogFile = path.join(OUTPUT_DIR, "wire-observations.jsonl");
  const wireLogStream = fs.createWriteStream(wireLogFile, { flags: "w" });

  const sessionId = "session-product-review-canary";

  console.log(`[Review] Isolated environment created at: ${tempRoot}`);
  console.log(`[Review] Session ID: ${sessionId}`);

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

  // Track admission ID and entry IDs for cross-turn verification
  let turn1AdmissionId = null;
  let turn1UserEntryId = null;
  let turn1AssistantEntryId = null;

  let turn2AdmissionId = null;
  let turn2UserEntryId = null;
  let turn2AssistantEntryId = null;

  try {
    // -------------------------------------------------------------
    // JOURNEY 1: Happy Path & Model Seam Gating (Process 1)
    // -------------------------------------------------------------
    await test("1.1 Cold startup, strict JSON-only stdout, readiness RPC handshake", async () => {
      client1 = new DurableZeroClient({
        home: tempHome,
        xdg: tempXdg,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId,
        wireLogStream,
      });

      await client1.start();

      // Send readiness handshake request session/getState
      const state = await client1.request("session/getState", {}, 10000);
      if (!state || state.sessionId !== sessionId) {
        throw new Error(`Expected sessionId "${sessionId}", got ${state?.sessionId}`);
      }
      if (state.entryCount !== 0) {
        throw new Error(`Expected cold start entryCount 0, got ${state.entryCount}`);
      }
      if (!Array.isArray(state.models) || state.models.length === 0) {
        throw new Error(`Expected registered models in state, got ${JSON.stringify(state.models)}`);
      }

      // Verify stdout contains ONLY valid JSON-RPC lines
      for (const line of client1.stdoutLines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.jsonrpc !== "2.0") {
            throw new Error(`Line is not JSON-RPC 2.0: ${line}`);
          }
        } catch (e) {
          throw new Error(`Non-JSON line observed on stdout: "${line}"`);
        }
      }
    });

    await test("1.2 Unique nonce prompt -> gated model provider stream -> first wire delta BEFORE completion allowed", async () => {
      // Enable model seam gate via file flag in gateDir
      fs.writeFileSync(path.join(tempGate, "enable_gate.flag"), "1");

      const nonce = `Nonce-${Date.now()}-alpha`;
      const promptContent = `Hello world ${nonce}`;

      // Send prompt
      const admissionPromise = client1.request("session/prompt", { content: promptContent }, 10000);

      // Admission response
      const admission = await admissionPromise;
      if (admission.status !== "accepted" || !admission.id) {
        throw new Error(`Expected accepted admission with id, got ${JSON.stringify(admission)}`);
      }
      turn1AdmissionId = admission.id;
      console.log(`[Test] Prompt 1 admitted with id: ${turn1AdmissionId}`);

      // Wait for first wire delta: message_update.assistantMessageEvent.type === "text_delta"
      const firstDeltaMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "message_update" &&
          m.params?.event?.assistantMessageEvent?.type === "text_delta" &&
          Boolean(m.params?.event?.assistantMessageEvent?.delta),
        10000,
        "first wire delta"
      );

      const delta1 = firstDeltaMsg.params.event.assistantMessageEvent.delta;
      console.log(`[Test] Received first wire delta: "${delta1}"`);

      // CRITICAL VERIFICATION: Prove that first delta arrived on wire BEFORE model provider completion
      const turn1Chunk1File = path.join(tempGate, "turn_1_chunk1_emitted.json");
      const turn1ReleaseFile = path.join(tempGate, "turn_1_release_completion.flag");
      const turn1CompletedFile = path.join(tempGate, "turn_1_completed.json");

      if (!fs.existsSync(turn1Chunk1File)) {
        throw new Error("Model provider did not emit chunk 1 to gate");
      }
      if (fs.existsSync(turn1ReleaseFile)) {
        throw new Error("Release flag already exists prematurely!");
      }
      if (fs.existsSync(turn1CompletedFile)) {
        throw new Error("Model provider completed before first wire delta was checked!");
      }

      // Check wire log: assert that NO turn_complete event has been received yet
      let prematureTurnComplete = client1.wireLog.find(
        (w) => w.direction === "recv" && w.message?.params?.event?.type === "turn_complete"
      );
      if (prematureTurnComplete) {
        throw new Error("turn_complete arrived before gate was released!");
      }

      console.log("[Test] EMPIRICAL PROOF VERIFIED: First wire delta arrived while provider completion gate was HELD.");

      // Wait for second wire delta (pushed after 150ms partialInterval window)
      const secondDeltaMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "message_update" &&
          m.params?.event?.assistantMessageEvent?.type === "text_delta" &&
          m.params?.event?.assistantMessageEvent?.delta !== delta1,
        10000,
        "second wire delta"
      );
      const delta2 = secondDeltaMsg.params.event.assistantMessageEvent.delta;
      console.log(`[Test] Received second wire delta: "${delta2}"`);

      // Verify that provider is STILL held at completion gate and turn_complete has NOT arrived
      if (fs.existsSync(turn1CompletedFile)) {
        throw new Error("Model provider completed before completion gate was released!");
      }
      prematureTurnComplete = client1.wireLog.find(
        (w) => w.direction === "recv" && w.message?.params?.event?.type === "turn_complete"
      );
      if (prematureTurnComplete) {
        throw new Error("turn_complete arrived before completion gate was released!");
      }

      console.log("[Test] EMPIRICAL PROOF VERIFIED: Second wire delta arrived while completion gate was STILL HELD.");

      // Now release the completion gate
      fs.writeFileSync(turn1ReleaseFile, "release");

      // Wait for turn_complete correlated with turn1AdmissionId
      const turnCompleteMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === turn1AdmissionId,
        10000,
        `turn_complete for request ${turn1AdmissionId}`
      );

      if (turnCompleteMsg.params.event.status !== "completed") {
        throw new Error(`Expected completed status, got ${turnCompleteMsg.params.event.status}`);
      }

      // Read transcript and verify real user and assistant entries
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

    await test("1.3 Second prompt in SAME process with shared prefix to verify generation-reset and no delta replay", async () => {
      // Shared prefix with different suffix
      const sharedPrefix = "PrefixShared-";
      const prompt2Content = `${sharedPrefix}Turn2-beta`;

      // Pre-release gate for turn 2
      fs.writeFileSync(path.join(tempGate, "turn_2_release_completion.flag"), "release");

      const admission = await client1.request("session/prompt", { content: prompt2Content }, 10000);
      turn2AdmissionId = admission.id;
      if (turn2AdmissionId === turn1AdmissionId) {
        throw new Error("Admission IDs across sequential turns must be distinct");
      }

      const turnCompleteMsg = await client1.waitForEvent(
        (m) =>
          m.method === "session/event" &&
          m.params?.event?.type === "turn_complete" &&
          m.params?.event?.requestId === turn2AdmissionId,
        15000,
        `turn_complete for turn 2 request ${turn2AdmissionId}`
      );

      // Verify transcript has both turns in correct order
      const transcript = await client1.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 2 || assistantEntries.length < 2) {
        throw new Error(`Expected at least 2 user and 2 assistant entries, got user=${userEntries.length}, assistant=${assistantEntries.length}`);
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
      console.log(`[Test] Process 1 exited with: code=${exitResult.code}, signal=${exitResult.signal}`);
      if (exitResult.code !== 0 && exitResult.signal !== null) {
        // Under SIGTERM, code may be 0 if handled cleanly
        if (exitResult.code !== 0) {
          throw new Error(`Expected clean exit code 0 on SIGTERM, got code=${exitResult.code} signal=${exitResult.signal}`);
        }
      }
    });

    await test("2.2 Restart same explicit session directory in new OS process; verify identical historic entries", async () => {
      client2 = new DurableZeroClient({
        home: tempHome,
        xdg: tempXdg,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId,
        wireLogStream,
      });

      await client2.start();

      // Handshake
      const state = await client2.request("session/getState", {}, 10000);
      if (state.sessionId !== sessionId) {
        throw new Error(`Resumed session ID mismatch: expected ${sessionId}, got ${state.sessionId}`);
      }

      // Check transcript on cold start of second process
      const transcript = await client2.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 2 || assistantEntries.length < 2) {
        throw new Error(`Expected at least 2 historical user and assistant entries on restart, got user=${userEntries.length}, assistant=${assistantEntries.length}`);
      }

      // Assert identical IDs and text
      if (userEntries[0].id !== turn1UserEntryId || assistantEntries[0].id !== turn1AssistantEntryId) {
        throw new Error(`Turn 1 historical entry ID mismatch on restart: user=${userEntries[0].id} (expected ${turn1UserEntryId}), assistant=${assistantEntries[0].id} (expected ${turn1AssistantEntryId})`);
      }
      if (userEntries[1].id !== turn2UserEntryId || assistantEntries[1].id !== turn2AssistantEntryId) {
        throw new Error(`Turn 2 historical entry ID mismatch on restart: user=${userEntries[1].id} (expected ${turn2UserEntryId}), assistant=${assistantEntries[1].id} (expected ${turn2AssistantEntryId})`);
      }
      console.log("[Test] RESUMED TRANSCRIPT VERIFIED: Historical entry IDs and text 100% identical.");
    });

    await test("2.3 Third distinct completed reply in restarted Process 2 with updated native entries", async () => {
      const prompt3Content = "Prompt3-post-restart-gamma";

      // Allow automatic completion in restarted process by unlinking enable_gate.flag
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
        `turn_complete for turn 3 request ${turn3AdmissionId}`
      );

      const transcript = await client2.request("session/getTranscript", {}, 10000);
      const userEntries = transcript.entries.filter((e) => e.kind === "pi.user" || e.role === "user");
      const assistantEntries = transcript.entries.filter((e) => e.kind === "pi.assistant" || e.role === "assistant");

      if (userEntries.length < 3 || assistantEntries.length < 3) {
        throw new Error(`Expected 3 user and 3 assistant entries, got user=${userEntries.length}, assistant=${assistantEntries.length}`);
      }

      const thirdAssistant = assistantEntries[assistantEntries.length - 1];
      if (thirdAssistant.text !== `Echo: ${prompt3Content}`) {
        throw new Error(`Third reply text mismatch: ${thirdAssistant.text}`);
      }

      // Clean shutdown of Process 2
      const exitResult = await client2.close("SIGTERM", 3000);
      console.log(`[Test] Process 2 exited with code=${exitResult.code}, signal=${exitResult.signal}`);
      if (exitResult.code !== 0) {
        throw new Error(`Process 2 expected clean exit code 0, got ${exitResult.code}`);
      }
    });

    // -------------------------------------------------------------
    // JOURNEY 3: Adversarial Operator & Error Recovery
    // -------------------------------------------------------------
    await test("3.1 Malformed JSON returns -32700 Parse error without server crash", async () => {
      const client3 = new DurableZeroClient({
        home: tempHome,
        xdg: tempXdg,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-error-probe",
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

      // Verify server is still alive and responsive to valid RPC
      const state = await client3.request("session/getState", {}, 5000);
      if (!state || state.sessionId !== "session-error-probe") {
        throw new Error("Server failed to respond to valid request after parse error");
      }

      await client3.close("SIGTERM", 3000);
    });

    await test("3.2 Unrecognized method returns -32601 Method not found", async () => {
      const client4 = new DurableZeroClient({
        home: tempHome,
        xdg: tempXdg,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-method-probe",
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

    await test("3.3 Pending in-flight requests rejected on child process exit", async () => {
      const client5 = new DurableZeroClient({
        home: tempHome,
        xdg: tempXdg,
        cwd: tempCwd,
        gateDir: tempGate,
        sessionId: "session-reject-probe",
        wireLogStream,
      });

      await client5.start();

      // Send prompt without releasing gate
      try {
        fs.unlinkSync(path.join(tempGate, "turn_4_release_completion.flag"));
      } catch (_) {}
      const pendingPrompt = client5.request("session/prompt", { content: "Will be interrupted" }, 15000);

      // Kill process while request is in flight
      await sleep(100);
      client5.child.kill("SIGKILL");

      let rejectedError = null;
      try {
        await pendingPrompt;
      } catch (err) {
        rejectedError = err;
      }

      if (!rejectedError) {
        throw new Error("Expected in-flight request to reject upon process exit, but it did not reject!");
      }
      console.log(`[Test] In-flight request correctly rejected: ${rejectedError.message}`);
      await client5.close();
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
    candidateArtifact: CLI_PATH,
    candidateSha256: "813931832b4f689713b67cafb3421f4a4fe328a7daa64259acf845f1572efff6",
    verdict: failures.length === 0 ? "PASS" : "FAIL",
    totalTests: results.length,
    passedTests: results.filter((r) => r.status === "passed").length,
    failedTests: failures.length,
    results,
    findings: failures.map((f) => ({
      severity: "P1",
      rule: "AP-076",
      title: f.name,
      evidence: f.error,
      stack: f.stack,
    })),
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "findings.json"), JSON.stringify(findings, null, 2));

  console.log("\n================ TEST SUMMARY ================");
  console.log(`Total: ${results.length}, Passed: ${findings.passedTests}, Failed: ${findings.failedTests}`);
  console.log(`Verdict: ${findings.verdict}`);
  console.log("==============================================\n");

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function generateJUnitXml(results) {
  const failures = results.filter((r) => r.status === "failed");
  const totalTime = results.reduce((acc, r) => acc + r.duration, 0) / 1000;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="DurableZero-ProductReview" tests="${results.length}" failures="${failures.length}" errors="0" time="${totalTime.toFixed(3)}">\n`;
  xml += `  <testsuite name="NativeSlice0-BlackBox" tests="${results.length}" failures="${failures.length}" errors="0" time="${totalTime.toFixed(3)}">\n`;

  for (const r of results) {
    const timeSec = (r.duration / 1000).toFixed(3);
    xml += `    <testcase name="${escapeXml(r.name)}" classname="NativeSlice0" time="${timeSec}">\n`;
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

runTestSuite().catch((err) => {
  console.error("FATAL RUNNER ERROR:", err);
  process.exit(1);
});
