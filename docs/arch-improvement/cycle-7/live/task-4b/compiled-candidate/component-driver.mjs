// ../../../tmp/frozen-task-4b-candidate-build/frozen-src/packages/protocol/dist/index.js
import { z } from "zod";
import "zod";
import "node:stream";
import { StringDecoder } from "node:string_decoder";
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
var JsonRpcInvalidParamsError = class extends Error {
  code = -32602;
  data;
  constructor(message = "Invalid params", data) {
    super(message);
    this.name = "JsonRpcInvalidParamsError";
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
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
      if (err instanceof JsonRpcMethodNotFoundError) {
        this.send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: err.message }
        });
      } else if (err instanceof JsonRpcInvalidParamsError) {
        this.send({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: err.message,
            ...err.data !== void 0 ? { data: err.data } : {}
          }
        });
      } else {
        this.send({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) }
        });
      }
    }
  }
};
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

// ../../../tmp/frozen-task-4b-candidate-build/frozen-src/packages/core/dist/index.js
import { z as z2 } from "zod";
var DurableHarnessError = class extends Error {
  code;
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
  }
};
var SessionError = class extends DurableHarnessError {
  constructor(code, message, cause) {
    super(message, code, cause);
    this.name = "SessionError";
  }
};
var subagentThinkingLevelSchema = z2.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);
var subagentModelReferenceSchema = z2.object({
  provider: z2.string().min(1),
  modelId: z2.string().min(1)
}).strict();
var subagentModelProfileSchema = z2.object({
  model: subagentModelReferenceSchema,
  thinkingLevel: subagentThinkingLevelSchema
}).strict();
var subagentPolicySchema = z2.discriminatedUnion("mode", [
  z2.object({
    mode: z2.literal("inherit"),
    configuredProfile: subagentModelProfileSchema.optional()
  }).strict(),
  z2.object({
    mode: z2.literal("configured"),
    configuredProfile: subagentModelProfileSchema
  }).strict()
]);
var subagentPolicyRecordSchema = z2.object({
  version: z2.literal(1),
  revision: z2.number().int().nonnegative(),
  updatedAt: z2.string().optional(),
  policy: subagentPolicySchema
}).strict();
var subagentPolicySetInputSchema = z2.object({
  policy: subagentPolicySchema,
  expectedRevision: z2.number().int().nonnegative()
}).strict();
var subagentPolicyGetOutputSchema = z2.object({
  record: subagentPolicyRecordSchema
}).strict();
var subagentPolicySetOutputSchema = z2.object({
  record: subagentPolicyRecordSchema
}).strict();
var SessionCoordinator = class {
  engine;
  store;
  sessionDir;
  modelProvider;
  executionEnv;
  resourceLoader;
  isStarted = false;
  isClosed = false;
  isAborted = false;
  listeners = /* @__PURE__ */ new Set();
  constructor(options) {
    if (!options.engine) {
      throw new Error("IAgentEngine is required by SessionCoordinator (AP-010, AP-076)");
    }
    this.engine = options.engine;
    this.store = options.store;
    this.sessionDir = options.sessionDir ?? options.store?.sessionDir ?? process.cwd();
    this.modelProvider = options.modelProvider;
    this.executionEnv = options.executionEnv;
    this.resourceLoader = options.resourceLoader;
  }
  async start() {
    await this.engine.start(this.sessionDir);
    if (this.store) {
      await this.store.acquireLock();
    }
    this.isStarted = true;
  }
  async prompt(input, options) {
    if (this.isClosed) {
      throw new SessionError("SESSION_CLOSED", "Session is closed");
    }
    if (this.isAborted) {
      throw new SessionError("SESSION_ABORTED", "Session is aborted");
    }
    if (!this.isStarted) {
      throw new SessionError(
        "SESSION_NOT_STARTED",
        "Session is not started. Call start() before submitting prompts"
      );
    }
    if (typeof input === "string") {
      if (input.trim().length === 0) {
        throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
      }
    } else if (Array.isArray(input)) {
      if (input.length === 0) {
        throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
      }
      const hasValidPart = input.some((p) => {
        if (!p || typeof p !== "object") return false;
        if (p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0) return true;
        if (p.type === "image" && typeof p.data === "string" && typeof p.mimeType === "string") return true;
        return false;
      });
      if (!hasValidPart) {
        throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
      }
    } else {
      throw new SessionError("INVALID_PROMPT", "Prompt content must be a non-empty string or image list");
    }
    return await this.engine.submit(input, options);
  }
  emitEvent(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  events(callback) {
    const unsubEngine = this.engine.events(callback);
    this.listeners.add(callback);
    return () => {
      unsubEngine();
      this.listeners.delete(callback);
    };
  }
  async abort(conversationId) {
    this.isAborted = true;
    await this.engine.abort(conversationId);
    this.emitEvent({ type: "session/aborted" });
  }
  async getState(conversationId) {
    return await this.engine.getState(conversationId);
  }
  async getTranscript(conversationId, limit) {
    return await this.engine.getTranscript(conversationId, limit);
  }
  async getStats(conversationId) {
    return await this.engine.getStats(conversationId);
  }
  async setSubagentPolicy(params) {
    await this.engine.setSubagentPolicy(params);
    if (this.store) {
      await this.store.saveDocument("subagents", "policy_ack", params);
    }
    return { ok: true };
  }
  async close() {
    this.isClosed = true;
    this.isStarted = false;
    this.listeners.clear();
    await this.engine.close();
    if (this.store) {
      await this.store.releaseLock();
      await this.store.close();
    }
  }
};

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/runner/src/dispatch/types.ts
var UnsupportedCapabilityError = class extends Error {
  capability;
  missingSeam;
  constructor(capability, missingSeam) {
    super(
      `Capability '${capability}' is unsupported by the current SessionCoordinator / IAgentEngine SPI. Missing seam: ${missingSeam}`
    );
    this.name = "UnsupportedCapabilityError";
    this.capability = capability;
    this.missingSeam = missingSeam;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/core/src/policy/schema.ts
import { z as z3 } from "zod";
var subagentThinkingLevelSchema2 = z3.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);
var subagentModelReferenceSchema2 = z3.object({
  provider: z3.string().min(1),
  modelId: z3.string().min(1)
}).strict();
var subagentModelProfileSchema2 = z3.object({
  model: subagentModelReferenceSchema2,
  thinkingLevel: subagentThinkingLevelSchema2
}).strict();
var subagentPolicySchema2 = z3.discriminatedUnion("mode", [
  z3.object({
    mode: z3.literal("inherit"),
    configuredProfile: subagentModelProfileSchema2.optional()
  }).strict(),
  z3.object({
    mode: z3.literal("configured"),
    configuredProfile: subagentModelProfileSchema2
  }).strict()
]);
var subagentPolicyRecordSchema2 = z3.object({
  version: z3.literal(1),
  revision: z3.number().int().nonnegative(),
  updatedAt: z3.string().optional(),
  policy: subagentPolicySchema2
}).strict();
var subagentPolicySetInputSchema2 = z3.object({
  policy: subagentPolicySchema2,
  expectedRevision: z3.number().int().nonnegative()
}).strict();
var subagentPolicyGetOutputSchema2 = z3.object({
  record: subagentPolicyRecordSchema2
}).strict();
var subagentPolicySetOutputSchema2 = z3.object({
  record: subagentPolicyRecordSchema2
}).strict();

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/protocol/src/jsonrpc/errors.ts
var JsonRpcMethodNotFoundError2 = class extends Error {
  code = -32601;
  method;
  constructor(method) {
    super(method ? `Method not found: ${method}` : "Method not found");
    this.name = "JsonRpcMethodNotFoundError";
    this.method = method;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var JsonRpcInvalidParamsError2 = class extends Error {
  code = -32602;
  data;
  constructor(message = "Invalid params", data) {
    super(message);
    this.name = "JsonRpcInvalidParamsError";
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/protocol/src/jsonrpc/schema.ts
import { z as z4 } from "zod";
var jsonRpcRequestSchema2 = z4.object({
  jsonrpc: z4.literal("2.0"),
  id: z4.union([z4.string(), z4.number()]),
  method: z4.string().min(1),
  params: z4.record(z4.string(), z4.unknown()).optional()
});
var jsonRpcResponseSchema2 = z4.object({
  jsonrpc: z4.literal("2.0"),
  id: z4.union([z4.string(), z4.number(), z4.null()]),
  result: z4.unknown().optional(),
  error: z4.object({
    code: z4.number().int(),
    message: z4.string(),
    data: z4.unknown().optional()
  }).optional()
}).superRefine((val, ctx) => {
  const hasResult = Object.prototype.hasOwnProperty.call(val, "result") && val.result !== void 0;
  const hasError = Object.prototype.hasOwnProperty.call(val, "error") && val.error !== void 0;
  if (hasResult && hasError) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
      message: "Response cannot contain both 'result' and 'error'"
    });
  } else if (!hasResult && !hasError) {
    ctx.addIssue({
      code: z4.ZodIssueCode.custom,
      message: "Response must contain either 'result' or 'error'"
    });
  }
});
var jsonRpcNotificationSchema2 = z4.object({
  jsonrpc: z4.literal("2.0"),
  method: z4.string().min(1),
  params: z4.record(z4.string(), z4.unknown()).optional()
});

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/protocol/src/jsonrpc/types.ts
import "zod";

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/protocol/src/transport/stdio-server.ts
import "node:stream";
import { StringDecoder as StringDecoder2 } from "node:string_decoder";

// ../../../private/tmp/frozen-task-4b-candidate-build/frozen-src/packages/runner/src/dispatch/session-dispatcher.ts
function extractPromptInput(params) {
  if (params.content !== void 0) {
    const content = params.content;
    if (typeof content === "string") {
      if (content.trim().length === 0) {
        throw new JsonRpcInvalidParamsError2("Prompt content string must not be empty");
      }
      return content;
    }
    if (Array.isArray(content)) {
      if (content.length === 0) {
        throw new JsonRpcInvalidParamsError2("Prompt content array must not be empty");
      }
      for (const part of content) {
        if (!part || typeof part !== "object") {
          throw new JsonRpcInvalidParamsError2("Prompt content part must be an object");
        }
        if (part.type === "text") {
          if (typeof part.text !== "string" || part.text.trim().length === 0) {
            throw new JsonRpcInvalidParamsError2("Prompt text part must contain non-empty text string");
          }
        } else if (part.type === "image") {
          if (typeof part.data !== "string" || typeof part.mimeType !== "string") {
            throw new JsonRpcInvalidParamsError2("Prompt image part must contain data and mimeType strings");
          }
        } else {
          throw new JsonRpcInvalidParamsError2(`Invalid prompt content part type: ${part.type}`);
        }
      }
      return content;
    }
    throw new JsonRpcInvalidParamsError2("Prompt content must be a non-empty string or content parts array");
  }
  const msg = typeof params.message === "string" ? params.message : void 0;
  const imgs = Array.isArray(params.images) ? params.images : void 0;
  if (!msg && (!imgs || imgs.length === 0)) {
    throw new JsonRpcInvalidParamsError2("Missing required prompt content, message, or images");
  }
  if (imgs) {
    for (const img of imgs) {
      if (!img || typeof img !== "object" || img.type !== "image" || typeof img.data !== "string" || typeof img.mimeType !== "string") {
        throw new JsonRpcInvalidParamsError2("Invalid image in prompt images list");
      }
    }
  }
  if (!imgs || imgs.length === 0) {
    if (!msg || msg.trim().length === 0) {
      throw new JsonRpcInvalidParamsError2("Prompt message must not be empty");
    }
    return msg;
  }
  if (!msg || msg.trim().length === 0) {
    return imgs;
  }
  return [{ type: "text", text: msg }, ...imgs];
}
function extractPromptOptions(params, forcedDeliverAs) {
  let conversationId;
  if (typeof params.conversationId === "string") {
    conversationId = params.conversationId;
  } else if (params.conversationId !== void 0 && params.conversationId !== null) {
    throw new JsonRpcInvalidParamsError2("conversationId must be a string");
  } else if (params.options && typeof params.options === "object") {
    const optConv = params.options.conversationId;
    if (typeof optConv === "string") {
      conversationId = optConv;
    } else if (optConv !== void 0 && optConv !== null) {
      throw new JsonRpcInvalidParamsError2("conversationId must be a string");
    }
  }
  let deliverAs = forcedDeliverAs;
  if (!deliverAs) {
    const rawDeliverAs = params.deliverAs ?? params.streamingBehavior ?? params.options?.deliverAs;
    if (rawDeliverAs !== void 0) {
      if (rawDeliverAs !== "steer" && rawDeliverAs !== "followUp") {
        throw new JsonRpcInvalidParamsError2("deliverAs must be 'steer' or 'followUp'");
      }
      deliverAs = rawDeliverAs;
    } else {
      deliverAs = "followUp";
    }
  }
  return {
    ...conversationId !== void 0 ? { conversationId } : {},
    ...deliverAs !== void 0 ? { deliverAs } : {}
  };
}
function createSessionDispatcher(options) {
  const coordinator = options.coordinator;
  const engine = options.engine;
  if (!coordinator || !engine) {
    throw new Error("Both coordinator and engine are required to create a session dispatcher (AP-010, AP-074)");
  }
  return async (method, params = {}) => {
    switch (method) {
      case "session/prompt": {
        const input = extractPromptInput(params);
        const execOptions = extractPromptOptions(params);
        return await coordinator.prompt(input, execOptions);
      }
      case "session/steer": {
        const input = extractPromptInput(params);
        const execOptions = extractPromptOptions(params, "steer");
        return await coordinator.prompt(input, execOptions);
      }
      case "session/followUp": {
        const input = extractPromptInput(params);
        const execOptions = extractPromptOptions(params, "followUp");
        return await coordinator.prompt(input, execOptions);
      }
      case "session/abort": {
        let conversationId;
        if (params.conversationId !== void 0 && params.conversationId !== null) {
          if (typeof params.conversationId !== "string") {
            throw new JsonRpcInvalidParamsError2("conversationId must be a string");
          }
          conversationId = params.conversationId;
        }
        await coordinator.abort(conversationId);
        return { ok: true };
      }
      case "session/abortTask": {
        const taskId = params.taskId;
        if (typeof taskId !== "number" || !Number.isInteger(taskId) || taskId <= 0) {
          throw new JsonRpcInvalidParamsError2("Missing or invalid taskId: must be a positive integer");
        }
        await engine.abortTask(taskId);
        return { ok: true };
      }
      case "session/compact": {
        let instructions;
        if (params.instructions !== void 0 && params.instructions !== null) {
          if (typeof params.instructions !== "string") {
            throw new JsonRpcInvalidParamsError2("instructions must be a string");
          }
          instructions = params.instructions;
        }
        await engine.compact(instructions);
        return { ok: true };
      }
      case "subagent/setPolicy":
      case "session/setSubagentPolicy": {
        const target = params.policyRecord ?? params.record ?? params;
        const parsed = subagentPolicyRecordSchema2.safeParse(target);
        if (!parsed.success) {
          throw new JsonRpcInvalidParamsError2(`Invalid subagent policy record: ${parsed.error.message}`);
        }
        await coordinator.setSubagentPolicy(parsed.data);
        return { ok: true };
      }
      case "models/list": {
        const state = await engine.getState();
        return { models: state.models };
      }
      case "models/set": {
        const { provider, modelId } = params;
        if (typeof provider !== "string" || provider.trim().length === 0 || typeof modelId !== "string" || modelId.trim().length === 0) {
          throw new JsonRpcInvalidParamsError2("Missing or invalid provider or modelId");
        }
        await engine.setModel({ provider: provider.trim(), modelId: modelId.trim() });
        return { ok: true };
      }
      case "models/setThinking": {
        const level = params.level;
        const validLevels = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
        if (typeof level !== "string" || !validLevels.has(level)) {
          throw new JsonRpcInvalidParamsError2(
            "Missing or invalid thinking level: must be one of off, minimal, low, medium, high, xhigh"
          );
        }
        await engine.setThinkingLevel(level);
        return { ok: true };
      }
      case "session/getState": {
        let conversationId;
        if (params.conversationId !== void 0 && params.conversationId !== null) {
          if (typeof params.conversationId !== "string") {
            throw new JsonRpcInvalidParamsError2("conversationId must be a string");
          }
          conversationId = params.conversationId;
        }
        return await coordinator.getState(conversationId);
      }
      case "session/getTranscript": {
        let conversationId;
        if (params.conversationId !== void 0 && params.conversationId !== null) {
          if (typeof params.conversationId !== "string") {
            throw new JsonRpcInvalidParamsError2("conversationId must be a string");
          }
          conversationId = params.conversationId;
        }
        let limit;
        if (params.limit !== void 0 && params.limit !== null) {
          if (typeof params.limit !== "number" || !Number.isInteger(params.limit) || params.limit < 0) {
            throw new JsonRpcInvalidParamsError2("limit must be a non-negative integer");
          }
          limit = params.limit;
        }
        return await coordinator.getTranscript(conversationId, limit);
      }
      case "session/getStats": {
        let conversationId;
        if (params.conversationId !== void 0 && params.conversationId !== null) {
          if (typeof params.conversationId !== "string") {
            throw new JsonRpcInvalidParamsError2("conversationId must be a string");
          }
          conversationId = params.conversationId;
        }
        return await coordinator.getStats(conversationId);
      }
      case "binding/register":
        throw new UnsupportedCapabilityError(
          "binding/register",
          "Runtime binding storage is not exposed on IAgentEngine or SessionCoordinator SPI; requires dedicated IBindingStore or IAgentEngine binding methods."
        );
      case "binding/list":
        throw new UnsupportedCapabilityError(
          "binding/list",
          "Runtime binding storage is not exposed on IAgentEngine or SessionCoordinator SPI; requires dedicated IBindingStore or IAgentEngine binding methods."
        );
      case "session/fork":
        throw new UnsupportedCapabilityError(
          "session/fork",
          "Session database forking is not exposed on IAgentEngine or SessionCoordinator SPI; requires administrative ISessionStore.fork() or IAgentEngine session fork port."
        );
      case "tools/register":
        throw new UnsupportedCapabilityError(
          "tools/register",
          "Dynamic tool registration is not exposed on IAgentEngine or SessionCoordinator SPI; requires tool registry mutation port."
        );
      default:
        throw new JsonRpcMethodNotFoundError2(method);
    }
  };
}

// ../../../private/tmp/frozen-task-4b-candidate-build/consumer-src/driver.ts
var TestOnlyInMemoryAgentEngineFixture = class {
  calls = [];
  nextSubmitId = 1;
  isStarted = false;
  isClosed = false;
  activeModel = { provider: "fixture-provider", modelId: "fixture-model-v1" };
  thinkingLevel = "high";
  subagentPolicy;
  models = [
    {
      provider: "fixture-provider",
      modelId: "fixture-model-v1",
      name: "Fixture Model V1",
      contextWindow: 64e3
    }
  ];
  entries = [
    {
      id: "fixture_entry_1",
      conversationId: "1",
      kind: "prompt",
      role: "user",
      text: "fixture transcript sample entry"
    }
  ];
  tokens = 100;
  contextWindow = 128e3;
  recordCall(method, ...args) {
    this.calls.push({ method, args, timestamp: Date.now() });
  }
  getCalls() {
    return [...this.calls];
  }
  reset() {
    this.calls.length = 0;
    this.nextSubmitId = 1;
  }
  async start(sessionDir) {
    this.recordCall("start", sessionDir);
    this.isStarted = true;
  }
  async submit(input, options) {
    this.recordCall("submit", input, options);
    const id = `fixture_sub_${this.nextSubmitId++}`;
    return {
      status: "accepted",
      id,
      conversationId: options?.conversationId ?? "1"
    };
  }
  async abort(conversationId) {
    this.recordCall("abort", conversationId);
  }
  async abortTask(taskId) {
    this.recordCall("abortTask", taskId);
  }
  async compact(instructions) {
    this.recordCall("compact", instructions);
  }
  async setSubagentPolicy(record) {
    this.recordCall("setSubagentPolicy", record);
    this.subagentPolicy = record;
  }
  async setModel(model) {
    this.recordCall("setModel", model);
    this.activeModel = model;
  }
  async setThinkingLevel(level) {
    this.recordCall("setThinkingLevel", level);
    this.thinkingLevel = level;
  }
  async getState(conversationId) {
    this.recordCall("getState", conversationId);
    return {
      sessionId: "fixture-in-memory-session",
      cwd: "/fixture-test-workspace",
      activeConversationId: conversationId ?? "1",
      activeModel: this.activeModel,
      thinkingLevel: this.thinkingLevel,
      models: this.models,
      entryCount: this.entries.length
    };
  }
  async getTranscript(conversationId, limit) {
    this.recordCall("getTranscript", conversationId, limit);
    const filtered = this.entries.filter(
      (e) => !conversationId || e.conversationId === conversationId
    );
    const sliced = limit !== void 0 ? filtered.slice(0, limit) : filtered;
    return {
      conversationId: conversationId ?? "1",
      entries: sliced
    };
  }
  async getStats(conversationId) {
    this.recordCall("getStats", conversationId);
    return {
      contextUsage: {
        tokens: this.tokens,
        contextWindow: this.contextWindow
      }
    };
  }
  events(_listener) {
    return () => {
    };
  }
  async close() {
    this.recordCall("close");
    this.isClosed = true;
  }
};
async function createTestDriverServer(options = {}) {
  const fixtureEngine = new TestOnlyInMemoryAgentEngineFixture();
  const coordinator = new SessionCoordinator({
    engine: fixtureEngine,
    sessionDir: "/tmp/fixture-session-dir"
  });
  await coordinator.start();
  const dispatcher = createSessionDispatcher({
    coordinator,
    engine: fixtureEngine
  });
  const server = new StdioJsonRpcServer({
    stdin: options.stdin ?? process.stdin,
    stdout: options.stdout ?? process.stdout,
    handler: async (method, params = {}) => {
      if (method === "fixture/getCalls") {
        return { calls: fixtureEngine.getCalls() };
      }
      if (method === "fixture/reset") {
        fixtureEngine.reset();
        return { ok: true };
      }
      return await dispatcher(method, params);
    }
  });
  server.start();
  const shutdown = async () => {
    try {
      server.stop();
      await coordinator.close();
    } catch {
    }
  };
  return { server, coordinator, fixtureEngine, shutdown };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestDriverServer().then((driver) => {
    const onSignal = async () => {
      await driver.shutdown();
      process.exit(0);
    };
    process.on("SIGTERM", () => void onSignal());
    process.on("SIGINT", () => void onSignal());
  }).catch((err) => {
    console.error("Fatal startup error in candidate driver:", err);
    process.exit(1);
  });
}
export {
  TestOnlyInMemoryAgentEngineFixture,
  createTestDriverServer
};
