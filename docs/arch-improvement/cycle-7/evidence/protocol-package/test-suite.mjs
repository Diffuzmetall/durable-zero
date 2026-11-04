import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { jsonRpcResponseSchema, JsonRpcMethodNotFoundError, StdioJsonRpcServer } from "@durable-zero/protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = join(__dirname, "test-consumer-server.mjs");

class ProcessClient extends EventEmitter {
  constructor() {
    super();
    this.child = spawn("node", [SERVER_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: __dirname,
    });
    this.lines = [];
    this.logs = [];

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => {
      this.logs.push({ dir: "RECV", line, time: Date.now() });
      try {
        const parsed = JSON.parse(line);
        this.emit("message", parsed);
      } catch (err) {
        this.emit("raw_line", line);
      }
    });

    this.child.stderr.on("data", (d) => {
      this.logs.push({ dir: "STDERR", text: d.toString(), time: Date.now() });
    });

    this.child.on("exit", (code, signal) => {
      this.emit("exit", { code, signal });
    });
  }

  send(obj) {
    const raw = typeof obj === "string" ? obj : JSON.stringify(obj);
    this.logs.push({ dir: "SEND", line: raw, time: Date.now() });
    this.child.stdin.write(raw + "\n");
  }

  async waitForMessage(predicate, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout (${timeoutMs}ms) waiting for message matching predicate`));
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

  async sendRequest(method, params, id = String(Date.now())) {
    const p = this.waitForMessage((m) => m && m.id === id);
    this.send({ jsonrpc: "2.0", id, method, params });
    return await p;
  }

  async close() {
    if (this.child.killed || this.child.exitCode !== null) return;
    this.send({ jsonrpc: "2.0", id: "close-req", method: "shutdown" });
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

test("Journey 1: Happy Path (Functional Outcome Invariant)", async (t) => {
  const client = new ProcessClient();
  t.after(async () => {
    await client.close();
  });

  await t.test("Request with wire ID 0 preserves numeric 0 and returns expected result", async () => {
    const req = { jsonrpc: "2.0", id: 0, method: "echo", params: { greeting: "hello-zero" } };
    const p = client.waitForMessage((m) => m && m.id === 0);
    client.send(req);
    const resp = await p;

    assert.equal(resp.id, 0);
    assert.strictEqual(typeof resp.id, "number");
    assert.deepEqual(resp.result, { greeting: "hello-zero" });
    const parsed = jsonRpcResponseSchema.safeParse(resp);
    assert.equal(parsed.success, true);
  });

  await t.test("Request with empty string wire ID '' preserves string and returns expected result", async () => {
    const req = { jsonrpc: "2.0", id: "", method: "echo", params: { greeting: "hello-empty-id" } };
    const p = client.waitForMessage((m) => m && m.id === "");
    client.send(req);
    const resp = await p;

    assert.equal(resp.id, "");
    assert.strictEqual(typeof resp.id, "string");
    assert.deepEqual(resp.result, { greeting: "hello-empty-id" });
    const parsed = jsonRpcResponseSchema.safeParse(resp);
    assert.equal(parsed.success, true);
  });

  await t.test("Notification execution & silence: notification changes state with ZERO response bytes", async () => {
    // 1. Check initial state
    const beforeResp = await client.sendRequest("get_state", {}, "check-before");
    assert.equal(beforeResp.result.counter, 0);

    // 2. Attach a trap for any message emitted immediately after notification
    let unexpectedMessage = null;
    const msgTrap = (m) => {
      // If any message arrives that isn't from an explicit request
      unexpectedMessage = m;
    };
    client.on("message", msgTrap);

    // 3. Send notification
    client.send({ jsonrpc: "2.0", method: "notify_increment", params: { amount: 15 } });

    // Wait a bounded short window to ensure no response was written
    await new Promise((r) => setTimeout(r, 60));
    client.off("message", msgTrap);
    assert.equal(unexpectedMessage, null, "Notification must be completely silent on stdout");

    // 4. Verify functional outcome: subsequent query confirms state change occurred
    const afterResp = await client.sendRequest("get_state", {}, "check-after");
    assert.equal(afterResp.result.counter, 15, "Counter must reflect notification execution");
  });

  await t.test("Outgoing reverse request: bidirectional wire ID echo and usable resolved result", async () => {
    // Client asks consumer to make a reverse call to client
    const revPromise = client.sendRequest(
      "reverse_call",
      { method: "compute_hash", params: { input: "abc" }, timeoutMs: 2000 },
      "req-rev-origin"
    );

    // Intercept consumer's outgoing reverse request
    const outgoingReq = await client.waitForMessage(
      (m) => m && m.method === "compute_hash" && typeof m.id !== "undefined"
    );

    assert.ok(outgoingReq.id, "Outgoing reverse request must have a wire ID");
    assert.deepEqual(outgoingReq.params, { input: "abc" });

    // Client sends back response echoing wire ID
    client.send({
      jsonrpc: "2.0",
      id: outgoingReq.id,
      result: { hash: "sha256-mock-123" },
    });

    // Consumer's server.request resolves and completes the original request
    const originResp = await revPromise;
    assert.equal(originResp.id, "req-rev-origin");
    assert.deepEqual(originResp.result, { hash: "sha256-mock-123" });
    assert.equal(jsonRpcResponseSchema.safeParse(originResp).success, true);
  });

  await t.test("Falsy values and void->null success mapping", async () => {
    // Numeric 0
    const zeroResp = await client.sendRequest("falsy_zero", {}, "zero-test");
    assert.strictEqual(zeroResp.result, 0);
    assert.equal(jsonRpcResponseSchema.safeParse(zeroResp).success, true);

    // Boolean false
    const falseResp = await client.sendRequest("falsy_false", {}, "false-test");
    assert.strictEqual(falseResp.result, false);
    assert.equal(jsonRpcResponseSchema.safeParse(falseResp).success, true);

    // Empty string
    const emptyResp = await client.sendRequest("falsy_empty_str", {}, "empty-test");
    assert.strictEqual(emptyResp.result, "");
    assert.equal(jsonRpcResponseSchema.safeParse(emptyResp).success, true);

    // Explicit null
    const nullResp = await client.sendRequest("falsy_null", {}, "null-test");
    assert.strictEqual(nullResp.result, null);
    assert.equal(jsonRpcResponseSchema.safeParse(nullResp).success, true);

    // Void / undefined return -> mapped to null
    const voidResp = await client.sendRequest("void_return", {}, "void-test");
    assert.strictEqual(voidResp.result, null);
    assert.equal(jsonRpcResponseSchema.safeParse(voidResp).success, true);
  });
});

test("Journey 2: Cold Start & Clean Lifecycle", async (t) => {
  await t.test("Fresh consumer process initializes with zero state and handles requests immediately", async () => {
    const client = new ProcessClient();
    try {
      const stateResp = await client.sendRequest("get_state", {}, "init-query");
      assert.deepEqual(stateResp.result, { counter: 0, logsCount: 0 });
    } finally {
      await client.close();
    }
  });

  await t.test("Clean shutdown aborts hanging in-flight requests and exits with code 0", async () => {
    const client = new ProcessClient();

    // Start a reverse request that would wait 10 seconds for client response
    client.send({
      jsonrpc: "2.0",
      id: "hanging-req",
      method: "reverse_call",
      params: { method: "long_pending", params: {}, timeoutMs: 10000 },
    });

    // Wait for the server to emit its reverse request
    await client.waitForMessage((m) => m && m.method === "long_pending");

    // Send shutdown request to close the server
    const shutdownPromise = client.waitForMessage((m) => m && m.id === "shutdown-req");
    client.send({ jsonrpc: "2.0", id: "shutdown-req", method: "shutdown" });
    const shutdownResp = await shutdownPromise;
    assert.equal(shutdownResp.result, "shutting_down");

    // The consumer process should exit cleanly with code 0
    const exitData = await new Promise((resolve) => {
      client.on("exit", resolve);
    });
    assert.equal(exitData.code, 0);
  });
});

test("Journey 3: Adversarial / Error Recovery & Classification", async (t) => {
  const client = new ProcessClient();
  t.after(async () => {
    await client.close();
  });

  await t.test("Explicit typed missing-method error is classified as -32601", async () => {
    // Unregistered method
    const unregResp = await client.sendRequest("nonexistent_rpc_method", {}, "unreg-test");
    assert.equal(unregResp.id, "unreg-test");
    assert.ok(unregResp.error, "Must contain error envelope");
    assert.equal(unregResp.error.code, -32601);
    assert.match(unregResp.error.message, /Method not found/i);
    assert.equal(jsonRpcResponseSchema.safeParse(unregResp).success, true);

    // Handler explicitly throwing JsonRpcMethodNotFoundError
    const thrownNotFoundResp = await client.sendRequest(
      "throw_not_found",
      { methodName: "special_service" },
      "notfound-test"
    );
    assert.equal(thrownNotFoundResp.error.code, -32601);
    assert.match(thrownNotFoundResp.error.message, /Method not found: special_service/i);
    assert.equal(jsonRpcResponseSchema.safeParse(thrownNotFoundResp).success, true);
  });

  await t.test("Generic handler failure is classified as -32603 (distinct from -32601)", async () => {
    const genericResp = await client.sendRequest(
      "throw_generic",
      { message: "Fatal database connection dropped" },
      "generic-test"
    );
    assert.equal(genericResp.id, "generic-test");
    assert.ok(genericResp.error, "Must contain error envelope");
    assert.equal(genericResp.error.code, -32603);
    assert.equal(genericResp.error.message, "Fatal database connection dropped");
    assert.equal(jsonRpcResponseSchema.safeParse(genericResp).success, true);
  });

  await t.test("Generic error with name reassigned to JsonRpcMethodNotFoundError remains -32603 (not misclassified as -32601)", async () => {
    const namedResp = await client.sendRequest(
      "throw_generic_named_nf",
      { message: "backend fault" },
      "named-generic-test"
    );
    assert.equal(namedResp.id, "named-generic-test");
    assert.ok(namedResp.error, "Must contain error envelope");
    assert.equal(
      namedResp.error.code,
      -32603,
      `Expected -32603 Internal Error for generic Error, but got ${namedResp.error.code}`
    );
  });

  await t.test("Invalid Request returns -32600", async () => {
    // Missing method
    const p1 = client.waitForMessage((m) => m && m.id === "inv-1");
    client.send({ jsonrpc: "2.0", id: "inv-1" });
    const resp1 = await p1;
    assert.equal(resp1.error.code, -32600);
    assert.match(resp1.error.message, /Invalid Request/i);

    // Invalid jsonrpc version
    const p2 = client.waitForMessage((m) => m && m.id === "inv-2");
    client.send({ jsonrpc: "1.0", id: "inv-2", method: "echo" });
    const resp2 = await p2;
    assert.equal(resp2.error.code, -32600);
  });

  await t.test("Malformed JSON returns -32700 with null id", async () => {
    const p = client.waitForMessage((m) => m && m.id === null && m.error);
    client.send("{bad json syntax definitely not valid");
    const resp = await p;
    assert.equal(resp.id, null);
    assert.equal(resp.error.code, -32700);
    assert.match(resp.error.message, /Parse error/i);
    assert.equal(jsonRpcResponseSchema.safeParse(resp).success, true);
  });

  await t.test("Throwing notification remains response-silent without crashing or blocking subsequent requests", async () => {
    let emittedMsg = null;
    const msgTrap = (m) => {
      emittedMsg = m;
    };
    client.on("message", msgTrap);

    // Send notifications that throw
    client.send({ jsonrpc: "2.0", method: "notify_throw_generic" });
    client.send({ jsonrpc: "2.0", method: "notify_throw_not_found" });
    client.send({ jsonrpc: "2.0", method: "totally_unregistered_notification" });

    // Ensure bounded wait sees NO response emitted
    await new Promise((r) => setTimeout(r, 60));
    client.off("message", msgTrap);
    assert.equal(emittedMsg, null, "Throwing notifications must remain completely silent");

    // Subsequent normal request succeeds without being blocked
    const postResp = await client.sendRequest("echo", { alive: true }, "alive-test");
    assert.deepEqual(postResp.result, { alive: true });
  });

  await t.test("jsonRpcResponseSchema XOR enforcement: rejects both/neither result/error", () => {
    // Both result and error
    const both = jsonRpcResponseSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
      result: "foo",
      error: { code: -32603, message: "err" },
    });
    assert.equal(both.success, false);
    assert.match(both.error.issues[0].message, /both 'result' and 'error'/);

    // Neither result nor error
    const neither = jsonRpcResponseSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
    });
    assert.equal(neither.success, false);
    assert.match(neither.error.issues[0].message, /either 'result' or 'error'/);

    // Valid result
    assert.equal(jsonRpcResponseSchema.safeParse({ jsonrpc: "2.0", id: 1, result: null }).success, true);
    assert.equal(jsonRpcResponseSchema.safeParse({ jsonrpc: "2.0", id: 1, result: false }).success, true);
    assert.equal(jsonRpcResponseSchema.safeParse({ jsonrpc: "2.0", id: 1, result: 0 }).success, true);

    // Valid error
    assert.equal(
      jsonRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "not found" },
      }).success,
      true
    );
  });

  await t.test("Reverse request: error response from client rejects reverse_call promptly", async () => {
    const revPromise = client.sendRequest(
      "reverse_call",
      { method: "failing_host_op", params: {}, timeoutMs: 2000 },
      "rev-err-test"
    );

    const outReq = await client.waitForMessage((m) => m && m.method === "failing_host_op");
    client.send({
      jsonrpc: "2.0",
      id: outReq.id,
      error: { code: -32001, message: "Host operation denied" },
    });

    const originResp = await revPromise;
    assert.equal(originResp.id, "rev-err-test");
    assert.ok(originResp.error);
    assert.equal(originResp.error.code, -32603);
    assert.match(originResp.error.message, /Host operation denied/);
  });

  await t.test("Reverse request: malformed client response rejects promptly without waiting for timeout", async () => {
    const t0 = Date.now();
    const revPromise = client.sendRequest(
      "reverse_call",
      { method: "malformed_test", params: {}, timeoutMs: 3000 },
      "rev-malformed-test"
    );

    const outReq = await client.waitForMessage((m) => m && m.method === "malformed_test");

    // Send malformed response (both result and error)
    client.send({
      jsonrpc: "2.0",
      id: outReq.id,
      result: "conflicted",
      error: { code: -32600, message: "bad" },
    });

    const originResp = await revPromise;
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1000, `Must reject promptly (took ${elapsed}ms, timeout was 3000ms)`);
    assert.ok(originResp.error);
    assert.match(originResp.error.message, /Malformed JSON-RPC response/);
  });

  await t.test("Reverse request: timeout cleans up pending timer and rejects", async () => {
    const t0 = Date.now();
    const originResp = await client.sendRequest(
      "reverse_call",
      { method: "unanswered_test", params: {}, timeoutMs: 150 },
      "rev-timeout-test"
    );

    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 140 && elapsed < 800, `Timed out in expected window (${elapsed}ms)`);
    assert.ok(originResp.error);
    assert.match(originResp.error.message, /timed out after 150ms/);
  });

  await t.test("Late response and unsolicited response do not reflect or crash server", async () => {
    let reflected = null;
    const trap = (m) => {
      reflected = m;
    };
    client.on("message", trap);

    // Send unsolicited response with random ID
    client.send({ jsonrpc: "2.0", id: "random-unsolicited-id-999", result: "nobody asked" });

    // Send unsolicited response with null ID
    client.send({ jsonrpc: "2.0", id: null, result: "nobody asked either" });

    await new Promise((r) => setTimeout(r, 60));
    client.off("message", trap);
    assert.equal(reflected, null, "Unsolicited responses must not cause reflection");

    // Server still operational
    const aliveResp = await client.sendRequest("echo", { text: "still-alive" }, "alive-after-unsolicited");
    assert.deepEqual(aliveResp.result, { text: "still-alive" });
  });
});
