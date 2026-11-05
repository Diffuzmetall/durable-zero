import test from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import readline from "node:readline";

const DRIVER_PATH = "/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-4b/compiled-candidate/component-driver.mjs";

class JsonRpcDriverClient {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.unpromptedLines = [];
    this.exitPromise = null;
    this.stdoutLines = [];
    this.stderrData = "";
    this.rl = null;
    this.isExited = false;
    this.exitResult = null;
  }

  async start({ readyHandshake = true } = {}) {
    this.proc = spawn("node", [DRIVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.proc.stderr.on("data", (d) => {
      this.stderrData += d.toString();
    });

    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => {
      this.stdoutLines.push(line);
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        this.unpromptedLines.push({ raw: line, error: e.message });
        return;
      }

      if (parsed.id !== undefined && this.pending.has(parsed.id)) {
        const { resolve } = this.pending.get(parsed.id);
        this.pending.delete(parsed.id);
        resolve(parsed);
      } else {
        this.unpromptedLines.push({ parsed, raw: line });
      }
    });

    this.exitPromise = new Promise((resolve) => {
      this.proc.on("exit", (code, signal) => {
        this.isExited = true;
        this.exitResult = { code, signal };
        // Reject all pending requests
        for (const [id, { reject }] of this.pending.entries()) {
          reject(new Error(`Process exited before response for id ${JSON.stringify(id)} (code=${code}, signal=${signal})`));
        }
        this.pending.clear();
        resolve(this.exitResult);
      });
      this.proc.on("error", (err) => {
        for (const [id, { reject }] of this.pending.entries()) {
          reject(err);
        }
        this.pending.clear();
      });
    });

    if (readyHandshake) {
      // Readiness handshake to ensure domain coordinator and signal handlers are attached
      await this.send("fixture/getCalls", {}, "__handshake__");
    }
  }

  async send(method, params, id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) {
    if (!this.proc || this.isExited) throw new Error("Driver process not running");
    const msg = { jsonrpc: "2.0", id, method, params };
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout (2000ms) waiting for response to id: ${JSON.stringify(id)}, method: ${method}`));
      }, 2000);
      this.pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
    });
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
    return p;
  }

  async notify(method, params) {
    if (!this.proc || this.isExited) throw new Error("Driver process not running");
    const msg = { jsonrpc: "2.0", method, params };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
    // Notifications have no response; bounded pause for execution
    await new Promise((r) => setTimeout(r, 40));
  }

  async stop(signal = "SIGTERM") {
    if (!this.proc || this.isExited) return this.exitResult || { code: 0, signal: null };

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    try {
      this.proc.kill(signal);
    } catch (_) {}

    // Bounded wait with SIGKILL fallback
    const killTimer = setTimeout(() => {
      if (!this.isExited && this.proc) {
        try {
          this.proc.kill("SIGKILL");
        } catch (_) {}
      }
    }, 1500);

    const exit = await this.exitPromise;
    clearTimeout(killTimer);
    return exit;
  }

  async closeStdin() {
    if (!this.proc || this.isExited) return this.exitResult || { code: 0, signal: null };
    try {
      this.proc.stdin.end();
    } catch (_) {}

    const killTimer = setTimeout(() => {
      if (!this.isExited && this.proc) {
        try {
          this.proc.kill("SIGKILL");
        } catch (_) {}
      }
    }, 1500);

    const exit = await this.exitPromise;
    clearTimeout(killTimer);
    return exit;
  }
}

// =========================================================================
// JOURNEY 1: Cold Fresh Process and Clean Lifecycle
// =========================================================================

test("J1.1: Cold fresh process emits zero stdout protocol noise before first request", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: false });
    // Bounded check for initial unprompted noise
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(client.stdoutLines.length, 0, "Expected 0 stdout lines before any stdin interaction");
    assert.strictEqual(client.stderrData.length, 0, "Expected empty stderr on clean startup");
  } finally {
    await client.stop();
  }
});

test("J1.2: Initial state contains expected coordinator startup call without user mutations", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: false });
    const res = await client.send("fixture/getCalls", {});
    assert.strictEqual(res.result?.calls?.length, 1, "Expected exactly 1 startup call on fresh boot");
    assert.strictEqual(res.result?.calls?.[0]?.method, "start");
    assert.strictEqual(client.unpromptedLines.length, 0, "No unprompted protocol noise received");
  } finally {
    await client.stop();
  }
});

test("J1.3: Clean bounded shutdown on SIGTERM (exit code 0, no lingering processes)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: true });
    const exit = await client.stop("SIGTERM");
    assert.strictEqual(exit.code, 0, `Expected exit code 0 on SIGTERM, got ${exit.code}`);
    assert.strictEqual(exit.signal, null, "Expected normal exit with code 0 on handled SIGTERM");
  } finally {
    await client.stop();
  }
});

test("J1.4: Clean bounded shutdown on SIGINT (exit code 0, no lingering processes)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: true });
    const exit = await client.stop("SIGINT");
    assert.strictEqual(exit.code, 0, `Expected exit code 0 on SIGINT, got ${exit.code}`);
    assert.strictEqual(exit.signal, null, "Expected normal exit with code 0 on handled SIGINT");
  } finally {
    await client.stop();
  }
});

test("J1.5: Clean bounded shutdown on stdin EOF (exit code 0)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: true });
    const exit = await client.closeStdin();
    assert.strictEqual(exit.code, 0, `Expected exit code 0 on EOF, got ${exit.code}`);
  } finally {
    await client.stop();
  }
});

// =========================================================================
// JOURNEY 2: Happy Path Functional Outcomes & Fixture Observation
// =========================================================================

test("J2.1: session/prompt with string content accepts and records in fixture", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const res = await client.send("session/prompt", { content: "Hello sovereign agent" });
    assert.strictEqual(res.result?.status, "accepted");
    assert.strictEqual(res.result?.id, "fixture_sub_1");
    assert.strictEqual(res.result?.conversationId, "1");

    const callsRes = await client.send("fixture/getCalls", {});
    const promptCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(promptCall, "Expected submit call recorded in engine fixture");
    assert.strictEqual(promptCall.args[0], "Hello sovereign agent");
    assert.deepStrictEqual(promptCall.args[1], { deliverAs: "followUp" });
  } finally {
    await client.stop();
  }
});

test("J2.2: session/prompt with mixed text + image content accepts and records in fixture", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const content = [
      { type: "text", text: "Inspect diagram" },
      { type: "image", data: "aW1nZGF0YQ==", mimeType: "image/png" }
    ];
    const res = await client.send("session/prompt", { content });
    assert.strictEqual(res.result?.status, "accepted");
    assert.strictEqual(res.result?.id, "fixture_sub_1");

    const callsRes = await client.send("fixture/getCalls", {});
    const promptCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(promptCall, "Expected submit call recorded in engine fixture");
    assert.deepStrictEqual(promptCall.args[0], content);
  } finally {
    await client.stop();
  }
});

test("J2.3: session/prompt with image-only content accepts and records in fixture", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const content = [{ type: "image", data: "aW1n", mimeType: "image/jpeg" }];
    const res = await client.send("session/prompt", { content });
    assert.strictEqual(res.result?.status, "accepted");
    assert.strictEqual(res.result?.id, "fixture_sub_1");

    const callsRes = await client.send("fixture/getCalls", {});
    const promptCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(promptCall, "Expected submit call recorded");
    assert.deepStrictEqual(promptCall.args[0], content);
  } finally {
    await client.stop();
  }
});

test("J2.4: session/prompt with child conversationId routes to child session", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const res = await client.send("session/prompt", { content: "Child prompt", conversationId: "child-42" });
    assert.strictEqual(res.result?.status, "accepted");
    assert.strictEqual(res.result?.conversationId, "child-42");

    const callsRes = await client.send("fixture/getCalls", {});
    const promptCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(promptCall);
    assert.strictEqual(promptCall.args[1]?.conversationId, "child-42");
  } finally {
    await client.stop();
  }
});

test("J2.5: session/prompt with deliverAs 'steer' routes correctly", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const res = await client.send("session/prompt", { content: "Urgent steer", deliverAs: "steer" });
    assert.strictEqual(res.result?.status, "accepted");

    const callsRes = await client.send("fixture/getCalls", {});
    const promptCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(promptCall);
    assert.strictEqual(promptCall.args[1]?.deliverAs, "steer");
  } finally {
    await client.stop();
  }
});

test("J2.6: session/steer forces deliverAs 'steer' and accepts child routing", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const res = await client.send("session/steer", { content: "Stop immediately", conversationId: "c-steer" });
    assert.strictEqual(res.result?.status, "accepted");
    assert.strictEqual(res.result?.conversationId, "c-steer");

    const callsRes = await client.send("fixture/getCalls", {});
    const steerCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(steerCall);
    assert.strictEqual(steerCall.args[0], "Stop immediately");
    assert.deepStrictEqual(steerCall.args[1], { conversationId: "c-steer", deliverAs: "steer" });
  } finally {
    await client.stop();
  }
});

test("J2.7: session/followUp forces deliverAs 'followUp'", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});
    const res = await client.send("session/followUp", { content: "Next in pipeline" });
    assert.strictEqual(res.result?.status, "accepted");

    const callsRes = await client.send("fixture/getCalls", {});
    const followCall = callsRes.result?.calls?.find((c) => c.method === "submit");
    assert.ok(followCall);
    assert.strictEqual(followCall.args[0], "Next in pipeline");
    assert.strictEqual(followCall.args[1]?.deliverAs, "followUp");
  } finally {
    await client.stop();
  }
});

test("J2.8: models/list returns available fixture models with contextWindow", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/list", {});
    assert.ok(Array.isArray(res.result?.models), "Expected models array");
    assert.ok(res.result.models.length > 0);
    assert.strictEqual(res.result.models[0].provider, "fixture-provider");
    assert.strictEqual(res.result.models[0].modelId, "fixture-model-v1");
    assert.strictEqual(typeof res.result.models[0].contextWindow, "number");
  } finally {
    await client.stop();
  }
});

test("J2.9: models/set updates active model and records setModel on fixture", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/set", { provider: "fixture-provider", modelId: "fixture-model-v1" });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const setModelCall = callsRes.result?.calls?.find((c) => c.method === "setModel");
    assert.ok(setModelCall, "Expected setModel recorded");
    assert.deepStrictEqual(setModelCall.args[0], { provider: "fixture-provider", modelId: "fixture-model-v1" });
  } finally {
    await client.stop();
  }
});

test("J2.10: models/setThinking accepts all valid levels (off, minimal, low, medium, high, xhigh)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
    for (const level of levels) {
      const res = await client.send("models/setThinking", { level });
      assert.strictEqual(res.result?.ok, true, `Expected ok:true for thinking level ${level}`);
    }

    const callsRes = await client.send("fixture/getCalls", {});
    const thinkingCalls = callsRes.result?.calls?.filter((c) => c.method === "setThinkingLevel");
    assert.strictEqual(thinkingCalls.length, levels.length);
    assert.strictEqual(thinkingCalls[thinkingCalls.length - 1].args[0], "xhigh");
  } finally {
    await client.stop();
  }
});

test("J2.11: subagent/setPolicy in inherit mode updates coordinator policy", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const policyRecord = { version: 1, revision: 1, policy: { mode: "inherit" } };
    const res = await client.send("subagent/setPolicy", { policyRecord });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const policyCall = callsRes.result?.calls?.find((c) => c.method === "setSubagentPolicy");
    assert.ok(policyCall);
    assert.deepStrictEqual(policyCall.args[0], policyRecord);
  } finally {
    await client.stop();
  }
});

test("J2.12: subagent/setPolicy in configured mode with model and thinking level", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const policyRecord = {
      version: 1,
      revision: 2,
      policy: {
        mode: "configured",
        configuredProfile: {
          model: { provider: "anthropic", modelId: "claude-3-5-sonnet" },
          thinkingLevel: "high"
        }
      }
    };
    const res = await client.send("subagent/setPolicy", { policyRecord });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const policyCall = callsRes.result?.calls?.find((c) => c.method === "setSubagentPolicy");
    assert.ok(policyCall);
    assert.deepStrictEqual(policyCall.args[0], policyRecord);
  } finally {
    await client.stop();
  }
});

test("J2.13: session/setSubagentPolicy alias behaves identically to subagent/setPolicy", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const policyRecord = { version: 1, revision: 3, policy: { mode: "inherit" } };
    const res = await client.send("session/setSubagentPolicy", { policyRecord });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const policyCall = callsRes.result?.calls?.find((c) => c.method === "setSubagentPolicy");
    assert.ok(policyCall);
    assert.deepStrictEqual(policyCall.args[0], policyRecord);
  } finally {
    await client.stop();
  }
});

test("J2.14: session/abort for root session invokes engine abort(null)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/abort", {});
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const abortCall = callsRes.result?.calls?.find((c) => c.method === "abort");
    assert.ok(abortCall);
    assert.strictEqual(abortCall.args[0], null);
  } finally {
    await client.stop();
  }
});

test("J2.15: session/abort with conversationId invokes engine abort('c-target')", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/abort", { conversationId: "c-target" });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const abortCall = callsRes.result?.calls?.find((c) => c.method === "abort");
    assert.ok(abortCall);
    assert.strictEqual(abortCall.args[0], "c-target");
  } finally {
    await client.stop();
  }
});

test("J2.16: session/abortTask with positive integer taskId invokes engine abortTask", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/abortTask", { taskId: 42 });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const abortTaskCall = callsRes.result?.calls?.find((c) => c.method === "abortTask");
    assert.ok(abortTaskCall);
    assert.strictEqual(abortTaskCall.args[0], 42);
  } finally {
    await client.stop();
  }
});

test("J2.17: session/compact with instructions invokes engine compact", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/compact", { instructions: "Summarize earlier context" });
    assert.strictEqual(res.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    const compactCall = callsRes.result?.calls?.find((c) => c.method === "compact");
    assert.ok(compactCall);
    assert.strictEqual(compactCall.args[0], "Summarize earlier context");
  } finally {
    await client.stop();
  }
});

test("J2.18: session/getState returns session state DTO (root and child)", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const rootRes = await client.send("session/getState", {});
    assert.ok(rootRes.result?.sessionId);
    assert.strictEqual(rootRes.result?.activeConversationId, "1");

    const childRes = await client.send("session/getState", { conversationId: "child-state" });
    assert.strictEqual(childRes.result?.activeConversationId, "child-state");
  } finally {
    await client.stop();
  }
});

test("J2.19: session/getTranscript returns transcript DTO with limit", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/getTranscript", { limit: 5 });
    assert.strictEqual(res.result?.conversationId, "1");
    assert.ok(Array.isArray(res.result?.entries));

    const callsRes = await client.send("fixture/getCalls", {});
    const transcriptCall = callsRes.result?.calls?.find((c) => c.method === "getTranscript");
    assert.ok(transcriptCall);
    assert.deepStrictEqual(transcriptCall.args, [null, 5]);
  } finally {
    await client.stop();
  }
});

test("J2.20: session/getStats returns contextUsage DTO", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/getStats", {});
    assert.ok(res.result?.contextUsage);
    assert.strictEqual(typeof res.result.contextUsage.tokens, "number");
    assert.strictEqual(typeof res.result.contextUsage.contextWindow, "number");
  } finally {
    await client.stop();
  }
});

test("J2.21: fixture/reset clears recorded call history and resets dynamic counters", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("session/prompt", { content: "one" });
    await client.send("session/prompt", { content: "two" });

    const resetRes = await client.send("fixture/reset", {});
    assert.strictEqual(resetRes.result?.ok, true);

    const callsRes = await client.send("fixture/getCalls", {});
    assert.deepStrictEqual(callsRes.result?.calls, [], "Expected empty calls array after reset");

    const promptAfterReset = await client.send("session/prompt", { content: "fresh" });
    assert.strictEqual(promptAfterReset.result?.id, "fixture_sub_1", "Dynamic counter should reset to fixture_sub_1");
  } finally {
    await client.stop();
  }
});

test("J2.22: Pipelining multiple sequential requests preserves order and reaches fixture", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("fixture/reset", {});

    const promises = [];
    for (let i = 1; i <= 5; i++) {
      promises.push(client.send("session/prompt", { content: `Pipeline ${i}` }, `pipe_${i}`));
    }
    const responses = await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(responses[i].result?.id, `fixture_sub_${i + 1}`);
    }

    const callsRes = await client.send("fixture/getCalls", {});
    const submits = callsRes.result?.calls?.filter((c) => c.method === "submit");
    assert.strictEqual(submits.length, 5);
  } finally {
    await client.stop();
  }
});

// =========================================================================
// JOURNEY 3: Error Recovery & Protocol Edge Cases
// =========================================================================

test("J3.1a: Unknown method returns error with descriptive message", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("nonexistent/method", {});
    assert.ok(res.error, "Expected error object");
    assert.ok(res.error.message.includes("Method not found"), `Expected 'Method not found' in message, got: ${res.error.message}`);
  } finally {
    await client.stop();
  }
});

test("J3.1b: Unknown method conforms to JSON-RPC 2.0 error code -32601", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("nonexistent/method", {});
    assert.strictEqual(res.error?.code, -32601, `Expected JSON-RPC -32601 (Method not found), but received ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.2a: Missing required prompt content returns descriptive error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/prompt", {});
    assert.ok(res.error, "Expected error object");
    assert.ok(res.error.message.includes("content"), `Expected parameter mention in error, got: ${res.error.message}`);
  } finally {
    await client.stop();
  }
});

