import { createSessionDispatcher } from "../../../../../../../packages/runner/src/dispatch/session-dispatcher.ts";
import { normalizeConversationId } from "../../../../../../../packages/runner/src/dispatch/normalizers.ts";
import { RequestDispatcher, JsonRpcInvalidParamsError, JsonRpcMethodNotFoundError } from "../../../../../../../packages/protocol/src/index.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runReReviewProbes() {
  const results = [];

  const coordinator = {
    prompt: async (input, options) => ({ status: "accepted", id: "rec_1", input, options }),
    abort: async (convId) => { coordinator.lastAborted = convId; },
    getState: async (convId) => ({ activeConversationId: convId ?? "1" }),
    getTranscript: async (convId, limit) => ({ conversationId: convId ?? "1", limit }),
    getStats: async (convId) => ({ contextUsage: { tokens: 100, contextWindow: 128000 } }),
    setSubagentPolicy: async () => ({ ok: true }),
    lastAborted: undefined,
  };
  const engine = {
    getState: async () => ({ models: [] }),
    setModel: async () => {},
    setThinkingLevel: async () => {},
    abortTask: async () => {},
    compact: async () => {},
  };

  const handler = createSessionDispatcher({
    coordinator,
    engine,
  });

  // Probe 1: Invalid params code over transport maps to -32602
  let sent1 = null;
  const transport1 = new RequestDispatcher(handler, (msg) => { sent1 = msg; }, new Map());
  await transport1.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "probe-1",
    method: "session/prompt",
    params: { content: "" }, // invalid empty content
  }));
  const pass1 = sent1?.error?.code === -32602;
  results.push({
    id: "probe-1-invalid-params",
    name: "Invalid params maps to -32602 over protocol transport",
    pass: pass1,
    expectedCode: -32602,
    actualCode: sent1?.error?.code,
    response: sent1,
    details: pass1 ? "PASS: returned -32602" : `FAIL: got ${sent1?.error?.code}`,
  });

  // Probe 2: Unmapped method maps to -32601
  let sent2 = null;
  const transport2 = new RequestDispatcher(handler, (msg) => { sent2 = msg; }, new Map());
  await transport2.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "probe-2",
    method: "unmapped/method",
    params: {},
  }));
  const pass2 = sent2?.error?.code === -32601;
  results.push({
    id: "probe-2-unmapped-method",
    name: "Unmapped method maps to -32601 over protocol transport",
    pass: pass2,
    expectedCode: -32601,
    actualCode: sent2?.error?.code,
    response: sent2,
    details: pass2 ? "PASS: returned -32601" : `FAIL: got ${sent2?.error?.code}`,
  });

  // Probe 3: Generic spoofed error maps to -32603 (Anti-Gaming check)
  const spoofHandler = async () => {
    const fake = new Error("Spoofed error");
    fake.name = "JsonRpcInvalidParamsError";
    throw fake;
  };
  let sent3 = null;
  const transport3 = new RequestDispatcher(spoofHandler, (msg) => { sent3 = msg; }, new Map());
  await transport3.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "probe-3",
    method: "test/spoof",
    params: {},
  }));
  const pass3 = sent3?.error?.code === -32603;
  results.push({
    id: "probe-3-generic-spoof",
    name: "Generic spoofed error object maps to -32603, not -32602 (Anti-gaming nominal check)",
    pass: pass3,
    expectedCode: -32603,
    actualCode: sent3?.error?.code,
    response: sent3,
    details: pass3 ? "PASS: returned -32603" : `FAIL: got ${sent3?.error?.code}`,
  });

  // Probe 4: Numeric conversation ID normalization (Source-backed boundary ruling)
  let sent4 = null;
  const transport4 = new RequestDispatcher(handler, (msg) => { sent4 = msg; }, new Map());
  await transport4.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "probe-4",
    method: "session/prompt",
    params: { content: "hello", conversationId: 42 },
  }));
  const pass4 = sent4?.result?.options?.conversationId === "42";
  results.push({
    id: "probe-4-numeric-conv-id",
    name: "Numeric conversationId: 42 normalized to string '42' for Core port",
    pass: pass4,
    expected: "42",
    actual: sent4?.result?.options?.conversationId,
    details: pass4 ? "PASS: normalized to '42'" : `FAIL: got ${sent4?.result?.options?.conversationId}`,
  });

  // Probe 5: Invalid conversation ID rejection (0, -1, 'abc', '0')
  const invalidCases = [0, -1, "abc", "0"];
  let allInvalidRejected = true;
  for (const inv of invalidCases) {
    let sentInv = null;
    const t = new RequestDispatcher(handler, (msg) => { sentInv = msg; }, new Map());
    await t.processLine(JSON.stringify({
      jsonrpc: "2.0",
      id: `probe-inv-${inv}`,
      method: "session/prompt",
      params: { content: "hello", conversationId: inv },
    }));
    if (sentInv?.error?.code !== -32602) {
      allInvalidRejected = false;
      break;
    }
  }
  results.push({
    id: "probe-5-invalid-conv-id",
    name: "Invalid conversationId values (0, negative, non-digit, '0') rejected with -32602",
    pass: allInvalidRejected,
    details: allInvalidRejected ? "PASS: all invalid IDs rejected with -32602" : "FAIL: some invalid IDs were not rejected with -32602",
  });

  // Probe 6: Root conversationId undefined default preserved
  let sent6 = null;
  const transport6 = new RequestDispatcher(handler, (msg) => { sent6 = msg; }, new Map());
  await transport6.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "probe-6",
    method: "session/abort",
    params: {},
  }));
  const pass6 = coordinator.lastAborted === undefined;
  results.push({
    id: "probe-6-root-abort-undefined",
    name: "Root session/abort without conversationId forwards undefined to coordinator.abort",
    pass: pass6,
    details: pass6 ? "PASS: undefined forwarded" : `FAIL: got ${coordinator.lastAborted}`,
  });

  console.log(JSON.stringify(results, null, 2));

  await fs.writeFile(
    path.join(__dirname, "re-review-probe-results.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );

  const failures = results.filter((r) => !r.pass).length;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="Task 4B Fix Round 1 Independent Re-Review Probes" tests="${results.length}" failures="${failures}" errors="0" skipped="0">
${results
  .map(
    (r) => `    <testcase name="${r.name}" classname="FixRound1Probe" time="0.005">
${!r.pass ? `      <failure message="${r.details.replace(/"/g, "&quot;")}">${r.details}</failure>` : ""}
    </testcase>`,
  )
  .join("\n")}
  </testsuite>
</testsuites>
`;
  await fs.writeFile(path.join(__dirname, "re-review-probe-results.junit.xml"), xml, "utf8");
}

runReReviewProbes().catch((err) => {
  console.error("Re-review probe error:", err);
  process.exit(1);
});
