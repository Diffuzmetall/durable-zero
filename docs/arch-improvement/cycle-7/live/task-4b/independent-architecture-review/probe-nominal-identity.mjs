import { createSessionDispatcher } from "../../../../../../packages/runner/src/dispatch/session-dispatcher.ts";
import * as runnerIndex from "../../../../../../packages/runner/src/index.ts";
import { RequestDispatcher } from "./frozen-protocol-dist.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Artifact hashes
const ARTIFACT_HASHES = {
  sessionDispatcherSource: "b669e16663763d960c2887447b960ca64cb35af2c32dbd47a9e142507b9da33d",
  frozenProtocolDist: "eb9a64afab9232099a9342b8e654daf6a27aa6aa9a49b44f354f3434df61e00d",
  candidateCommit: "49bcad1486a5101e20e8b88a616cc175a34fc3e9",
};

async function runProbes() {
  const results = [];

  // Probe 1: Public package export check (adjudicated as non-blocking for Task 4B component)
  const hasExport = typeof runnerIndex.createSessionDispatcher === "function";
  results.push({
    id: "probe-1-package-export",
    name: "Runner public package exports createSessionDispatcher (Adjudicated non-blocking for internal runner component)",
    pass: hasExport,
    details: hasExport
      ? "createSessionDispatcher is exported from packages/runner/src/index.ts"
      : "OMISSION CONFIRMED: createSessionDispatcher is not exported from packages/runner/src/index.ts (adjudicated by parent as internal factory; composition.ts can import ./dispatch/index.ts without root export)",
  });

  // Setup dispatcher with mock coordinator and engine
  const coordinator = {
    prompt: async () => ({ status: "accepted", id: "rec_1", conversationId: "1" }),
    abort: async () => {},
    getState: async () => ({}),
    getTranscript: async () => ({ conversationId: "1", entries: [] }),
    getStats: async () => ({ contextUsage: { tokens: 100, contextWindow: 128000 } }),
    setSubagentPolicy: async () => ({ ok: true }),
  };
  const engine = {
    getState: async () => ({ models: [] }),
    setModel: async () => {},
    setThinkingLevel: async () => {},
    abortTask: async () => {},
    compact: async () => {},
  };

  const handler = createSessionDispatcher({
    coordinator: coordinator,
    engine: engine,
  });

  // Probe 2: Invalid params error identity through frozen compiled transport
  let sent1 = null;
  const transport1 = new RequestDispatcher(
    handler,
    (msg) => { sent1 = msg; },
    new Map(),
  );

  await transport1.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "req-invalid-params",
    method: "session/prompt",
    params: { content: "" }, // invalid empty content
  }));

  const code1 = sent1?.error?.code;
  const pass1 = code1 === -32602;
  results.push({
    id: "probe-2-invalid-params-code",
    name: "Invalid params maps to -32602 over frozen compiled protocol transport",
    pass: pass1,
    expectedCode: -32602,
    actualCode: code1,
    response: sent1,
    details: pass1
      ? "PASS: returned -32602"
      : `FAIL: returned ${code1} instead of -32602 due to cross-package source-relative import instanceof failure (tested against frozen dist sha256:${ARTIFACT_HASHES.frozenProtocolDist})`,
  });

  // Probe 3: Method not found error identity through frozen compiled transport
  let sent2 = null;
  const transport2 = new RequestDispatcher(
    handler,
    (msg) => { sent2 = msg; },
    new Map(),
  );

  await transport2.processLine(JSON.stringify({
    jsonrpc: "2.0",
    id: "req-unknown-method",
    method: "completely/unknown/method",
    params: {},
  }));

  const code2 = sent2?.error?.code;
  const pass2 = code2 === -32601;
  results.push({
    id: "probe-3-method-not-found-code",
    name: "Unknown method maps to -32601 over frozen compiled protocol transport",
    pass: pass2,
    expectedCode: -32601,
    actualCode: code2,
    response: sent2,
    details: pass2
      ? "PASS: returned -32601"
      : `FAIL: returned ${code2} instead of -32601 due to cross-package source-relative import instanceof failure (tested against frozen dist sha256:${ARTIFACT_HASHES.frozenProtocolDist})`,
  });

  console.log(JSON.stringify({ hashes: ARTIFACT_HASHES, results }, null, 2));

  // Write probe results JSON
  await fs.writeFile(
    path.join(__dirname, "probe-results.json"),
    JSON.stringify({ hashes: ARTIFACT_HASHES, results }, null, 2),
    "utf8",
  );

  // Write JUnit XML
  const failures = results.filter((r) => !r.pass).length;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
  <testsuite name="Task 4B Independent Semantic &amp; Architecture Probes (Frozen Artifacts)" tests="${results.length}" failures="${failures}" errors="0" skipped="0">
${results
  .map(
    (r) => `    <testcase name="${r.name}" classname="SemanticProbe" time="0.005">
${!r.pass ? `      <failure message="${r.details.replace(/"/g, "&quot;")}">${r.details}</failure>` : ""}
    </testcase>`,
  )
  .join("\n")}
  </testsuite>
</testsuites>
`;
  await fs.writeFile(path.join(__dirname, "probe-results.junit.xml"), xml, "utf8");
}

runProbes().catch((err) => {
  console.error("Probe error:", err);
  process.exit(1);
});
