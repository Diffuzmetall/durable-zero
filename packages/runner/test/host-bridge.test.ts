import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { StdioJsonRpcServer } from "../../protocol/src/transport/stdio-server.ts";
import type { IHostBridge } from "../../core/src/tools/host-bridge.ts";
import { HostBridge, type HostRequester } from "../src/host/host-bridge.ts";

describe("HostBridge Component (Task 2A / S7)", () => {
  describe("Constructor & Options Validation", () => {
    it("rejects null or non-object options", () => {
      // @ts-expect-error - testing runtime defense
      assert.throws(() => new HostBridge(null), TypeError);
      // @ts-expect-error - testing runtime defense
      assert.throws(() => new HostBridge(undefined), TypeError);
      // @ts-expect-error - testing runtime defense
      assert.throws(() => new HostBridge("not an object"), TypeError);
    });

    it("requires a requester with a request method", () => {
      // @ts-expect-error - testing runtime defense
      assert.throws(() => new HostBridge({}), TypeError);
      // @ts-expect-error - testing runtime defense
      assert.throws(() => new HostBridge({ requester: {} }), TypeError);
      assert.throws(
        // @ts-expect-error - testing runtime defense
        () => new HostBridge({ requester: { request: "not a function" } }),
        TypeError,
      );
    });

    it("defaults timeoutMs to 30,000ms when omitted", () => {
      let capturedTimeout: number | undefined;
      const fakeRequester: HostRequester = {
        request: async (_method, _params, timeoutMs) => {
          capturedTimeout = timeoutMs;
          return { content: [{ type: "text", text: "ok" }] };
        },
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      assert.ok(bridge instanceof HostBridge);
    });

    it("rejects non-positive or non-finite timeoutMs values", () => {
      const fakeRequester: HostRequester = { request: async () => ({}) };

      assert.throws(
        () => new HostBridge({ requester: fakeRequester, timeoutMs: 0 }),
        TypeError,
      );
      assert.throws(
        () => new HostBridge({ requester: fakeRequester, timeoutMs: -500 }),
        TypeError,
      );
      assert.throws(
        () => new HostBridge({ requester: fakeRequester, timeoutMs: NaN }),
        TypeError,
      );
      assert.throws(
        () => new HostBridge({ requester: fakeRequester, timeoutMs: Infinity }),
        TypeError,
      );
      assert.throws(
        // @ts-expect-error - testing runtime defense
        () => new HostBridge({ requester: fakeRequester, timeoutMs: "30000" }),
        TypeError,
      );
    });

    it("accepts valid positive finite timeoutMs", async () => {
      let capturedTimeout: number | undefined;
      const fakeRequester: HostRequester = {
        request: async (_method, _params, timeoutMs) => {
          capturedTimeout = timeoutMs;
          return { content: [{ type: "text", text: "ok" }] };
        },
      };

      const bridge = new HostBridge({
        requester: fakeRequester,
        timeoutMs: 15_000,
      });
      await bridge.forwardToolCall("dummy", {});
      assert.equal(capturedTimeout, 15_000);
    });
  });

  describe("forwardToolCall Unit Behavior", () => {
    it("dispatches to host/toolCall with toolName, arguments, and timeoutMs", async () => {
      let capturedMethod = "";
      let capturedParams: Record<string, unknown> | undefined;
      let capturedTimeout: number | undefined;

      const fakeRequester: HostRequester = {
        request: async (method, params, timeoutMs) => {
          capturedMethod = method;
          capturedParams = params;
          capturedTimeout = timeoutMs;
          return { content: [{ type: "text", text: "file contents" }] };
        },
      };

      const bridge: IHostBridge = new HostBridge({ requester: fakeRequester });
      const result = await bridge.forwardToolCall("read_file", {
        path: "README.md",
      });

      assert.equal(capturedMethod, "host/toolCall");
      assert.deepEqual(capturedParams, {
        toolName: "read_file",
        arguments: { path: "README.md" },
      });
      assert.equal(capturedTimeout, 30_000);
      assert.deepEqual(result, {
        content: [{ type: "text", text: "file contents" }],
      });
    });

    it("defaults arguments to empty object when null or undefined", async () => {
      let capturedParams: Record<string, unknown> | undefined;
      const fakeRequester: HostRequester = {
        request: async (_method, params) => {
          capturedParams = params;
          return { content: [{ type: "text", text: "ok" }] };
        },
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      await bridge.forwardToolCall("get_status", undefined);
      assert.deepEqual(capturedParams?.arguments, {});

      await bridge.forwardToolCall("get_status", null);
      assert.deepEqual(capturedParams?.arguments, {});
    });

    it("preserves isError: true on tool failure payloads without throwing", async () => {
      const fakeRequester: HostRequester = {
        request: async () => ({
          content: [{ type: "text", text: "File not found" }],
          isError: true,
        }),
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      const result = await bridge.forwardToolCall("read_file", { path: "missing" });
      assert.equal(result.isError, true);
      assert.deepEqual(result.content, [
        { type: "text", text: "File not found" },
      ]);
    });

    it("preserves isError: false on tool success payloads", async () => {
      const fakeRequester: HostRequester = {
        request: async () => ({
          content: [{ type: "text", text: "Saved" }],
          isError: false,
        }),
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      const result = await bridge.forwardToolCall("write_file", {});
      assert.equal(result.isError, false);
      assert.deepEqual(result.content, [{ type: "text", text: "Saved" }]);
    });

    it("rejects when input arguments contain non-JSON values", async () => {
      const fakeRequester: HostRequester = { request: async () => ({}) };
      const bridge = new HostBridge({ requester: fakeRequester });

      await assert.rejects(
        () => bridge.forwardToolCall("tool", { fn: () => {} }),
        (err: unknown) => (err as Error).name === "ZodError",
      );
      await assert.rejects(
        () => bridge.forwardToolCall("tool", { big: 999999999999999999n }),
        (err: unknown) => (err as Error).name === "ZodError",
      );
    });

    it("rejects when returned tool result is malformed", async () => {
      // Content not an array
      const fake1: HostRequester = {
        request: async () => ({ content: "plain string" }),
      };
      const bridge1 = new HostBridge({ requester: fake1 });
      await assert.rejects(
        () => bridge1.forwardToolCall("test", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );

      // Missing content property
      const fake2: HostRequester = {
        request: async () => ({ status: "ok" }),
      };
      const bridge2 = new HostBridge({ requester: fake2 });
      await assert.rejects(
        () => bridge2.forwardToolCall("test", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );

      // Invalid content block type
      const fake3: HostRequester = {
        request: async () => ({
          content: [{ type: "binary", data: "0101" }],
        }),
      };
      const bridge3 = new HostBridge({ requester: fake3 });
      await assert.rejects(
        () => bridge3.forwardToolCall("test", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );
    });

    it("propagates transport errors when requester.request rejects", async () => {
      const fakeRequester: HostRequester = {
        request: async () => {
          throw new Error("Connection reset by peer");
        },
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      await assert.rejects(
        () => bridge.forwardToolCall("ping", {}),
        /Connection reset by peer/,
      );
    });
  });

  describe("requestInteraction Unit Behavior", () => {
    it("dispatches to host/interaction with kind and payload fields", async () => {
      let capturedMethod = "";
      let capturedParams: Record<string, unknown> | undefined;
      let capturedTimeout: number | undefined;

      const fakeRequester: HostRequester = {
        request: async (method, params, timeoutMs) => {
          capturedMethod = method;
          capturedParams = params;
          capturedTimeout = timeoutMs;
          return { choice: "option-a" };
        },
      };

      const bridge: IHostBridge = new HostBridge({ requester: fakeRequester });
      const result = await bridge.requestInteraction("select", {
        title: "Pick one",
        message: "Available options",
        data: { options: ["option-a", "option-b"] },
      });

      assert.equal(capturedMethod, "host/interaction");
      assert.deepEqual(capturedParams, {
        kind: "select",
        title: "Pick one",
        message: "Available options",
        data: { options: ["option-a", "option-b"] },
      });
      assert.equal(capturedTimeout, 30_000);
      assert.deepEqual(result, { choice: "option-a" });
    });

    it("ensures explicit interaction kind is authoritative and cannot be overridden by payload field", async () => {
      let capturedMethod = "";
      let capturedParams: Record<string, unknown> | undefined;

      const fakeRequester: HostRequester = {
        request: async (method, params) => {
          capturedMethod = method;
          capturedParams = params;
          return { confirmed: true };
        },
      };

      const bridge: IHostBridge = new HostBridge({ requester: fakeRequester });
      const payloadWithExtraKind = JSON.parse(
        '{"title":"Confirm operation","kind":"notify","message":"Please confirm"}',
      );
      const result = await bridge.requestInteraction("confirm", payloadWithExtraKind);

      assert.equal(capturedMethod, "host/interaction");
      assert.equal(capturedParams?.kind, "confirm");
      assert.equal(capturedParams?.title, "Confirm operation");
      assert.equal(capturedParams?.message, "Please confirm");
      assert.deepEqual(result, { confirmed: true });
    });

    it("validates and accepts opaque JSON responses (null, boolean, number, string, array, object)", async () => {
      const responses: unknown[] = [
        null,
        true,
        false,
        0,
        42,
        -1.5,
        "confirmed",
        ["a", "b"],
        { key: "val" },
      ];

      for (const expected of responses) {
        const fakeRequester: HostRequester = {
          request: async () => expected,
        };
        const bridge = new HostBridge({ requester: fakeRequester });
        const res = await bridge.requestInteraction("prompt", {});
        assert.deepEqual(res, expected);
      }
    });

    it("rejects non-JSON input data", async () => {
      const fakeRequester: HostRequester = { request: async () => null };
      const bridge = new HostBridge({ requester: fakeRequester });

      await assert.rejects(
        () =>
          bridge.requestInteraction("custom", {
            data: { fn: () => {} },
          }),
        (err: unknown) => (err as Error).name === "ZodError",
      );
    });

    it("rejects non-JSON responses from host (undefined, functions, BigInt)", async () => {
      const fake1: HostRequester = { request: async () => undefined };
      const bridge1 = new HostBridge({ requester: fake1 });
      await assert.rejects(
        () => bridge1.requestInteraction("confirm", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );

      const fake2: HostRequester = { request: async () => () => {} };
      const bridge2 = new HostBridge({ requester: fake2 });
      await assert.rejects(
        () => bridge2.requestInteraction("confirm", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );

      const fake3: HostRequester = { request: async () => BigInt(123) };
      const bridge3 = new HostBridge({ requester: fake3 });
      await assert.rejects(
        () => bridge3.requestInteraction("confirm", {}),
        (err: unknown) => (err as Error).name === "ZodError",
      );
    });

    it("propagates transport rejection without fabricating approval or returning null", async () => {
      const fakeRequester: HostRequester = {
        request: async () => {
          throw new Error("Interaction aborted by user");
        },
      };

      const bridge = new HostBridge({ requester: fakeRequester });
      await assert.rejects(
        () => bridge.requestInteraction("confirm", { title: "Confirm action" }),
        /Interaction aborted by user/,
      );
    });
  });

  describe("Real StdioJsonRpcServer Integration", () => {
    function createTestServer() {
      const stdin = new Readable({ read() {} });
      const outboundMessages: Array<{
        jsonrpc: string;
        id?: string | number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: unknown;
      }> = [];
      let buffer = "";

      const stdout = new Writable({
        write(chunk, _enc, cb) {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.trim()) {
              outboundMessages.push(JSON.parse(line));
            }
          }
          cb();
        },
      });

      const server = new StdioJsonRpcServer({
        stdin,
        stdout,
        handler: async () => ({}),
      });
      server.start();

      return { server, stdin, outboundMessages };
    }

    it("forwards tool call through real server and parses valid response", async () => {
      const { server, stdin, outboundMessages } = createTestServer();
      const bridge = new HostBridge({ requester: server });

      const promise = bridge.forwardToolCall("cat", { path: "test.txt" });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(outboundMessages.length, 1);
      const wireReq = outboundMessages[0]!;
      assert.equal(wireReq.method, "host/toolCall");
      assert.deepEqual(wireReq.params, {
        toolName: "cat",
        arguments: { path: "test.txt" },
      });
      assert.ok(wireReq.id);

      // Client sends back valid tool result
      stdin.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: wireReq.id,
          result: { content: [{ type: "text", text: "hello world" }] },
        }) + "\n",
      );

      const result = await promise;
      assert.deepEqual(result, {
        content: [{ type: "text", text: "hello world" }],
      });

      server.stop();
    });

    it("requests interaction through real server and parses valid JSON response", async () => {
      const { server, stdin, outboundMessages } = createTestServer();
      const bridge = new HostBridge({ requester: server });

      const promise = bridge.requestInteraction("confirm", {
        title: "Delete file?",
        message: "This cannot be undone.",
      });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(outboundMessages.length, 1);
      const wireReq = outboundMessages[0]!;
      assert.equal(wireReq.method, "host/interaction");
      assert.deepEqual(wireReq.params, {
        kind: "confirm",
        title: "Delete file?",
        message: "This cannot be undone.",
      });
      assert.ok(wireReq.id);

      stdin.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: wireReq.id,
          result: { confirmed: true },
        }) + "\n",
      );

      const result = await promise;
      assert.deepEqual(result, { confirmed: true });

      server.stop();
    });

    it("handles two concurrent calls answered out of order with actual ID correlation", async () => {
      const { server, stdin, outboundMessages } = createTestServer();
      const bridge = new HostBridge({ requester: server });

      // Dispatch call 1 and call 2 simultaneously
      const promise1 = bridge.forwardToolCall("toolAlpha", { val: 1 });
      const promise2 = bridge.requestInteraction("selectBeta", {
        title: "Beta",
      });

      await new Promise((r) => setTimeout(r, 20));
      assert.equal(outboundMessages.length, 2);

      const req1 = outboundMessages[0]!;
      const req2 = outboundMessages[1]!;

      // Verify methods
      assert.equal(req1.method, "host/toolCall");
      assert.equal(req2.method, "host/interaction");

      // Wire IDs are observed dynamically, never hardcoded
      assert.ok(req1.id);
      assert.ok(req2.id);
      assert.notEqual(req1.id, req2.id);

      // Answer call 2 FIRST
      stdin.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req2.id,
          result: { selected: "choice-beta" },
        }) + "\n",
      );

      // Answer call 1 SECOND
      stdin.push(
        JSON.stringify({
          jsonrpc: "2.0",
          id: req1.id,
          result: { content: [{ type: "text", text: "alpha output" }] },
        }) + "\n",
      );

      const [res1, res2] = await Promise.all([promise1, promise2]);

      // Correlated properly to their respective requests despite inverted answer order
      assert.deepEqual(res1, {
        content: [{ type: "text", text: "alpha output" }],
      });
      assert.deepEqual(res2, { selected: "choice-beta" });

      server.stop();
    });

    it("enforces configurable short timeout and rejects outstanding call", async () => {
      const { server } = createTestServer();
      // Configure 50ms short timeout
      const bridge = new HostBridge({ requester: server, timeoutMs: 50 });

      const startTime = Date.now();
      await assert.rejects(
        () => bridge.forwardToolCall("unresponsive_tool", {}),
        /timed out after 50ms/,
      );
      const elapsed = Date.now() - startTime;
      assert.ok(
        elapsed >= 40 && elapsed < 3000,
        `Expected ~50ms timeout, took ${elapsed}ms`,
      );

      server.stop();
    });

    it("rejects outstanding work when server is stopped", async () => {
      const { server } = createTestServer();
      const bridge = new HostBridge({ requester: server, timeoutMs: 10_000 });

      const promise = bridge.requestInteraction("long_interaction", {
        title: "Wait",
      });
      await new Promise((r) => setTimeout(r, 20));

      // Stop server while call is pending
      server.stop();

      await assert.rejects(promise, /Server stopped/);
    });
  });
});
