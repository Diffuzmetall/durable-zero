import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import {
  jsonRpcRequestSchema,
  jsonRpcResponseSchema,
  StdioJsonRpcServer,
  type ITransportStrategy,
} from "../src/index.ts";

describe("@durable-zero/protocol Full-Duplex Server", () => {
  it("validates JSON-RPC 2.0 request envelope strictly", () => {
    const valid = jsonRpcRequestSchema.safeParse({
      jsonrpc: "2.0",
      id: "req_1",
      method: "session/prompt",
      params: { content: "hello" },
    });
    assert.equal(valid.success, true);

    const invalid = jsonRpcRequestSchema.safeParse({
      id: "req_1",
      method: "session/prompt",
    });
    assert.equal(invalid.success, false);
  });

  it("processes inbound client requests and responds with JSON-RPC 2.0 result", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, enc, cb) {
        outputBuffer += chunk.toString();
        cb();
      },
    });

    const server = new StdioJsonRpcServer({
      stdin: input,
      stdout: output,
      handler: async (method, params) => {
        if (method === "session/prompt") return { status: "accepted", prompt: params.content };
        throw new Error(`Unknown method: ${method}`);
      },
    });
    server.start();

    input.push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "session/prompt",
        params: { content: "test" },
      }) + "\n",
    );
    await new Promise((r) => setTimeout(r, 50));

    const response = JSON.parse(outputBuffer.trim());
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, 1);
    assert.deepEqual(response.result, { status: "accepted", prompt: "test" });
    server.stop();
  });

  it("supports outbound requests to client (host/toolCall) and resolves on response", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, enc, cb) {
        outputBuffer += chunk.toString();
        cb();
      },
    });

    const server = new StdioJsonRpcServer({ stdin: input, stdout: output, handler: async () => ({}) });
    server.start();

    const requestPromise = server.request("host/toolCall", { toolName: "ask_user", question: "continue?" });
    await new Promise((r) => setTimeout(r, 20));

    const sentRequest = JSON.parse(outputBuffer.trim());
    assert.equal(sentRequest.method, "host/toolCall");
    assert.ok(sentRequest.id);

    input.push(JSON.stringify({ jsonrpc: "2.0", id: sentRequest.id, result: { answer: "yes" } }) + "\n");
    const result = await requestPromise;
    assert.deepEqual(result, { answer: "yes" });
    server.stop();
  });

  it("fails fast and rejects pending request when client responds with malformed JSON-RPC", async () => {
    const input = new Readable({ read() {} });
    let outputBuffer = "";
    const output = new Writable({
      write(chunk, enc, cb) {
        outputBuffer += chunk.toString();
        cb();
      },
    });

    const server = new StdioJsonRpcServer({ stdin: input, stdout: output, handler: async () => ({}) });
    server.start();

    const requestPromise = server.request("host/toolCall", { toolName: "ask_user" });
    await new Promise((r) => setTimeout(r, 20));

    const sentRequest = JSON.parse(outputBuffer.trim());
    assert.ok(sentRequest.id);

    // Malformed JSON-RPC: jsonrpc is "1.0" instead of "2.0"
    input.push(JSON.stringify({ jsonrpc: "1.0", id: sentRequest.id, result: { answer: "invalid" } }) + "\n");

    await assert.rejects(
      requestPromise,
      /Malformed JSON-RPC response from client:/,
    );
    server.stop();
  });
});
