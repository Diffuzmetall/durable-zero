import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import {
  jsonRpcResponseSchema,
  JsonRpcMethodNotFoundError,
  StdioJsonRpcServer,
} from "../src/index.ts";

function createHarness(
  handler: (method: string, params: Record<string, unknown>) => Promise<unknown>,
) {
  const input = new Readable({ read() {} });
  let outputBuffer = "";
  const output = new Writable({
    write(chunk, _enc, cb) {
      outputBuffer += chunk.toString();
      cb();
    },
  });

  const server = new StdioJsonRpcServer({
    stdin: input,
    stdout: output,
    handler,
  });
  server.start();

  return {
    input,
    server,
    getLines: () =>
      outputBuffer
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    getRawOutput: () => outputBuffer,
    clearOutput: () => {
      outputBuffer = "";
    },
  };
}

describe("JSON-RPC 2.0 Protocol Conformance", () => {
  describe("Defect 1: Inbound Notifications", () => {
    it("invokes handler for valid notification and emits no response", async () => {
      let handledMethod = "";
      let handledParams: Record<string, unknown> = {};

      const harness = createHarness(async (method, params) => {
        handledMethod = method;
        handledParams = params;
        return { ok: true };
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notify/update",
          params: { step: 1 },
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(handledMethod, "notify/update");
      assert.deepEqual(handledParams, { step: 1 });
      assert.equal(harness.getLines().length, 0, "Server must not reply to notifications");
      harness.server.stop();
    });

    it("invokes handler for notification and emits no response even if handler rejects", async () => {
      let handlerCalled = false;
      const harness = createHarness(async () => {
        handlerCalled = true;
        throw new Error("handler failure inside notification");
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "notify/fail",
          params: { key: "val" },
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(handlerCalled, true);
      assert.equal(harness.getLines().length, 0, "Server must not reply even on failure");
      harness.server.stop();
    });

    it("preserves request with numeric id 0 as request and responds", async () => {
      const harness = createHarness(async (_method, params) => ({ echo: params.x }));

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          method: "test/zero",
          params: { x: "value_zero" },
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, 0);
      assert.deepEqual(parsed.result, { echo: "value_zero" });
      harness.server.stop();
    });

    it("preserves request with empty string id as request and responds", async () => {
      const harness = createHarness(async () => "empty_id_result");

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "",
          method: "test/empty",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "");
      assert.equal(parsed.result, "empty_id_result");
      harness.server.stop();
    });

    it("does not classify an object with an id field as an ID-less notification", async () => {
      let handlerCalled = false;
      const harness = createHarness(async () => {
        handlerCalled = true;
        return "ok";
      });

      // id: null is present, so it has an id field but is an invalid request id for our schema
      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          method: "test/nullId",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(handlerCalled, false, "Handler must not be invoked for invalid request");
      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, null);
      assert.equal(parsed.error?.code, -32600);
      harness.server.stop();
    });
  });

  describe("Defect 2: Typed Method Not Found Error Mapping", () => {
    it("maps JsonRpcMethodNotFoundError to -32601 error response", async () => {
      const harness = createHarness(async (method) => {
        throw new JsonRpcMethodNotFoundError(method);
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_notfound",
          method: "missing/method",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "req_notfound");
      assert.equal(
        parsed.error?.code,
        -32601,
        "Explicit JsonRpcMethodNotFoundError must map to code -32601",
      );
      assert.equal(parsed.error?.message, "Method not found: missing/method");
      harness.server.stop();
    });

    it("maps generic errors to -32603 internal error response", async () => {
      const harness = createHarness(async () => {
        throw new Error("generic error");
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_err",
          method: "boom",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "req_err");
      assert.equal(parsed.error?.code, -32603);
      assert.equal(parsed.error?.message, "generic error");
      harness.server.stop();
    });

    it("maps renamed ordinary Error to -32603 internal error response, not -32601", async () => {
      const harness = createHarness(async () => {
        const err = new Error("backend fault");
        err.name = "JsonRpcMethodNotFoundError";
        throw err;
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_renamed",
          method: "faulty/method",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "req_renamed");
      assert.equal(
        parsed.error?.code,
        -32603,
        "Renamed ordinary Error must not be reclassified as -32601",
      );
      assert.equal(parsed.error?.message, "backend fault");
      harness.server.stop();
    });

    it("maps legitimate subclass of JsonRpcMethodNotFoundError to -32601", async () => {
      class CustomMethodNotFoundError extends JsonRpcMethodNotFoundError {}

      const harness = createHarness(async (method) => {
        throw new CustomMethodNotFoundError(method);
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_subclass",
          method: "subclass/method",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "req_subclass");
      assert.equal(
        parsed.error?.code,
        -32601,
        "Subclass of JsonRpcMethodNotFoundError must map to -32601",
      );
      assert.equal(parsed.error?.message, "Method not found: subclass/method");
      harness.server.stop();
    });

    it("preserves -32700 for malformed JSON text", async () => {
      const harness = createHarness(async () => "ok");

      harness.input.push("{\"jsonrpc\": \"2.0\", id: unquoted}\n");

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, null);
      assert.equal(parsed.error?.code, -32700);
      assert.equal(parsed.error?.message, "Parse error");
      harness.server.stop();
    });

    it("preserves -32600 for invalid request payload", async () => {
      const harness = createHarness(async () => "ok");

      harness.input.push(JSON.stringify({ jsonrpc: "2.0", id: 42 }) + "\n");

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, 42);
      assert.equal(parsed.error?.code, -32600);
      assert.equal(parsed.error?.message, "Invalid Request");
      harness.server.stop();
    });
  });

  describe("Defect 3: Response Schema XOR, Void Handler & Correlation", () => {
    it("response schema rejects response with neither result nor error", () => {
      const parsed = jsonRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "req_1",
      });
      assert.equal(parsed.success, false, "Schema must reject response with neither result nor error");
    });

    it("response schema rejects response with both result and error", () => {
      const parsed = jsonRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "req_1",
        result: { status: "ok" },
        error: { code: -32600, message: "Invalid" },
      });
      assert.equal(parsed.success, false, "Schema must reject response with both result and error");
    });

    it("response schema accepts response with valid falsy and null results", () => {
      const falsyValues = [null, false, 0, ""];
      for (const val of falsyValues) {
        const parsed = jsonRpcResponseSchema.safeParse({
          jsonrpc: "2.0",
          id: "req_1",
          result: val,
        });
        assert.equal(parsed.success, true, `Schema must accept result: ${JSON.stringify(val)}`);
      }
    });

    it("serializes valid null result when handler returns void / undefined", async () => {
      const harness = createHarness(async () => {
        // void return
      });

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "req_void",
          method: "action/void",
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      const lines = harness.getLines();
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.jsonrpc, "2.0");
      assert.equal(parsed.id, "req_void");
      assert.ok(Object.prototype.hasOwnProperty.call(parsed, "result"), "result member must be present");
      assert.equal(parsed.result, null);
      harness.server.stop();
    });

    it("does not reflect unsolicited responses back as invalid requests", async () => {
      const harness = createHarness(async () => ({}));

      // Unsolicited response for an unknown id
      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "unsolicited_id_123",
          result: { answer: "unsolicited" },
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(
        harness.getLines().length,
        0,
        "Server must not respond to unsolicited responses",
      );
      harness.server.stop();
    });

    it("rejects pending outbound request when client returns malformed response with neither result nor error", async () => {
      const harness = createHarness(async () => ({}));

      const reqPromise = harness.server.request("host/toolCall", { tool: "test" }, 2000);
      await new Promise((r) => setTimeout(r, 20));

      const sentLines = harness.getLines();
      assert.equal(sentLines.length, 1);
      const sent = JSON.parse(sentLines[0]);
      harness.clearOutput();

      // Client sends response missing both result and error
      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: sent.id,
        }) + "\n",
      );

      await assert.rejects(
        reqPromise,
        /Malformed JSON-RPC response from client:/,
      );
      harness.server.stop();
    });

    it("rejects pending outbound request when client returns malformed response with both result and error", async () => {
      const harness = createHarness(async () => ({}));

      const reqPromise = harness.server.request("host/toolCall", { tool: "test" }, 2000);
      await new Promise((r) => setTimeout(r, 20));

      const sentLines = harness.getLines();
      assert.equal(sentLines.length, 1);
      const sent = JSON.parse(sentLines[0]);
      harness.clearOutput();

      // Client sends response containing both result and error
      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: sent.id,
          result: { foo: "bar" },
          error: { code: -32600, message: "Invalid" },
        }) + "\n",
      );

      await assert.rejects(
        reqPromise,
        /Malformed JSON-RPC response from client:/,
      );
      harness.server.stop();
    });

    it("resolves outbound request with falsy results: false, 0, null, empty string", async () => {
      const testCases = [false, 0, null, ""];

      for (const val of testCases) {
        const harness = createHarness(async () => ({}));
        const reqPromise = harness.server.request("host/check", { query: "val" }, 2000);
        await new Promise((r) => setTimeout(r, 20));

        const sent = JSON.parse(harness.getLines()[0]);
        harness.clearOutput();

        harness.input.push(
          JSON.stringify({
            jsonrpc: "2.0",
            id: sent.id,
            result: val,
          }) + "\n",
        );

        const res = await reqPromise;
        assert.equal(res, val);
        harness.server.stop();
      }
    });

    it("does not reflect unsolicited error responses back as invalid requests", async () => {
      const harness = createHarness(async () => ({}));

      harness.input.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "unknown_error_id",
          error: { code: -32603, message: "something failed remotely" },
        }) + "\n",
      );

      await new Promise((r) => setTimeout(r, 50));

      assert.equal(
        harness.getLines().length,
        0,
        "Server must not respond to unsolicited error responses",
      );
      harness.server.stop();
    });
  });
});
