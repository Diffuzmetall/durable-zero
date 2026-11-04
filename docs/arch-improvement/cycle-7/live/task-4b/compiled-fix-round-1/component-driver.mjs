// ../../../tmp/frozen-task-4b-round1-build/frozen-src/packages/protocol/dist/index.js
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
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => {
        this.pendingOutbound.delete(id);
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingOutbound.set(id, { resolve: resolve2, reject, timer });
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

// ../../../tmp/frozen-task-4b-round1-build/frozen-src/packages/core/dist/index.js
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

// ../../../private/tmp/frozen-task-4b-round1-build/frozen-src/packages/runner/src/dispatch/types.ts
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

// ../../../tmp/frozen-task-4b-round1-build/frozen-src/packages/contracts/dist/index.js
import { z as z3 } from "zod";
import { z as z22 } from "zod";
import { z as z4 } from "zod";
import { z as z32 } from "zod";
import { z as z9 } from "zod";
import { z as z5 } from "zod";
import { z as z6 } from "zod";
import { z as z8 } from "zod";
import { z as z7 } from "zod";
import { z as z10 } from "zod";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
var piPathStatusSchema = z3.object({
  path: z3.string(),
  exists: z3.boolean(),
  type: z3.enum(["file", "directory"]),
  required: z3.boolean()
});
var extensionDiagnosticSchema = z3.object({
  path: z3.string(),
  resolvedPath: z3.string(),
  tools: z3.array(z3.string()),
  commands: z3.array(z3.string()),
  supportedHooks: z3.array(z3.string()),
  unsupportedHooks: z3.array(z3.string())
});
var count = z3.number().int().nonnegative();
var strings = z3.array(z3.string());
var piDiagnosticsReportSchema = z3.object({
  version: z3.string(),
  durableVersion: z3.string(),
  agentDir: z3.string(),
  paths: z3.record(z3.string(), piPathStatusSchema),
  settings: z3.object({
    defaultProvider: z3.string().optional(),
    defaultModel: z3.string().optional(),
    thinkingLevel: z3.string().optional(),
    packages: strings,
    extensions: strings
  }),
  models: z3.object({ total: count, providers: strings, defaultModelAvailable: z3.boolean() }),
  extensions: z3.object({
    total: count,
    errors: z3.array(z3.object({ path: z3.string(), error: z3.string() })),
    warnings: z3.array(z3.object({ path: z3.string(), warning: z3.string() })),
    items: z3.array(extensionDiagnosticSchema)
  }),
  skills: z3.object({ total: count, sample: strings }),
  tools: z3.object({ total: count, system: strings, custom: strings, mcp: strings }),
  status: z3.enum(["healthy", "warning", "error"]),
  summary: z3.string()
});
var runnerChannelSchema = z22.discriminatedUnion("kind", [
  z22.object({ kind: z22.literal("ready"), ready: z22.boolean().optional() }).passthrough(),
  z22.object({ kind: z22.literal("model-scope"), scopedModelIds: z22.array(z22.string()).optional(), defaultModelId: z22.string().optional() }).passthrough(),
  z22.object({ kind: z22.literal("reply"), id: z22.union([z22.string(), z22.number()]), result: z22.unknown().optional(), error: z22.unknown().optional() }).passthrough(),
  z22.object({
    kind: z22.literal("tool_call_request"),
    callId: z22.string(),
    toolName: z22.string(),
    arguments: z22.unknown().default({})
  }).passthrough(),
  z22.object({
    kind: z22.literal("tool_call_response"),
    callId: z22.string(),
    result: z22.unknown().optional(),
    isError: z22.boolean().optional()
  }).passthrough(),
  z22.object({
    kind: z22.literal("interaction_request"),
    id: z22.union([z22.string(), z22.number()]),
    interactionKind: z22.string().optional(),
    dialogKind: z22.string().optional(),
    title: z22.string().optional(),
    message: z22.string().optional(),
    data: z22.unknown().optional()
  }).passthrough(),
  z22.object({
    kind: z22.literal("interaction_response"),
    id: z22.union([z22.string(), z22.number()]),
    result: z22.unknown().optional(),
    error: z22.unknown().optional()
  }).passthrough()
]);
var runnerBridgeRequestSchema = z22.object({
  kind: z22.literal("request"),
  id: z22.union([z22.string(), z22.number()]),
  method: z22.string(),
  params: z22.unknown().optional()
}).passthrough();
var knownChannelKinds = new Set(runnerChannelSchema.options.map((schema) => schema.shape.kind.value));
var conversationIdSchema = z32.union([z32.number().int().positive(), z32.string().regex(/^[1-9]\d*$/)]);
var cumulativeUsageSchema = z32.object({
  totalTokens: z32.number(),
  inputTokens: z32.number(),
  outputTokens: z32.number(),
  cachedInputTokens: z32.number().optional(),
  cacheWriteInputTokens: z32.number().optional()
}).passthrough();
var wireContextSchema = z32.object({
  parentRef: z32.string().optional(),
  conversationId: conversationIdSchema.optional(),
  providerCheckpointId: z32.string().optional(),
  cumulativeUsage: cumulativeUsageSchema.optional(),
  aborted: z32.boolean().optional(),
  stopReason: z32.string().optional(),
  errorMessage: z32.string().optional()
}).passthrough();
var runnerCommandSchema = z4.object({
  type: z4.enum([
    "prompt",
    "steer",
    "abort",
    "abort_task",
    "compact",
    "set_subagent_policy",
    "get_available_models",
    "set_model",
    "set_thinking_level",
    "get_state",
    "get_session_stats",
    "register_binding",
    "get_all_bindings",
    "session_fork",
    "host_tool_result",
    "host_interaction_response"
  ]),
  id: z4.string().optional(),
  message: z4.string().optional(),
  images: z4.array(z4.object({ type: z4.literal("image"), data: z4.string(), mimeType: z4.string() })).optional(),
  streamingBehavior: z4.enum(["steer", "followUp"]).optional(),
  provider: z4.string().optional(),
  modelId: z4.string().optional(),
  instructions: z4.string().optional(),
  level: z4.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  conversationId: conversationIdSchema.optional(),
  threadId: z4.string().optional(),
  parentThreadId: z4.string().optional(),
  sessionId: z4.string().optional(),
  policyRecord: z4.unknown().optional(),
  taskId: z4.number().int().positive().optional(),
  sourceDir: z4.string().optional(),
  targetDir: z4.string().optional(),
  checkpointId: z4.union([z4.number(), z4.string()]).optional(),
  sourceProviderThreadId: z4.string().optional(),
  targetProviderThreadId: z4.string().optional(),
  callId: z4.string().optional(),
  result: z4.unknown().optional(),
  isError: z4.boolean().optional(),
  dialogKind: z4.string().optional(),
  interactionId: z4.string().optional()
}).passthrough();
var knownCommandTypes = new Set(runnerCommandSchema.shape.type.options);
var runnerRequestHeaderSchema = z4.object({ type: z4.string().min(1), id: z4.string().optional() }).passthrough();
var number = z5.number().optional();
var assistantUsageSchema = z5.object({
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  totalTokens: number,
  cost: z5.object({ input: number, output: number, cacheRead: number, cacheWrite: number, total: number }).passthrough().optional()
}).passthrough();
var assistantMessageSchema = z5.object({
  role: z5.literal("assistant"),
  content: z5.array(z5.discriminatedUnion("type", [
    z5.object({ type: z5.literal("text"), text: z5.string() }),
    z5.object({ type: z5.literal("thinking"), thinking: z5.string() }),
    z5.object({ type: z5.literal("toolCall"), id: z5.string(), name: z5.string(), arguments: z5.record(z5.string(), z5.unknown()) })
  ])),
  stopReason: z5.enum(["stop", "toolUse", "length", "aborted", "error"]).optional(),
  errorMessage: z5.string().optional(),
  usage: assistantUsageSchema.optional()
}).passthrough();
var contentIndex = z5.number().int().nonnegative();
var update = z5.discriminatedUnion("type", [
  z5.object({ type: z5.literal("thinking_delta"), contentIndex, delta: z5.string() }).passthrough(),
  z5.object({ type: z5.literal("thinking_end"), contentIndex, content: z5.string() }).passthrough(),
  z5.object({ type: z5.literal("text_delta"), contentIndex, delta: z5.string() }).passthrough(),
  z5.object({ type: z5.literal("thinking_start"), contentIndex }).passthrough(),
  z5.object({ type: z5.literal("text_start"), contentIndex }).passthrough(),
  z5.object({ type: z5.literal("text_end"), contentIndex, content: z5.string() }).passthrough()
]);
var messageUpdateSchema = wireContextSchema.extend({ type: z5.literal("message_update"), assistantMessageEvent: update });
var messageSchemas = [
  messageUpdateSchema,
  wireContextSchema.extend({ type: z5.literal("message_end"), message: assistantMessageSchema })
];
var tool = wireContextSchema.extend({
  toolCallId: z6.union([z6.string().min(1), z6.number().int().nonnegative()]),
  toolName: z6.string().min(1)
});
var toolStartSchema = tool.extend({ type: z6.literal("tool_execution_start"), args: z6.record(z6.string(), z6.unknown()) });
var toolUpdateSchema = tool.extend({
  type: z6.literal("tool_execution_update"),
  partialResult: z6.string(),
  trimStart: z6.number().optional(),
  details: z6.unknown().optional()
});
var toolEndSchema = tool.extend({
  type: z6.literal("tool_execution_end"),
  result: z6.string(),
  isError: z6.boolean(),
  args: z6.record(z6.string(), z6.unknown()).optional(),
  details: z6.unknown().optional()
});
var hostToolCallSchema = wireContextSchema.extend({
  type: z6.literal("host_tool_call"),
  callId: z6.string().min(1),
  toolName: z6.string().min(1),
  arguments: z6.record(z6.string(), z6.unknown()).default({})
});
var toolSchemas = [toolStartSchema, toolUpdateSchema, toolEndSchema, hostToolCallSchema];
var MAX_LIVE_NODES = 512;
var MAX_RECEIPTS = 128;
var MAX_LABEL_LENGTH = 160;
var MAX_PREVIEW_LENGTH = 500;
var MAX_SNAPSHOT_BYTES = 1048576;
var TASK_OUTCOMES = ["completed", "failed", "aborted", "faulted", "orphaned"];
var taskOutcomeSchema = z7.enum(TASK_OUTCOMES);
var LIVE_TASK_STATUSES = ["pending", "running", "waiting", "sleeping", "completing"];
var liveTaskStatusSchema = z7.enum(LIVE_TASK_STATUSES);
var BLOCKED_REASONS = ["missing_task", "task_too_old", "migration_failed", "restart_limit"];
var blockedReasonSchema = z7.enum(BLOCKED_REASONS);
var graphScopeSchema = z7.object({
  sessionId: z7.string().min(1).max(256),
  rootConversationId: z7.string().min(1).max(64),
  buildId: z7.string().min(1).max(64)
});
var graphObservationSchema = z7.object({
  epoch: z7.string().min(1).max(64),
  revision: z7.number().int().nonnegative(),
  observedAt: z7.number().int().positive(),
  completeness: z7.enum(["complete", "limited"])
});
var runtimeTaskStateSchema = z7.discriminatedUnion("status", [
  z7.object({
    status: z7.literal("pending"),
    phase: z7.string().max(64).optional()
  }),
  z7.object({
    status: z7.literal("running"),
    phase: z7.string().max(64).optional()
  }),
  z7.object({
    status: z7.literal("waiting"),
    phase: z7.string().max(64).optional(),
    on: z7.array(z7.number().int().positive()).max(MAX_LIVE_NODES),
    policy: z7.enum(["failFast", "allSettled", "all", "first"]).optional()
  }),
  z7.object({
    status: z7.literal("sleeping"),
    phase: z7.string().max(64).optional(),
    until: z7.number().int().positive()
  }),
  z7.object({
    status: z7.literal("completing"),
    outcome: taskOutcomeSchema
  })
]);
var taskTokensUsageSchema = z7.object({
  total: z7.number().int().nonnegative().optional(),
  input: z7.number().int().nonnegative().optional(),
  output: z7.number().int().nonnegative().optional(),
  reasoning: z7.number().int().nonnegative().optional(),
  cacheRead: z7.number().int().nonnegative().optional()
});
var runtimeTaskNodeSchema = z7.object({
  id: z7.number().int().positive(),
  kind: z7.string().min(1).max(64),
  conversationId: z7.number().int().positive(),
  owner: z7.number().int().positive().optional(),
  background: z7.boolean(),
  abortRequested: z7.boolean(),
  state: runtimeTaskStateSchema,
  blocked: blockedReasonSchema.optional(),
  label: z7.string().min(1).max(MAX_LABEL_LENGTH),
  startedAt: z7.number().int().positive().optional(),
  endedAt: z7.number().int().positive().optional(),
  durationMs: z7.number().int().nonnegative().optional(),
  toolName: z7.string().max(64).optional(),
  targetHint: z7.string().max(128).optional(),
  model: z7.object({
    provider: z7.string().max(64),
    modelId: z7.string().max(128)
  }).optional(),
  thinkingLevel: z7.string().max(32).optional(),
  tokens: taskTokensUsageSchema.optional()
});
var runtimeConversationNodeSchema = z7.object({
  id: z7.number().int().positive(),
  owner: z7.object({
    conversationId: z7.number().int().positive(),
    taskId: z7.number().int().positive()
  }).optional(),
  parent: z7.object({
    conversationId: z7.number().int().positive(),
    at: z7.number().int().positive()
  }).optional()
});
var runtimeTaskReceiptSchema = z7.object({
  taskId: z7.number().int().positive(),
  conversationId: z7.number().int().positive(),
  owner: z7.number().int().positive().optional(),
  kind: z7.string().min(1).max(64),
  outcome: taskOutcomeSchema,
  isToolError: z7.boolean().optional(),
  error: z7.object({
    message: z7.string().max(1024),
    code: z7.string().max(64).optional()
  }).optional(),
  endedAt: z7.number().int().positive(),
  durationMs: z7.number().int().nonnegative().optional(),
  preview: z7.string().max(MAX_PREVIEW_LENGTH).optional(),
  toolName: z7.string().max(64).optional(),
  targetHint: z7.string().max(128).optional(),
  startedAt: z7.number().int().positive().optional(),
  tokens: taskTokensUsageSchema.optional()
});
var runtimeGraphStatsSchema = z7.object({
  liveCount: z7.number().int().nonnegative(),
  terminalCount: z7.number().int().nonnegative(),
  totalCount: z7.number().int().nonnegative()
});
function getUtf8ByteLength(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(str, "utf8");
  }
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str).length;
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 127) bytes += 1;
    else if (code <= 2047) bytes += 2;
    else if (code >= 55296 && code <= 56319) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