test("J3.2b: Missing required prompt content conforms to JSON-RPC 2.0 error code -32602", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/prompt", {});
    assert.strictEqual(res.error?.code, -32602, `Expected JSON-RPC -32602 (Invalid params), but received ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.3a: Invalid taskId in session/abortTask returns descriptive error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/abortTask", { taskId: -1 });
    assert.ok(res.error, "Expected error for negative taskId");
    assert.ok(res.error.message.includes("taskId"));
  } finally {
    await client.stop();
  }
});

test("J3.3b: Invalid taskId conforms to JSON-RPC 2.0 error code -32602", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/abortTask", { taskId: -1 });
    assert.strictEqual(res.error?.code, -32602, `Expected JSON-RPC -32602 (Invalid params), but received ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.4a: Invalid thinking level in models/setThinking returns descriptive error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/setThinking", { level: "extreme" });
    assert.ok(res.error, "Expected error for invalid thinking level");
    assert.ok(res.error.message.includes("thinking level"));
  } finally {
    await client.stop();
  }
});

test("J3.4b: Invalid thinking level conforms to JSON-RPC 2.0 error code -32602", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/setThinking", { level: "extreme" });
    assert.strictEqual(res.error?.code, -32602, `Expected JSON-RPC -32602 (Invalid params), but received ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.5a: Invalid deliverAs parameter returns descriptive error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/prompt", { content: "test", deliverAs: "bogus" });
    assert.ok(res.error, "Expected error for invalid deliverAs");
    assert.ok(res.error.message.includes("deliverAs"));
  } finally {
    await client.stop();
  }
});

test("J3.5b: Invalid deliverAs conforms to JSON-RPC 2.0 error code -32602", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/prompt", { content: "test", deliverAs: "bogus" });
    assert.strictEqual(res.error?.code, -32602, `Expected JSON-RPC -32602 (Invalid params), but received ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.6: Malformed JSON returns standard JSON-RPC parse error code -32700", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: true });
    const parseErrorPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for parse error")), 2000);
      client.rl.once("line", (line) => {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      });
    });

    client.proc.stdin.write("{bad json\n");
    const res = await parseErrorPromise;
    assert.strictEqual(res.error?.code, -32700, `Expected -32700 for parse error, got ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.7: Invalid JSON-RPC request structure returns code -32600", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start({ readyHandshake: true });
    const errorPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for invalid request response")), 2000);
      client.rl.once("line", (line) => {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      });
    });

    client.proc.stdin.write(JSON.stringify({ jsonrpc: "1.0", id: "bad_ver", method: "test" }) + "\n");
    const res = await errorPromise;
    assert.strictEqual(res.error?.code, -32600, `Expected -32600 for invalid request, got ${res.error?.code}`);
  } finally {
    await client.stop();
  }
});

test("J3.8: Preserves integer ID 0 exactly in JSON-RPC response", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/list", {}, 0);
    assert.strictEqual(res.id, 0, "Expected response id to be number 0");
  } finally {
    await client.stop();
  }
});

test("J3.9: Preserves empty string ID '' exactly in JSON-RPC response", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("models/list", {}, "");
    assert.strictEqual(res.id, "", "Expected response id to be empty string ''");
  } finally {
    await client.stop();
  }
});

test("J3.10: Valid JSON-RPC notification executes state mutation with zero stdout response", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const initialLineCount = client.stdoutLines.length;
    await client.notify("session/compact", { instructions: "Compact from notification" });
    assert.strictEqual(client.stdoutLines.length, initialLineCount, "Notification must produce zero stdout responses");

    const callsRes = await client.send("fixture/getCalls", {});
    const compactCall = callsRes.result?.calls?.find((c) => c.method === "compact");
    assert.ok(compactCall, "Notification should execute state mutation on fixture");
    assert.strictEqual(compactCall.args[0], "Compact from notification");
  } finally {
    await client.stop();
  }
});

test("J3.11: Erroneous notification (unknown method) produces zero stdout response", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const initialLineCount = client.stdoutLines.length;
    await client.notify("nonexistent/notification", { foo: "bar" });
    assert.strictEqual(client.stdoutLines.length, initialLineCount, "Erroneous notification must produce zero stdout responses");

    const listRes = await client.send("models/list", {});
    assert.ok(listRes.result?.models);
  } finally {
    await client.stop();
  }
});

test("J3.12: Erroneous notification (invalid params) produces zero stdout response", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const initialLineCount = client.stdoutLines.length;
    await client.notify("models/setThinking", { level: "invalid_level" });
    assert.strictEqual(client.stdoutLines.length, initialLineCount, "Erroneous notification must produce zero stdout responses");

    const listRes = await client.send("models/list", {});
    assert.ok(listRes.result?.models);
  } finally {
    await client.stop();
  }
});

test("J3.13: Error does not break server state; subsequent valid request succeeds cleanly", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    await client.send("session/prompt", {}); // triggers error
    await client.send("nonexistent/method", {}); // triggers error

    const validRes = await client.send("session/prompt", { content: "Resilient agent" });
    assert.strictEqual(validRes.result?.status, "accepted");
    assert.strictEqual(validRes.result?.id, "fixture_sub_1");
  } finally {
    await client.stop();
  }
});

test("J3.14: AP-076 Unsupported capability 'binding/register' rejects with explicit missing seam error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("binding/register", { threadId: "thr_123", conversationId: 1 });
    assert.strictEqual(res.result, undefined, "Must NOT return result object or fake success");
    assert.ok(res.error, "Expected explicit error object");
    assert.ok(res.error.message.includes("Capability 'binding/register' is unsupported"), `Unexpected message: ${res.error.message}`);
    assert.ok(res.error.message.includes("Missing seam"), `Missing seam explanation expected, got: ${res.error.message}`);
  } finally {
    await client.stop();
  }
});

test("J3.15: AP-076 Unsupported capability 'binding/list' rejects with explicit missing seam error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("binding/list", {});
    assert.strictEqual(res.result, undefined, "Must NOT return result object or fake success");
    assert.ok(res.error, "Expected explicit error object");
    assert.ok(res.error.message.includes("Capability 'binding/list' is unsupported"));
    assert.ok(res.error.message.includes("Missing seam"));
  } finally {
    await client.stop();
  }
});

test("J3.16: AP-076 Unsupported capability 'session/fork' rejects with explicit missing seam error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("session/fork", { conversationId: "c1" });
    assert.strictEqual(res.result, undefined, "Must NOT return result object or fake success");
    assert.ok(res.error, "Expected explicit error object");
    assert.ok(res.error.message.includes("Capability 'session/fork' is unsupported"));
    assert.ok(res.error.message.includes("Missing seam"));
  } finally {
    await client.stop();
  }
});

test("J3.17: AP-076 Unsupported capability 'tools/register' rejects with explicit missing seam error", async (t) => {
  const client = new JsonRpcDriverClient();
  t.after(async () => { await client.stop(); });
  try {
    await client.start();
    const res = await client.send("tools/register", { name: "custom_tool" });
    assert.strictEqual(res.result, undefined, "Must NOT return result object or fake success");
    assert.ok(res.error, "Expected explicit error object");
    assert.ok(res.error.message.includes("Capability 'tools/register' is unsupported"));
    assert.ok(res.error.message.includes("Missing seam"));
  } finally {
    await client.stop();
  }
});
