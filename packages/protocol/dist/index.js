// packages/protocol/src/jsonrpc/errors.ts
var JsonRpcMethodNotFoundError = class extends Error {
  code = -32601;
  method;
  constructor(method) {
    super(method ? `Method not found: ${method}` : "Method not found");
    this.name = "JsonRpcMethodNotFoundError";
    this.method = method;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// packages/protocol/src/jsonrpc/schema.ts
import { z } from "zod";
var jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
});
var jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional()
  }).optional()
}).superRefine((val, ctx) => {
  const hasResult = Object.prototype.hasOwnProperty.call(val, "result") && val.result !== void 0;
  const hasError = Object.prototype.hasOwnProperty.call(val, "error") && val.error !== void 0;
  if (hasResult && hasError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response cannot contain both 'result' and 'error'"
    });
  } else if (!hasResult && !hasError) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response must contain either 'result' or 'error'"
    });
  }
});
var jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
});

// packages/protocol/src/jsonrpc/types.ts
import "zod";

// packages/protocol/src/transport/request-dispatcher.ts
var RequestDispatcher = class {
  handler;
  send;
  pendingOutbound;
  constructor(handler, send, pendingOutbound) {
    this.handler = handler;
    this.send = send;
    this.pendingOutbound = pendingOutbound;
  }
  async processLine(line) {
    let raw;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        this.send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
        return;
      }
      raw = parsed;
    } catch {
      this.send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    if (!("method" in raw)) {
      const id2 = "id" in raw && (typeof raw.id === "string" || typeof raw.id === "number") ? raw.id : null;
      if (id2 !== null && this.pendingOutbound.has(id2)) {
        const pending = this.pendingOutbound.get(id2);
        clearTimeout(pending.timer);
        this.pendingOutbound.delete(id2);
        const resVal = jsonRpcResponseSchema.safeParse(raw);
        if (resVal.success) {
          if (resVal.data.error) pending.reject(new Error(resVal.data.error.message));
          else pending.resolve(resVal.data.result);
        } else {
          pending.reject(new Error(`Malformed JSON-RPC response from client: ${resVal.error.message}`));
        }
        return;
      }
      if ("result" in raw || "error" in raw) return;
    }
    if (!("id" in raw)) {
      const notifVal = jsonRpcNotificationSchema.safeParse(raw);
      if (notifVal.success) {
        try {
          await this.handler(notifVal.data.method, notifVal.data.params ?? {});
        } catch {
        }
        return;
      }
    }
    const validated = jsonRpcRequestSchema.safeParse(raw);
    if (!validated.success) {
      const reqId = "id" in raw && (typeof raw.id === "string" || typeof raw.id === "number") ? raw.id : null;
      this.send({ jsonrpc: "2.0", id: reqId, error: { code: -32600, message: "Invalid Request" } });
      return;
    }
    const { id, method, params } = validated.data;
    try {
      const result = await this.handler(method, params ?? {});
      this.send({ jsonrpc: "2.0", id, result: result === void 0 ? null : result });
    } catch (err) {
      const isNotFound = err instanceof JsonRpcMethodNotFoundError;
      this.send({
        jsonrpc: "2.0",
        id,
        error: isNotFound ? { code: -32601, message: err.message } : { code: -32603, message: err instanceof Error ? err.message : String(err) }
      });
    }
  }
};

// packages/protocol/src/transport/stdio-server.ts
import "node:stream";
import { StringDecoder } from "node:string_decoder";
var StdioJsonRpcServer = class {
  stdin;
  stdout;
  decoder = new StringDecoder("utf8");
  buffer = "";
  nextRequestId = 0;
  pendingOutbound = /* @__PURE__ */ new Map();
  dispatcher;
  onDataHandler = (chunk) => {
    void this.handleChunk(chunk);
  };
  constructor(options) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.dispatcher = new RequestDispatcher(
      options.handler,
      (msg) => this.send(msg),
      this.pendingOutbound
    );
  }
  start() {
    this.stdin.on("data", this.onDataHandler);
  }
  stop() {
    this.stdin.off("data", this.onDataHandler);
    for (const pending of this.pendingOutbound.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server stopped"));
    }
    this.pendingOutbound.clear();
  }
  close() {
    this.stop();
  }
  send(message) {
    this.stdout.write(JSON.stringify(message) + "\n");
  }
  sendNotification(method, params) {
    this.send({ jsonrpc: "2.0", method, params });
  }
  request(method, params, timeoutMs = 12e4) {
    const id = `req_${Date.now()}_${++this.nextRequestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOutbound.delete(id);
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingOutbound.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  async handleChunk(chunk) {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      await this.dispatcher.processLine(line);
    }
  }
};
export {
  JsonRpcMethodNotFoundError,
  RequestDispatcher,
  StdioJsonRpcServer,
  jsonRpcNotificationSchema,
  jsonRpcRequestSchema,
  jsonRpcResponseSchema
};
//# sourceMappingURL=index.js.map