var runtimeGraphSnapshotSchema = z7.object({
  version: z7.literal(1),
  scope: graphScopeSchema,
  observation: graphObservationSchema,
  nodes: z7.record(z7.string(), runtimeTaskNodeSchema).refine((nodes) => Object.keys(nodes).length <= MAX_LIVE_NODES, {
    message: `Live nodes exceed maximum of ${MAX_LIVE_NODES}`
  }),
  conversations: z7.record(z7.string(), runtimeConversationNodeSchema),
  receipts: z7.array(runtimeTaskReceiptSchema).max(MAX_RECEIPTS),
  stats: runtimeGraphStatsSchema
}).refine(
  (snapshot) => {
    try {
      const json = JSON.stringify(snapshot);
      return getUtf8ByteLength(json) <= MAX_SNAPSHOT_BYTES;
    } catch {
      return false;
    }
  },
  { message: "Runtime graph snapshot exceeds 1 MiB payload limit" }
);
var runtimeGraphSnapshotEventSchema = wireContextSchema.extend({
  type: z8.literal("runtime_graph_snapshot"),
  snapshot: runtimeGraphSnapshotSchema
});
var hostInteractionRequestSchema = wireContextSchema.extend({
  type: z8.literal("host_interaction_request"),
  id: z8.union([z8.string().min(1), z8.number().int()]),
  interactionId: z8.string().min(1).optional(),
  dialogKind: z8.string().min(1),
  interactionKind: z8.string().optional(),
  title: z8.string().optional(),
  message: z8.string().optional(),
  data: z8.unknown().optional()
});
var turnCompleteSchema = wireContextSchema.extend({
  type: z8.literal("turn_complete"),
  status: z8.enum(["completed", "aborted", "error"]),
  requestId: z8.string().min(1),
  error: z8.string().optional()
});
var lifecycleSchemas = [
  wireContextSchema.extend({ type: z8.literal("agent_start") }),
  wireContextSchema.extend({ type: z8.literal("context_window"), usedTokens: z8.number().nullable().optional(), contextWindow: z8.number() }),
  wireContextSchema.extend({ type: z8.literal("turn_start") }),
  wireContextSchema.extend({ type: z8.literal("turn_end"), message: assistantMessageSchema.optional(), contextWindow: z8.number().optional() }),
  wireContextSchema.extend({ type: z8.literal("agent_end"), messages: z8.array(assistantMessageSchema), message: assistantMessageSchema.optional(), contextWindow: z8.number().optional() }),
  wireContextSchema.extend({ type: z8.literal("compaction_start"), reason: z8.enum(["manual", "threshold"]) }),
  wireContextSchema.extend({ type: z8.literal("compaction_end"), reason: z8.enum(["manual", "threshold"]), aborted: z8.boolean() }),
  wireContextSchema.extend({ type: z8.literal("auto_retry_start"), attempt: z8.number(), at: z8.number().optional() }),
  wireContextSchema.extend({ type: z8.literal("auto_retry_end"), attempt: z8.number(), success: z8.boolean().optional() }),
  runtimeGraphSnapshotEventSchema,
  hostInteractionRequestSchema,
  turnCompleteSchema
];
var sessionStatsSchema = z8.object({ contextUsage: z8.object({ tokens: z8.number().nullable(), contextWindow: z8.number() }) });
var runnerEventSchema = z9.discriminatedUnion("type", [...messageSchemas, ...toolSchemas, ...lifecycleSchemas]);
var knownEventTypes = new Set(runnerEventSchema.options.map((schema) => schema.shape.type.value));
var base = z10.object({ id: z10.string().optional(), type: z10.literal("response"), command: z10.string().min(1) });
var runnerResponseSchema = z10.discriminatedUnion("success", [
  base.extend({ success: z10.literal(true), data: z10.unknown().optional() }).passthrough(),
  base.extend({ success: z10.literal(false), error: z10.string() }).passthrough()
]);

