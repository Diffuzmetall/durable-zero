import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const trace = process.env.ZERO_MCP_TRACE;
if (trace) appendFileSync(trace, "started\n");

// A real, disposable stdio MCP peer. The production MCP client performs the handshake and calls.
const value = process.argv[2] ?? "MCP_V1";
const startupDelay = Number(process.argv[3] ?? 0);
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (trace) appendFileSync(trace, request.method + "\n");
  if (request.id === undefined) continue;
  let result;
  switch (request.method) {
    case "initialize":
      await new Promise(resolve => setTimeout(resolve, startupDelay));
      result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "zero-probe", version: "1" } };
      break;
    case "ping": result = {}; break;
    case "tools/list":
      result = { tools: [{ name: "zero_probe", description: "Return the isolated MCP server generation", inputSchema: { type: "object", properties: {}, additionalProperties: false } }] };
      break;
    case "tools/call": result = { content: [{ type: "text", text: value }] }; break;
    default:
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unknown method" } }) + "\n");
      continue;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n");
}
