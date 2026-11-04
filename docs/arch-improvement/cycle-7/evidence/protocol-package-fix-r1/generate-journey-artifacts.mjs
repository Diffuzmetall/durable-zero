import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { jsonRpcResponseSchema, JsonRpcMethodNotFoundError } from "@durable-zero/protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = join(__dirname, "test-consumer-server.mjs");

class WireTracer extends EventEmitter {
  constructor() {
    super();
    this.logs = [];
    this.child = spawn("node", [SERVER_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: __dirname,
    });

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      this.record("RECV", line);
      try {
        const parsed = JSON.parse(line);
        this.emit("message", parsed);
      } catch (err) {
        this.emit("raw", line);
      }
    });

    this.child.stderr.on("data", (d) => {
      this.record("STDERR", d.toString().trim());
    });

    this.child.on("exit", (code, signal) => {
      this.record("EXIT", `code=${code} signal=${signal}`);
      this.emit("exit", { code, signal });
    });
  }

  record(dir, content) {
    const entry = {
      timestamp: new Date().toISOString(),
      direction: dir,
      content,
    };
    this.logs.push(entry);
  }

  send(payload) {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.record("SEND", raw);
    this.child.stdin.write(raw + "\n");
  }

  async waitForMessage(predicate, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for message`));
      }, timeoutMs);

      const onMsg = (msg) => {
        if (predicate(msg)) {
          cleanup();
          resolve(msg);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off("message", onMsg);
      };

      this.on("message", onMsg);
    });
  }

  async close() {
    if (this.child.killed || this.child.exitCode !== null) return;
    this.send({ jsonrpc: "2.0", id: "shutdown-id", method: "shutdown" });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        resolve();
      }, 1000);
      this.child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

async function main() {
  const journeys = [];
  const allLogs = [];

  // ==========================================
  // Journey 1: Happy Path
  // ==========================================
  {
    const tracer = new WireTracer();
    const steps = [];

    // Step 1: ID 0
    tracer.send({ jsonrpc: "2.0", id: 0, method: "echo", params: { case: "id-zero" } });
    const respId0 = await tracer.waitForMessage((m) => m && m.id === 0);
    steps.push({
      name: "Request with numeric ID 0",
      req: { jsonrpc: "2.0", id: 0, method: "echo", params: { case: "id-zero" } },
      resp: respId0,
      valid: respId0.id === 0 && respId0.result?.case === "id-zero",
    });

    // Step 2: ID ""
    tracer.send({ jsonrpc: "2.0", id: "", method: "echo", params: { case: "id-empty-string" } });
    const respIdEmpty = await tracer.waitForMessage((m) => m && m.id === "");
    steps.push({
      name: "Request with empty string ID",
      req: { jsonrpc: "2.0", id: "", method: "echo", params: { case: "id-empty-string" } },
      resp: respIdEmpty,
      valid: respIdEmpty.id === "" && respIdEmpty.result?.case === "id-empty-string",
    });

    // Step 3: Notification execution and silence
    tracer.send({ jsonrpc: "2.0", id: "check-init", method: "get_state" });
    const initSt = await tracer.waitForMessage((m) => m && m.id === "check-init");

    let receivedDuringNotify = null;
    const trap = (m) => { receivedDuringNotify = m; };
    tracer.on("message", trap);

    tracer.send({ jsonrpc: "2.0", method: "notify_increment", params: { amount: 33 } });
    await new Promise((r) => setTimeout(r, 60));
    tracer.off("message", trap);

    tracer.send({ jsonrpc: "2.0", id: "check-after", method: "get_state" });
    const afterSt = await tracer.waitForMessage((m) => m && m.id === "check-after");

    steps.push({
      name: "Notification execution & silence",
      initialCounter: initSt.result.counter,
      notificationSent: { jsonrpc: "2.0", method: "notify_increment", params: { amount: 33 } },
      silenceObserved: receivedDuringNotify === null,
      counterAfter: afterSt.result.counter,
      valid: receivedDuringNotify === null && afterSt.result.counter === 33,
    });

    // Step 4: Reverse request
    const revPromise = tracer.waitForMessage((m) => m && m.id === "origin-rev");
    tracer.send({
      jsonrpc: "2.0",
      id: "origin-rev",
      method: "reverse_call",
      params: { method: "host_get_info", params: { topic: "kernel" }, timeoutMs: 2000 },
    });

    const outReq = await tracer.waitForMessage((m) => m && m.method === "host_get_info");
    tracer.send({
      jsonrpc: "2.0",
      id: outReq.id,
      result: { kernelVersion: "6.1.0" },
    });

    const revResp = await revPromise;
    steps.push({
      name: "Reverse request bidirectional echo & usable result",
      outgoingWireId: outReq.id,
      wireEchoResult: revResp.result,
      valid: revResp.result?.kernelVersion === "6.1.0",
    });

    // Step 5: Falsy values and void return
    tracer.send({ jsonrpc: "2.0", id: "f-zero", method: "falsy_zero" });
    const rZero = await tracer.waitForMessage((m) => m && m.id === "f-zero");

    tracer.send({ jsonrpc: "2.0", id: "f-false", method: "falsy_false" });
    const rFalse = await tracer.waitForMessage((m) => m && m.id === "f-false");

    tracer.send({ jsonrpc: "2.0", id: "f-empty", method: "falsy_empty_str" });
    const rEmpty = await tracer.waitForMessage((m) => m && m.id === "f-empty");

    tracer.send({ jsonrpc: "2.0", id: "f-null", method: "falsy_null" });
    const rNull = await tracer.waitForMessage((m) => m && m.id === "f-null");

    tracer.send({ jsonrpc: "2.0", id: "v-return", method: "void_return" });
    const rVoid = await tracer.waitForMessage((m) => m && m.id === "v-return");

    steps.push({
      name: "Falsy and void results",
      results: {
        zero: rZero.result,
        falseVal: rFalse.result,
        emptyStr: rEmpty.result,
        nullVal: rNull.result,
        voidVal: rVoid.result,
      },
      valid:
        rZero.result === 0 &&
        rFalse.result === false &&
        rEmpty.result === "" &&
        rNull.result === null &&
        rVoid.result === null,
    });

    await tracer.close();
    allLogs.push(...tracer.logs);

    journeys.push({
      name: "Happy Path",
      status: steps.every((s) => s.valid) ? "PASS" : "FAIL",
      steps,
    });
  }

  // ==========================================
  // Journey 2: Cold Start
  // ==========================================
  {
    const tracer = new WireTracer();
    const steps = [];

    tracer.send({ jsonrpc: "2.0", id: "cold-init", method: "get_state" });
    const initResp = await tracer.waitForMessage((m) => m && m.id === "cold-init");

    steps.push({
      name: "Fresh process zero-state initial query",
      state: initResp.result,
      valid: initResp.result.counter === 0 && initResp.result.logsCount === 0,
    });

    // Clean shutdown with in-flight request
    tracer.send({
      jsonrpc: "2.0",
      id: "hanging-call",
      method: "reverse_call",
      params: { method: "never_replied", params: {}, timeoutMs: 15000 },
    });
    await tracer.waitForMessage((m) => m && m.method === "never_replied");

    tracer.send({ jsonrpc: "2.0", id: "shutdown-call", method: "shutdown" });
    const exitEvent = await new Promise((resolve) => tracer.on("exit", resolve));

    steps.push({
      name: "Clean shutdown with in-flight reverse request",
      exitCode: exitEvent.code,
      valid: exitEvent.code === 0,
    });

    allLogs.push(...tracer.logs);
    journeys.push({
      name: "Cold Start",
      status: steps.every((s) => s.valid) ? "PASS" : "FAIL",
      steps,
    });
  }

  // ==========================================
  // Journey 3: Adversarial / Error Recovery
  // ==========================================
  {
    const tracer = new WireTracer();
    const steps = [];

    // 1. Missing method (-32601)
    tracer.send({ jsonrpc: "2.0", id: "err-unreg", method: "unregistered_method" });
    const rUnreg = await tracer.waitForMessage((m) => m && m.id === "err-unreg");
    steps.push({
      name: "Unregistered method returns -32601",
      code: rUnreg.error?.code,
      message: rUnreg.error?.message,
      valid: rUnreg.error?.code === -32601,
    });

    // 2. Explicit JsonRpcMethodNotFoundError (-32601)
    tracer.send({
      jsonrpc: "2.0",
      id: "err-thrown-nf",
      method: "throw_not_found",
      params: { methodName: "special_service" },
    });
    const rThrownNf = await tracer.waitForMessage((m) => m && m.id === "err-thrown-nf");
    steps.push({
      name: "Explicit JsonRpcMethodNotFoundError returns -32601",
      code: rThrownNf.error?.code,
      message: rThrownNf.error?.message,
      valid: rThrownNf.error?.code === -32601,
    });

    // 2b. Subclass of JsonRpcMethodNotFoundError (-32601)
    tracer.send({
      jsonrpc: "2.0",
      id: "err-subclass-nf",
      method: "throw_subclass_not_found",
      params: { methodName: "subclass_feature" },
    });
    const rSubclass = await tracer.waitForMessage((m) => m && m.id === "err-subclass-nf");
    steps.push({
      name: "Subclass of JsonRpcMethodNotFoundError returns -32601",
      code: rSubclass.error?.code,
      message: rSubclass.error?.message,
      valid: rSubclass.error?.code === -32601,
    });

    // 3. Generic handler failure (-32603)
    tracer.send({
      jsonrpc: "2.0",
      id: "err-generic",
      method: "throw_generic",
      params: { message: "SQL transaction failed" },
    });
    const rGeneric = await tracer.waitForMessage((m) => m && m.id === "err-generic");
    steps.push({
      name: "Generic handler error returns -32603",
      code: rGeneric.error?.code,
      message: rGeneric.error?.message,
      valid: rGeneric.error?.code === -32603,
    });

    // 3b. Counterexample verification: Generic error with name reassigned to JsonRpcMethodNotFoundError
    tracer.send({
      jsonrpc: "2.0",
      id: "err-generic-named",
      method: "throw_generic_named_nf",
      params: { message: "backend fault" },
    });
    const rGenericNamed = await tracer.waitForMessage((m) => m && m.id === "err-generic-named");
    steps.push({
      name: "Counterexample: Generic error with name='JsonRpcMethodNotFoundError' returns -32603 (ADDRESSED)",
      code: rGenericNamed.error?.code,
      message: rGenericNamed.error?.message,
      expectedCode: -32603,
      actualCode: rGenericNamed.error?.code,
      valid: rGenericNamed.error?.code === -32603,
    });

    // 4. Invalid Request (-32600)
    tracer.send({ jsonrpc: "2.0", id: "err-invalid-req" });
    const rInv = await tracer.waitForMessage((m) => m && m.id === "err-invalid-req");
    steps.push({
      name: "Missing method returns -32600 Invalid Request",
      code: rInv.error?.code,
      message: rInv.error?.message,
      valid: rInv.error?.code === -32600,
    });

    // 5. Malformed JSON (-32700)
    tracer.send("{bad json syntax line");
    const rParse = await tracer.waitForMessage((m) => m && m.id === null && m.error);
    steps.push({
      name: "Malformed JSON returns -32700 Parse error",
      id: rParse.id,
      code: rParse.error?.code,
      valid: rParse.id === null && rParse.error?.code === -32700,
    });

    // 6. Throwing notifications silence and non-fatal
    let notifOutput = null;
    const trap = (m) => { notifOutput = m; };
    tracer.on("message", trap);

    tracer.send({ jsonrpc: "2.0", method: "notify_throw_generic" });
    tracer.send({ jsonrpc: "2.0", method: "notify_throw_not_found" });
    await new Promise((r) => setTimeout(r, 60));
    tracer.off("message", trap);

    tracer.send({ jsonrpc: "2.0", id: "post-notif-req", method: "echo", params: { check: "ok" } });
    const rPost = await tracer.waitForMessage((m) => m && m.id === "post-notif-req");

    steps.push({
      name: "Throwing notifications silent and non-fatal",
      silenceObserved: notifOutput === null,
      subsequentRequestResult: rPost.result,
      valid: notifOutput === null && rPost.result?.check === "ok",
    });

    // 7. Schema XOR validation
    const bothCheck = jsonRpcResponseSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
      result: "a",
      error: { code: -32603, message: "b" },
    });
    const neitherCheck = jsonRpcResponseSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
    });
    steps.push({
      name: "jsonRpcResponseSchema XOR enforcement",
      bothRejected: bothCheck.success === false,
      neitherRejected: neitherCheck.success === false,
      valid: bothCheck.success === false && neitherCheck.success === false,
    });

    // 8. Reverse request prompt malformed rejection
    const t0 = Date.now();
    const malformedPromise = tracer.waitForMessage((m) => m && m.id === "origin-malformed");
    tracer.send({
      jsonrpc: "2.0",
      id: "origin-malformed",
      method: "reverse_call",
      params: { method: "test_malformed", params: {}, timeoutMs: 3000 },
    });
    const outMalReq = await tracer.waitForMessage((m) => m && m.method === "test_malformed");
    tracer.send({
      jsonrpc: "2.0",
      id: outMalReq.id,
      result: "conflicted",
      error: { code: -32603, message: "err" },
    });
    const malResp = await malformedPromise;
    const elapsedMal = Date.now() - t0;
    steps.push({
      name: "Reverse request malformed response prompt rejection",
      elapsedMs: elapsedMal,
      errorMsg: malResp.error?.message,
      valid: elapsedMal < 1000 && !!malResp.error,
    });

    // 9. Reverse request timeout cleanup
    const t1 = Date.now();
    const timeoutPromise = tracer.waitForMessage((m) => m && m.id === "origin-timeout");
    tracer.send({
      jsonrpc: "2.0",
      id: "origin-timeout",
      method: "reverse_call",
      params: { method: "test_timeout", params: {}, timeoutMs: 150 },
    });
    const timeoutResp = await timeoutPromise;
    const elapsedTimeout = Date.now() - t1;
    steps.push({
      name: "Reverse request timeout rejection and cleanup",
      elapsedMs: elapsedTimeout,
      errorMsg: timeoutResp.error?.message,
      valid: elapsedTimeout >= 140 && elapsedTimeout < 800 && !!timeoutResp.error,
    });

    // 10. Late and unsolicited response silence
    let unsolicitedEcho = null;
    const unTrap = (m) => { unsolicitedEcho = m; };
    tracer.on("message", unTrap);
    tracer.send({ jsonrpc: "2.0", id: "unsolicited-9999", result: "late data" });
    await new Promise((r) => setTimeout(r, 60));
    tracer.off("message", unTrap);

    tracer.send({ jsonrpc: "2.0", id: "post-unsolicited", method: "echo", params: { ready: true } });
    const rPostUnsolicited = await tracer.waitForMessage((m) => m && m.id === "post-unsolicited");
    steps.push({
      name: "Late & unsolicited response no reflection",
      noReflection: unsolicitedEcho === null,
      serverAlive: rPostUnsolicited.result?.ready === true,
      valid: unsolicitedEcho === null && rPostUnsolicited.result?.ready === true,
    });

    await tracer.close();
    allLogs.push(...tracer.logs);
    journeys.push({
      name: "Adversarial & Error Recovery",
      status: steps.every((s) => s.valid) ? "PASS" : "FAIL",
      steps,
    });
  }

  // Write artifacts
  const logFile = "/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-product-test-r1.log";
  const jsonFile = "/Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/protocol-product-journeys-r1.json";

  const formattedLogs = allLogs
    .map((l) => `[${l.timestamp}] [${l.direction}] ${l.content}`)
    .join("\n");
  writeFileSync(logFile, formattedLogs);

  const journeysSummary = {
    evaluatedAt: new Date().toISOString(),
    candidateCommit: "f3fff38a84154a36f017514c234421aef5215ced",
    candidateSha256: "24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514",
    verdict: journeys.every((j) => j.status === "PASS") ? "PASS" : "FAIL",
    journeys,
  };
  writeFileSync(jsonFile, JSON.stringify(journeysSummary, null, 2));

  console.log("Successfully generated:");
  console.log("-", logFile);
  console.log("-", jsonFile);
  console.log("All Journeys status:", journeysSummary.verdict);
}

main().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