// ../../../private/tmp/frozen-task-4b-round1-build/frozen-src/packages/runner/src/dispatch/normalizers.ts
function normalizeConversationId(raw) {
  if (raw === void 0 || raw === null) {
    return void 0;
  }
  const parsed = conversationIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new JsonRpcInvalidParamsError(
      `Invalid conversationId: must be a positive integer or non-zero digit string: ${String(raw)}`
    );
  }
  return String(parsed.data);
}
function extractPromptInput(params) {
  if (params.content !== void 0) {
    const content = params.content;
    if (typeof content === "string") {
      if (content.trim().length === 0) {
        throw new JsonRpcInvalidParamsError("Prompt content string must not be empty");
      }
      return content;
    }
    if (Array.isArray(content)) {
      if (content.length === 0) {
        throw new JsonRpcInvalidParamsError("Prompt content array must not be empty");
      }
      for (const part of content) {
        if (!part || typeof part !== "object") {
          throw new JsonRpcInvalidParamsError("Prompt content part must be an object");
        }
        if (part.type === "text") {
          if (typeof part.text !== "string" || part.text.trim().length === 0) {
            throw new JsonRpcInvalidParamsError("Prompt text part must contain non-empty text string");
          }
        } else if (part.type === "image") {
          if (typeof part.data !== "string" || typeof part.mimeType !== "string") {
            throw new JsonRpcInvalidParamsError("Prompt image part must contain data and mimeType strings");
          }
        } else {
          throw new JsonRpcInvalidParamsError(`Invalid prompt content part type: ${part.type}`);
        }
      }
      return content;
    }
    throw new JsonRpcInvalidParamsError("Prompt content must be a non-empty string or content parts array");
  }
  const msg = typeof params.message === "string" ? params.message : void 0;
  const imgs = Array.isArray(params.images) ? params.images : void 0;
  if (!msg && (!imgs || imgs.length === 0)) {
    throw new JsonRpcInvalidParamsError("Missing required prompt content, message, or images");
  }
  if (imgs) {
    for (const img of imgs) {
      if (!img || typeof img !== "object" || img.type !== "image" || typeof img.data !== "string" || typeof img.mimeType !== "string") {
        throw new JsonRpcInvalidParamsError("Invalid image in prompt images list");
      }
    }
  }
  if (!imgs || imgs.length === 0) {
    if (!msg || msg.trim().length === 0) {
      throw new JsonRpcInvalidParamsError("Prompt message must not be empty");
    }
    return msg;
  }
  if (!msg || msg.trim().length === 0) {
    return imgs;
  }
  return [{ type: "text", text: msg }, ...imgs];
}
function extractPromptOptions(params, forcedDeliverAs) {
  const rawConv = params.conversationId ?? params.options?.conversationId;
  const conversationId = normalizeConversationId(rawConv);
  let deliverAs = forcedDeliverAs;
  if (!deliverAs) {
    const rawDeliverAs = params.deliverAs ?? params.streamingBehavior ?? params.options?.deliverAs;
    if (rawDeliverAs !== void 0) {
      if (rawDeliverAs !== "steer" && rawDeliverAs !== "followUp") {
        throw new JsonRpcInvalidParamsError("deliverAs must be 'steer' or 'followUp'");
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

// ../../../private/tmp/frozen-task-4b-round1-build/frozen-src/packages/runner/src/dispatch/session-dispatcher.ts
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
        const conversationId = normalizeConversationId(params.conversationId);
        await coordinator.abort(conversationId);
        return { ok: true };
      }
      case "session/abortTask": {
        const taskId = params.taskId;
        if (typeof taskId !== "number" || !Number.isInteger(taskId) || taskId <= 0) {
          throw new JsonRpcInvalidParamsError("Missing or invalid taskId: must be a positive integer");
        }
        await engine.abortTask(taskId);
        return { ok: true };
      }
      case "session/compact": {
        let instructions;
        if (params.instructions !== void 0 && params.instructions !== null) {
          if (typeof params.instructions !== "string") {
            throw new JsonRpcInvalidParamsError("instructions must be a string");
          }
          instructions = params.instructions;
        }
        await engine.compact(instructions);
        return { ok: true };
      }
      case "subagent/setPolicy":
      case "session/setSubagentPolicy": {
        const target = params.policyRecord ?? params.record ?? params;
        const parsed = subagentPolicyRecordSchema.safeParse(target);
        if (!parsed.success) {
          throw new JsonRpcInvalidParamsError(`Invalid subagent policy record: ${parsed.error.message}`);
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
          throw new JsonRpcInvalidParamsError("Missing or invalid provider or modelId");
        }
        await engine.setModel({ provider: provider.trim(), modelId: modelId.trim() });
        return { ok: true };
      }
      case "models/setThinking": {
        const level = params.level;
        const validLevels = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
        if (typeof level !== "string" || !validLevels.has(level)) {
          throw new JsonRpcInvalidParamsError(
            "Missing or invalid thinking level: must be one of off, minimal, low, medium, high, xhigh"
          );
        }
        await engine.setThinkingLevel(level);
        return { ok: true };
      }
      case "session/getState": {
        const conversationId = normalizeConversationId(params.conversationId);
        return await coordinator.getState(conversationId);
      }
      case "session/getTranscript": {
        const conversationId = normalizeConversationId(params.conversationId);
        let limit;
        if (params.limit !== void 0 && params.limit !== null) {
          if (typeof params.limit !== "number" || !Number.isInteger(params.limit) || params.limit < 0) {
            throw new JsonRpcInvalidParamsError("limit must be a non-negative integer");
          }
          limit = params.limit;
        }
        return await coordinator.getTranscript(conversationId, limit);
      }
      case "session/getStats": {
        const conversationId = normalizeConversationId(params.conversationId);
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
        throw new JsonRpcMethodNotFoundError(method);
    }
  };
}

// ../../../private/tmp/frozen-task-4b-round1-build/consumer-src/driver.ts
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
      text: "fixture transcript root sample"
    },
    {
      id: "fixture_entry_2",
      conversationId: "42",
      kind: "prompt",
      role: "user",
      text: "fixture transcript child sample"
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
    const targetConv = conversationId ?? "1";
    const filtered = this.entries.filter((e) => e.conversationId === targetConv);
    const sliced = limit !== void 0 ? filtered.slice(0, limit) : filtered;
    return {
      conversationId: targetConv,
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
