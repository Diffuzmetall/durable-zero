// packages/runner/src/cli-args.ts
function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--session" && i + 1 < argv.length) args.session = argv[++i];
    else if (arg === "--session-dir" && i + 1 < argv.length) args.sessionDir = argv[++i];
    else if (arg === "--cwd" && i + 1 < argv.length) args.cwd = argv[++i];
    else if (arg === "--provider" && i + 1 < argv.length) args.provider = argv[++i];
    else if (arg === "--model" && i + 1 < argv.length) args.model = argv[++i];
    else if (arg === "--thinking" && i + 1 < argv.length) args.thinking = argv[++i];
    else if (arg === "--no-session") args.noSession = true;
    else if (arg === "--continue") args.continueSession = true;
    else if (arg.startsWith("-")) {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) i++;
    } else if (!args.cwd) {
      args.cwd = arg;
    }
  }
  return args;
}

// packages/runner/src/composition.ts
import { resolve as resolve5 } from "node:path";

// packages/protocol/dist/index.js
import { z } from "zod";
import "zod";
import "node:stream";
import { StringDecoder } from "node:string_decoder";
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
});
var jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
});
var StdioJsonRpcServer = class {
  stdin;
  stdout;
  handler;
  decoder = new StringDecoder("utf8");
  buffer = "";
  nextRequestId = 0;
  pendingOutbound = /* @__PURE__ */ new Map();
  onDataHandler = (chunk) => {
    void this.handleChunk(chunk);
  };
  constructor(options) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.handler = options.handler;
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
    return new Promise((resolve6, reject) => {
      const timer = setTimeout(() => {
        this.pendingOutbound.delete(id);
        reject(new Error(`Request ${method} (id: ${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingOutbound.set(id, { resolve: resolve6, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  async handleChunk(chunk) {
    this.buffer += this.decoder.write(chunk);
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      await this.processLine(line);
    }
  }
  async processLine(line) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null && "id" in parsed && ("result" in parsed || "error" in parsed) && !("method" in parsed)) {
        const responseVal = jsonRpcResponseSchema.safeParse(parsed);
        if (responseVal.success) {
          const { id: id2, result, error } = responseVal.data;
          if (id2 !== null && this.pendingOutbound.has(id2)) {
            const pending = this.pendingOutbound.get(id2);
            clearTimeout(pending.timer);
            this.pendingOutbound.delete(id2);
            if (error) pending.reject(new Error(error.message));
            else pending.resolve(result);
            return;
          }
        } else if (parsed.id !== null && this.pendingOutbound.has(parsed.id)) {
          const pending = this.pendingOutbound.get(parsed.id);
          clearTimeout(pending.timer);
          this.pendingOutbound.delete(parsed.id);
          pending.reject(
            new Error(`Malformed JSON-RPC response from client: ${responseVal.error.message}`)
          );
          return;
        }
      }
      const validated = jsonRpcRequestSchema.safeParse(parsed);
      if (!validated.success) {
        const requestId = parsed && typeof parsed === "object" && "id" in parsed && (typeof parsed.id === "string" || typeof parsed.id === "number") ? parsed.id : null;
        this.sendError(requestId, -32600, "Invalid Request");
        return;
      }
      const { id, method, params } = validated.data;
      try {
        const result = await this.handler(method, params ?? {});
        this.sendResult(id, result);
      } catch (err) {
        this.sendError(id, -32603, err instanceof Error ? err.message : String(err));
      }
    } catch {
      this.sendError(null, -32700, "Parse error");
    }
  }
  sendResult(id, result) {
    this.send({ jsonrpc: "2.0", id, result });
  }
  sendError(id, code, message) {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }
};

// packages/core/dist/index.js
import { resolveModelScopeWithDiagnostics } from "@earendil-works/pi-coding-agent";
import {
  createRegistry
} from "@earendil-works/pi-durable";
import { createToolSearchExtension } from "@earendil-works/pi-durable/tool-search";
import {
  resolveCliModel
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { defineExtension, section } from "@earendil-works/pi-durable";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  formatSkillsForPrompt
} from "@earendil-works/pi-coding-agent";
import { createCodingTools, CodingTools } from "@earendil-works/pi-durable/tools";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import { Type } from "@sinclair/typebox";
import {
  configure,
  defineExtension as defineExtension2,
  defineTool
} from "@earendil-works/pi-durable";
import {
  AssistantEntry,
  defineDoc
} from "@earendil-works/pi-durable";
import {
  AssistantEntry as AssistantEntry2,
  defineTask as defineTask2
} from "@earendil-works/pi-durable";
import { defineTask } from "@earendil-works/pi-durable";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join as join2, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  ROOT_CONVERSATION_ID
} from "@earendil-works/pi-durable";
import { clampThinkingLevel, getSupportedThinkingLevels as getSupportedThinkingLevels2 } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  initTheme
} from "@earendil-works/pi-coding-agent";
import {
  createMcpExtension,
  ExtensionRunner,
  ModelRegistry,
  SessionManager
} from "@earendil-works/pi-coding-agent";
import {
  createMcpExtension as createMcpExtension2
} from "@earendil-works/pi-coding-agent";
import {
  defineExtension as defineExtension3,
  defineTool as defineTool2
} from "@earendil-works/pi-durable";
import { Value } from "@sinclair/typebox/value";
import "@earendil-works/pi-coding-agent";
import { Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { defineDoc as defineDoc2 } from "@earendil-works/pi-durable";
import { z as z2 } from "zod";
import "@earendil-works/pi-durable";
import { NestedCallDoc } from "@earendil-works/pi-durable";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";
import {
  ROOT_CONVERSATION_ID as ROOT_CONVERSATION_ID2
} from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT as BACKGROUND_CONTEXT2 } from "@earendil-works/chord/context";
import { defineDoc as defineDoc3 } from "@earendil-works/pi-durable";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT_CONVERSATION_ID as ROOT_CONVERSATION_ID3 } from "@earendil-works/pi-durable";
import { z as z22 } from "zod";
import { z as z3 } from "zod";
import { z as z5 } from "zod";
import { z as z4 } from "zod";
import { z as z10 } from "zod";
import { z as z6 } from "zod";
import { z as z7 } from "zod";
import { z as z9 } from "zod";
import { z as z8 } from "zod";
import { z as z11 } from "zod";
import { existsSync as existsSync3, mkdirSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join as join4, resolve as resolve2 } from "node:path";
import { ROOT_CONVERSATION_ID as ROOT_CONVERSATION_ID5 } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT as BACKGROUND_CONTEXT4 } from "@earendil-works/chord/context";
import { ROOT_CONVERSATION_ID as ROOT_CONVERSATION_ID4 } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT as BACKGROUND_CONTEXT3 } from "@earendil-works/chord/context";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import { getPackageDir } from "@earendil-works/pi-coding-agent";
import { join as join5 } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "node:fs";
var CANONICAL_TOOL_DEFS = {
  read: createReadToolDefinition(process.cwd()),
  write: createWriteToolDefinition(process.cwd()),
  edit: createEditToolDefinition(process.cwd()),
  bash: createBashToolDefinition(process.cwd()),
  codemode: {
    promptSnippet: "Run JavaScript in a sandbox to call other tools. Use it to batch, chain, or loop tool calls without roundtrips.",
    promptGuidelines: [
      "Use codemode to batch independent tool calls (Promise.allSettled), chain them, or filter large output, instead of many separate calls."
    ]
  },
  tool_search: {
    promptSnippet: "Search for deferred tools by keyword or concept and load matching tools for subsequent calls.",
    promptGuidelines: ["Use tool_search to discover and activate deferred tools before calling them."]
  },
  subagent: {
    promptSnippet: "Delegate a self-contained task to an async subagent. Uses the configured runtime subagent model policy (inherits parent model or uses provider-configured model). Runs in the background by default without blocking the conversation.",
    promptGuidelines: [
      "Use subagent to run background tasks asynchronously, or with background: false for immediate synchronous results."
    ]
  }
};
var CodemodeExtension = class {
  id = "codemode";
  name = "Codemode";
  version = "1.0.0";
  #activeSandbox;
  #sandboxes = /* @__PURE__ */ new Set();
  #contextSandboxes = /* @__PURE__ */ new WeakMap();
  get sandbox() {
    return this.#activeSandbox;
  }
  getSandboxFor(ctx) {
    return this.#contextSandboxes.get(ctx);
  }
  register(ctx) {
    if (!ctx.registry) return;
    const sandbox = new CodemodeSandbox();
    this.#activeSandbox = sandbox;
    this.#sandboxes.add(sandbox);
    this.#contextSandboxes.set(ctx, sandbox);
    const ext = createCodemodeExtension({
      sandbox,
      get namespaces() {
        return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
      }
    });
    ctx.registry.install(ext);
  }
  async teardown() {
    const sandboxes = Array.from(this.#sandboxes);
    this.#sandboxes.clear();
    this.#activeSandbox = void 0;
    for (const sb of sandboxes) {
      const target = sb;
      if (typeof target.close === "function") {
        await target.close();
      } else if (typeof target.dispose === "function") {
        await target.dispose();
      }
    }
  }
};
var codemodeExtension = new CodemodeExtension();
var SubagentsDoc = defineDoc({
  kind: "durable.subagents",
  version: 1,
  scope: "conversation",
  checkpointWhen: () => false,
  history: "latest",
  fork: "initial",
  initial: () => ({ agents: {} })
});
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function extractAssistantText(entry) {
  if (!isRecord(entry) || !Array.isArray(entry.model) || entry.model.length === 0) return "";
  const firstMessage = entry.model[0];
  if (!isRecord(firstMessage) || !Array.isArray(firstMessage.content)) return "";
  return firstMessage.content.flatMap((p) => isRecord(p) && p.type === "text" && typeof p.text === "string" ? [p.text] : []).join("");
}
function isWatchCall(item) {
  return typeof item === "object" && item !== null && "kind" in item && item.kind === "value" && "value" in item;
}
function unwrapWatchValue(item) {
  if (isWatchCall(item)) {
    return item.value;
  }
  return item;
}
var GATHER_MS = 50;
var DEFAULT_HOLD_TIMEOUT_MS = 5e3;
function courierIsIdle(active) {
  return active === void 0 || active.state.status === "terminal";
}
function asExtensionTask(task, extensionName) {
  return Object.assign(task, { name: extensionName, tasks: [task] });
}
function courierFor(admit, holdTimeoutMs = DEFAULT_HOLD_TIMEOUT_MS) {
  const task = defineTask({
    name: "durable.subagent-courier",
    version: 1,
    initial: () => ({ phase: "gather" }),
    phases: {
      gather: (_task, runtime, context) => runtime.sleepUntil(runtime.now() + GATHER_MS, { phase: "next" }, context),
      next: async (task2, runtime, context) => runtime.commit(async (tx) => {
        const state = await tx.doc(SubagentsDoc, runtime.conversationId);
        if (state.deliveryHold !== void 0) return { status: "running", checkpoint: { phase: "hold" } };
        if (state.sending === void 0) {
          const reports = state.outbox ?? [];
          if (reports.length === 0) {
            if (state.courier === task2.id) delete state.courier;
            return { status: "terminal", outcome: { status: "completed", result: null } };
          }
          const batch = (state.batchNumber ?? 0) + 1;
          state.batchNumber = batch;
          state.outbox = [];
          state.sending = { requestId: `subagent-batch:${task2.id}:${batch}`, reports };
        } else {
          const attempt = (state.sending.attempt ?? 0) + 1;
          state.sending.attempt = attempt;
          const batch = state.batchNumber ?? 1;
          state.sending.requestId = `subagent-batch:${task2.id}:${batch}:r${attempt}`;
        }
        return { status: "running", checkpoint: { phase: "send" } };
      }, context),
      send: async (_task, runtime, context) => {
        const state = await runtime.snapshot(SubagentsDoc, runtime.conversationId, context);
        const sending = state?.sending;
        if (sending === void 0) {
          await runtime.commit(() => ({ status: "running", checkpoint: { phase: "next" } }), context);
          return;
        }
        const parent = await runtime.conversation(runtime.conversationId, context);
        try {
          await admit?.(parent, sending.requestId, context);
        } catch (error) {
          if (runtime.signal.aborted || context.abortSignal?.aborted) throw error;
          const reason = error instanceof Error ? error.message : String(error);
          await runtime.commit(async (tx) => {
            const current = await tx.doc(SubagentsDoc, runtime.conversationId);
            if (current.sending?.requestId === sending.requestId) {
              current.deliveryHold = { kind: "admission", requestId: sending.requestId, reason };
            }
            return { status: "running", checkpoint: { phase: "hold" } };
          }, context);
          return;
        }
        const prompt = sending.reports.map((r) => r.text).join("\n\n---\n\n");
        const content = `[Subagent Reports Available]:

${prompt}`;
        const submission = await parent.submit({ type: "input", content, whenBusy: "followUp", requestId: sending.requestId }, context);
        const settled = await submission.wait(context);
        return runtime.commit(async (tx) => {
          const current = await tx.doc(SubagentsDoc, runtime.conversationId);
          if (current.sending?.requestId !== sending.requestId) return { status: "running", checkpoint: { phase: "next" } };
          if (settled.status === "done") delete current.sending;
          else current.deliveryHold = { kind: "uncertain", requestId: sending.requestId, reason: `Delivery outcome uncertain: ${settled.status}` };
          return { status: "running", checkpoint: { phase: settled.status === "done" ? "next" : "hold" } };
        }, context);
      },
      hold: async (_task, runtime, context) => {
        const watch = await runtime.watchDoc(SubagentsDoc, runtime.conversationId, context);
        if (watch === void 0 || watch.value?.deliveryHold === void 0) {
          await watch?.stop();
          return runtime.commit(() => ({ status: "running", checkpoint: { phase: "next" } }), context);
        }
        try {
          await new Promise((resolve33) => {
            const timer = setTimeout(() => resolve33(), holdTimeoutMs);
            timer.unref?.();
            watch.start((rawCall) => {
              const v = unwrapWatchValue(rawCall);
              if (v?.deliveryHold === void 0) {
                clearTimeout(timer);
                resolve33();
              }
              return Promise.resolve();
            });
            void watch.closed.then(() => {
              clearTimeout(timer);
              resolve33();
            });
          });
        } finally {
          await watch.stop();
        }
        return runtime.commit(async (tx) => {
          const current = await tx.doc(SubagentsDoc, runtime.conversationId);
          delete current.deliveryHold;
          return { status: "running", checkpoint: { phase: "next" } };
        }, context);
      }
    },
    abort: (_t, rt, ctx) => rt.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), ctx)
  });
  return asExtensionTask(task, "durable.subagent-courier");
}
var BACKGROUND = { ownership: { kind: "conversation" }, background: true };
var Anchor = asExtensionTask(
  defineTask2({
    name: "durable.subagent-anchor",
    version: 1,
    initial: () => ({ phase: "done" }),
    phases: { done: (_t, rt, ctx) => rt.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), ctx) },
    abort: (_t, rt, ctx) => rt.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), ctx)
  }),
  "durable.subagent-anchor"
);
function reporterFor(courier, admit) {
  const task = defineTask2({
    name: "durable.subagent-reporter",
    version: 1,
    initial: () => ({ phase: "deliver" }),
    phases: {
      deliver: async (task2, runtime, context) => {
        const child = await runtime.conversation(task2.input.conversationId, context);
        await admit?.(child, task2.input.requestId, context);
        const submission = await child.submit({ type: "input", content: task2.input.task, requestId: task2.input.requestId }, context);
        const settled = await submission.wait(context);
        return runtime.commit(async (tx) => {
          const doc = await tx.doc(SubagentsDoc, runtime.conversationId);
          doc.agents ??= {};
          const record = doc.agents[task2.input.key] ?? {
            name: task2.input.task.trim(),
            conversationId: task2.input.conversationId,
            requestId: task2.input.requestId,
            task: task2.input.task,
            role: "worker",
            ownerTaskId: task2.id,
            background: true
          };
          doc.agents[task2.input.key] = record;
          let text = `Subagent ${record.name} failed: ${settled.status}`;
          if (settled.status === "unanswered") text += ` (${settled.reason ?? "unknown"})`;
          if (settled.status === "done" && settled.type === "input") {
            text = `Subagent ${record.name} answered: ` + extractAssistantText(await tx.entry(AssistantEntry2, settled.answer));
          }
          record.report = text;
          record.settled = true;
          return { status: "running", checkpoint: { phase: "report", text } };
        }, context);
      },
      report: async (task2, runtime, context) => runtime.commit(async (tx) => {
        const state = await tx.doc(SubagentsDoc, runtime.conversationId);
        const reportId = String(task2.id);
        if (!(state.outbox ?? []).some((report) => report.id === reportId)) {
          const name = state.agents[task2.input.key]?.name ?? task2.input.key;
          state.outbox = [...state.outbox ?? [], { id: reportId, name, text: task2.state.checkpoint.text }];
        }
        const active = state.courier === void 0 ? void 0 : await tx.task(state.courier);
        if (courierIsIdle(active)) state.courier = await tx.createTask(courier, null, BACKGROUND);
        return { status: "terminal", outcome: { status: "completed", result: null } };
      }, context)
    },
    abort: (_t, rt, ctx) => rt.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), ctx)
  });
  return asExtensionTask(task, "durable.subagent-reporter");
}
var DefaultCourier = courierFor();
var DefaultReporter = reporterFor(DefaultCourier);
var SchemaPort = class {
  coerce(schema, value) {
    if (!value || typeof value !== "object" || !schema) {
      return value;
    }
    try {
      return Value.Convert(schema, value);
    } catch {
      return value;
    }
  }
  validate(schema, value) {
    if (!schema) {
      return { isValid: true };
    }
    try {
      const s = schema;
      const isValid = Value.Check(s, value);
      if (isValid) {
        return { isValid: true };
      }
      const errors = [];
      for (const err of Value.Errors(s, value)) {
        const errObj = err;
        const rawPath = errObj.path;
        const path22 = rawPath ? rawPath.replace(/^\//, "") : "root";
        errors.push(`- ${path22}: ${errObj.message ?? "validation error"}`);
      }
      return { isValid: false, errors };
    } catch (err) {
      return {
        isValid: false,
        errors: [`- schema: ${err instanceof Error ? err.message : String(err)}`]
      };
    }
  }
};
var schemaPort = new SchemaPort();
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
var SubagentPolicyAckDoc = defineDoc2({
  kind: "durable.subagent-policy-ack",
  version: 1,
  scope: "session",
  checkpointWhen: () => false,
  initial: () => ({ record: null })
});
var BindingDoc = defineDoc3({
  kind: "durable.binding",
  version: 2,
  scope: "conversation",
  checkpointWhen: () => false,
  history: "latest",
  fork: "initial",
  initial: () => ({ binding: null })
});
var BindingIndexDoc = defineDoc3({
  kind: "durable.binding-index",
  version: 1,
  scope: "session",
  checkpointWhen: () => false,
  initial: () => ({ byIdentity: {}, byThreadId: {} })
});
var esmRequire = createRequire(import.meta.url);
var currentDir = dirname(fileURLToPath(import.meta.url));
var piPathStatusSchema = z22.object({
  path: z22.string(),
  exists: z22.boolean(),
  type: z22.enum(["file", "directory"]),
  required: z22.boolean()
});
var extensionDiagnosticSchema = z22.object({
  path: z22.string(),
  resolvedPath: z22.string(),
  tools: z22.array(z22.string()),
  commands: z22.array(z22.string()),
  supportedHooks: z22.array(z22.string()),
  unsupportedHooks: z22.array(z22.string())
});
var count = z22.number().int().nonnegative();
var strings = z22.array(z22.string());
var piDiagnosticsReportSchema = z22.object({
  version: z22.string(),
  durableVersion: z22.string(),
  agentDir: z22.string(),
  paths: z22.record(z22.string(), piPathStatusSchema),
  settings: z22.object({
    defaultProvider: z22.string().optional(),
    defaultModel: z22.string().optional(),
    thinkingLevel: z22.string().optional(),
    packages: strings,
    extensions: strings
  }),
  models: z22.object({ total: count, providers: strings, defaultModelAvailable: z22.boolean() }),
  extensions: z22.object({
    total: count,
    errors: z22.array(z22.object({ path: z22.string(), error: z22.string() })),
    warnings: z22.array(z22.object({ path: z22.string(), warning: z22.string() })),
    items: z22.array(extensionDiagnosticSchema)
  }),
  skills: z22.object({ total: count, sample: strings }),
  tools: z22.object({ total: count, system: strings, custom: strings, mcp: strings }),
  status: z22.enum(["healthy", "warning", "error"]),
  summary: z22.string()
});
var runnerChannelSchema = z3.discriminatedUnion("kind", [
  z3.object({ kind: z3.literal("ready"), ready: z3.boolean().optional() }).passthrough(),
  z3.object({ kind: z3.literal("model-scope"), scopedModelIds: z3.array(z3.string()).optional(), defaultModelId: z3.string().optional() }).passthrough(),
  z3.object({ kind: z3.literal("reply"), id: z3.union([z3.string(), z3.number()]), result: z3.unknown().optional(), error: z3.unknown().optional() }).passthrough(),
  z3.object({
    kind: z3.literal("tool_call_request"),
    callId: z3.string(),
    toolName: z3.string(),
    arguments: z3.unknown().default({})
  }).passthrough(),
  z3.object({
    kind: z3.literal("tool_call_response"),
    callId: z3.string(),
    result: z3.unknown().optional(),
    isError: z3.boolean().optional()
  }).passthrough(),
  z3.object({
    kind: z3.literal("interaction_request"),
    id: z3.union([z3.string(), z3.number()]),
    interactionKind: z3.string().optional(),
    dialogKind: z3.string().optional(),
    title: z3.string().optional(),
    message: z3.string().optional(),
    data: z3.unknown().optional()
  }).passthrough(),
  z3.object({
    kind: z3.literal("interaction_response"),
    id: z3.union([z3.string(), z3.number()]),
    result: z3.unknown().optional(),
    error: z3.unknown().optional()
  }).passthrough()
]);
var runnerBridgeRequestSchema = z3.object({
  kind: z3.literal("request"),
  id: z3.union([z3.string(), z3.number()]),
  method: z3.string(),
  params: z3.unknown().optional()
}).passthrough();
var knownChannelKinds = new Set(runnerChannelSchema.options.map((schema) => schema.shape.kind.value));
var conversationIdSchema = z4.union([z4.number().int().positive(), z4.string().regex(/^[1-9]\d*$/)]);
var cumulativeUsageSchema = z4.object({
  totalTokens: z4.number(),
  inputTokens: z4.number(),
  outputTokens: z4.number(),
  cachedInputTokens: z4.number().optional(),
  cacheWriteInputTokens: z4.number().optional()
}).passthrough();
var wireContextSchema = z4.object({
  parentRef: z4.string().optional(),
  conversationId: conversationIdSchema.optional(),
  providerCheckpointId: z4.string().optional(),
  cumulativeUsage: cumulativeUsageSchema.optional(),
  aborted: z4.boolean().optional(),
  stopReason: z4.string().optional(),
  errorMessage: z4.string().optional()
}).passthrough();
var runnerCommandSchema = z5.object({
  type: z5.enum([
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
  id: z5.string().optional(),
  message: z5.string().optional(),
  images: z5.array(z5.object({ type: z5.literal("image"), data: z5.string(), mimeType: z5.string() })).optional(),
  streamingBehavior: z5.enum(["steer", "followUp"]).optional(),
  provider: z5.string().optional(),
  modelId: z5.string().optional(),
  instructions: z5.string().optional(),
  level: z5.enum(["off", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  conversationId: conversationIdSchema.optional(),
  threadId: z5.string().optional(),
  parentThreadId: z5.string().optional(),
  sessionId: z5.string().optional(),
  policyRecord: z5.unknown().optional(),
  taskId: z5.number().int().positive().optional(),
  sourceDir: z5.string().optional(),
  targetDir: z5.string().optional(),
  checkpointId: z5.union([z5.number(), z5.string()]).optional(),
  sourceProviderThreadId: z5.string().optional(),
  targetProviderThreadId: z5.string().optional(),
  callId: z5.string().optional(),
  result: z5.unknown().optional(),
  isError: z5.boolean().optional(),
  dialogKind: z5.string().optional(),
  interactionId: z5.string().optional()
}).passthrough();
var knownCommandTypes = new Set(runnerCommandSchema.shape.type.options);
var runnerRequestHeaderSchema = z5.object({ type: z5.string().min(1), id: z5.string().optional() }).passthrough();
var number = z6.number().optional();
var assistantUsageSchema = z6.object({
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  totalTokens: number,
  cost: z6.object({ input: number, output: number, cacheRead: number, cacheWrite: number, total: number }).passthrough().optional()
}).passthrough();
var assistantMessageSchema = z6.object({
  role: z6.literal("assistant"),
  content: z6.array(z6.discriminatedUnion("type", [
    z6.object({ type: z6.literal("text"), text: z6.string() }),
    z6.object({ type: z6.literal("thinking"), thinking: z6.string() }),
    z6.object({ type: z6.literal("toolCall"), id: z6.string(), name: z6.string(), arguments: z6.record(z6.string(), z6.unknown()) })
  ])),
  stopReason: z6.enum(["stop", "toolUse", "length", "aborted", "error"]).optional(),
  errorMessage: z6.string().optional(),
  usage: assistantUsageSchema.optional()
}).passthrough();
var contentIndex = z6.number().int().nonnegative();
var update = z6.discriminatedUnion("type", [
  z6.object({ type: z6.literal("thinking_delta"), contentIndex, delta: z6.string() }).passthrough(),
  z6.object({ type: z6.literal("thinking_end"), contentIndex, content: z6.string() }).passthrough(),
  z6.object({ type: z6.literal("text_delta"), contentIndex, delta: z6.string() }).passthrough(),
  z6.object({ type: z6.literal("thinking_start"), contentIndex }).passthrough(),
  z6.object({ type: z6.literal("text_start"), contentIndex }).passthrough(),
  z6.object({ type: z6.literal("text_end"), contentIndex, content: z6.string() }).passthrough()
]);
var messageUpdateSchema = wireContextSchema.extend({ type: z6.literal("message_update"), assistantMessageEvent: update });
var messageSchemas = [
  messageUpdateSchema,
  wireContextSchema.extend({ type: z6.literal("message_end"), message: assistantMessageSchema })
];
var tool = wireContextSchema.extend({
  toolCallId: z7.union([z7.string().min(1), z7.number().int().nonnegative()]),
  toolName: z7.string().min(1)
});
var toolStartSchema = tool.extend({ type: z7.literal("tool_execution_start"), args: z7.record(z7.string(), z7.unknown()) });
var toolUpdateSchema = tool.extend({
  type: z7.literal("tool_execution_update"),
  partialResult: z7.string(),
  trimStart: z7.number().optional(),
  details: z7.unknown().optional()
});
var toolEndSchema = tool.extend({
  type: z7.literal("tool_execution_end"),
  result: z7.string(),
  isError: z7.boolean(),
  args: z7.record(z7.string(), z7.unknown()).optional(),
  details: z7.unknown().optional()
});
var hostToolCallSchema = wireContextSchema.extend({
  type: z7.literal("host_tool_call"),
  callId: z7.string().min(1),
  toolName: z7.string().min(1),
  arguments: z7.record(z7.string(), z7.unknown()).default({})
});
var toolSchemas = [toolStartSchema, toolUpdateSchema, toolEndSchema, hostToolCallSchema];
var MAX_LIVE_NODES = 512;
var MAX_RECEIPTS = 128;
var MAX_LABEL_LENGTH = 160;
var MAX_PREVIEW_LENGTH = 500;
var MAX_SNAPSHOT_BYTES = 1048576;
var TASK_OUTCOMES = ["completed", "failed", "aborted", "faulted", "orphaned"];
var taskOutcomeSchema = z8.enum(TASK_OUTCOMES);
var LIVE_TASK_STATUSES = ["pending", "running", "waiting", "sleeping", "completing"];
var liveTaskStatusSchema = z8.enum(LIVE_TASK_STATUSES);
var BLOCKED_REASONS = ["missing_task", "task_too_old", "migration_failed", "restart_limit"];
var blockedReasonSchema = z8.enum(BLOCKED_REASONS);
var graphScopeSchema = z8.object({
  sessionId: z8.string().min(1).max(256),
  rootConversationId: z8.string().min(1).max(64),
  buildId: z8.string().min(1).max(64)
});
var graphObservationSchema = z8.object({
  epoch: z8.string().min(1).max(64),
  revision: z8.number().int().nonnegative(),
  observedAt: z8.number().int().positive(),
  completeness: z8.enum(["complete", "limited"])
});
var runtimeTaskStateSchema = z8.discriminatedUnion("status", [
  z8.object({
    status: z8.literal("pending"),
    phase: z8.string().max(64).optional()
  }),
  z8.object({
    status: z8.literal("running"),
    phase: z8.string().max(64).optional()
  }),
  z8.object({
    status: z8.literal("waiting"),
    phase: z8.string().max(64).optional(),
    on: z8.array(z8.number().int().positive()).max(MAX_LIVE_NODES),
    policy: z8.enum(["failFast", "allSettled", "all", "first"]).optional()
  }),
  z8.object({
    status: z8.literal("sleeping"),
    phase: z8.string().max(64).optional(),
    until: z8.number().int().positive()
  }),
  z8.object({
    status: z8.literal("completing"),
    outcome: taskOutcomeSchema
  })
]);
var taskTokensUsageSchema = z8.object({
  total: z8.number().int().nonnegative().optional(),
  input: z8.number().int().nonnegative().optional(),
  output: z8.number().int().nonnegative().optional(),
  reasoning: z8.number().int().nonnegative().optional(),
  cacheRead: z8.number().int().nonnegative().optional()
});
var runtimeTaskNodeSchema = z8.object({
  id: z8.number().int().positive(),
  kind: z8.string().min(1).max(64),
  conversationId: z8.number().int().positive(),
  owner: z8.number().int().positive().optional(),
  background: z8.boolean(),
  abortRequested: z8.boolean(),
  state: runtimeTaskStateSchema,
  blocked: blockedReasonSchema.optional(),
  label: z8.string().min(1).max(MAX_LABEL_LENGTH),
  startedAt: z8.number().int().positive().optional(),
  endedAt: z8.number().int().positive().optional(),
  durationMs: z8.number().int().nonnegative().optional(),
  toolName: z8.string().max(64).optional(),
  targetHint: z8.string().max(128).optional(),
  model: z8.object({
    provider: z8.string().max(64),
    modelId: z8.string().max(128)
  }).optional(),
  thinkingLevel: z8.string().max(32).optional(),
  tokens: taskTokensUsageSchema.optional()
});
var runtimeConversationNodeSchema = z8.object({
  id: z8.number().int().positive(),
  owner: z8.object({
    conversationId: z8.number().int().positive(),
    taskId: z8.number().int().positive()
  }).optional(),
  parent: z8.object({
    conversationId: z8.number().int().positive(),
    at: z8.number().int().positive()
  }).optional()
});
var runtimeTaskReceiptSchema = z8.object({
  taskId: z8.number().int().positive(),
  conversationId: z8.number().int().positive(),
  owner: z8.number().int().positive().optional(),
  kind: z8.string().min(1).max(64),
  outcome: taskOutcomeSchema,
  isToolError: z8.boolean().optional(),
  error: z8.object({
    message: z8.string().max(1024),
    code: z8.string().max(64).optional()
  }).optional(),
  endedAt: z8.number().int().positive(),
  durationMs: z8.number().int().nonnegative().optional(),
  preview: z8.string().max(MAX_PREVIEW_LENGTH).optional(),
  toolName: z8.string().max(64).optional(),
  targetHint: z8.string().max(128).optional(),
  startedAt: z8.number().int().positive().optional(),
  tokens: taskTokensUsageSchema.optional()
});
var runtimeGraphStatsSchema = z8.object({
  liveCount: z8.number().int().nonnegative(),
  terminalCount: z8.number().int().nonnegative(),
  totalCount: z8.number().int().nonnegative()
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
var runtimeGraphSnapshotSchema = z8.object({
  version: z8.literal(1),
  scope: graphScopeSchema,
  observation: graphObservationSchema,
  nodes: z8.record(z8.string(), runtimeTaskNodeSchema).refine((nodes) => Object.keys(nodes).length <= MAX_LIVE_NODES, {
    message: `Live nodes exceed maximum of ${MAX_LIVE_NODES}`
  }),
  conversations: z8.record(z8.string(), runtimeConversationNodeSchema),
  receipts: z8.array(runtimeTaskReceiptSchema).max(MAX_RECEIPTS),
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
  type: z9.literal("runtime_graph_snapshot"),
  snapshot: runtimeGraphSnapshotSchema
});
var hostInteractionRequestSchema = wireContextSchema.extend({
  type: z9.literal("host_interaction_request"),
  id: z9.union([z9.string().min(1), z9.number().int()]),
  interactionId: z9.string().min(1).optional(),
  dialogKind: z9.string().min(1),
  interactionKind: z9.string().optional(),
  title: z9.string().optional(),
  message: z9.string().optional(),
  data: z9.unknown().optional()
});
var lifecycleSchemas = [
  wireContextSchema.extend({ type: z9.literal("agent_start") }),
  wireContextSchema.extend({ type: z9.literal("context_window"), usedTokens: z9.number().nullable().optional(), contextWindow: z9.number() }),
  wireContextSchema.extend({ type: z9.literal("turn_start") }),
  wireContextSchema.extend({ type: z9.literal("turn_end"), message: assistantMessageSchema.optional(), contextWindow: z9.number().optional() }),
  wireContextSchema.extend({ type: z9.literal("agent_end"), messages: z9.array(assistantMessageSchema), message: assistantMessageSchema.optional(), contextWindow: z9.number().optional() }),
  wireContextSchema.extend({ type: z9.literal("compaction_start"), reason: z9.enum(["manual", "threshold"]) }),
  wireContextSchema.extend({ type: z9.literal("compaction_end"), reason: z9.enum(["manual", "threshold"]), aborted: z9.boolean() }),
  wireContextSchema.extend({ type: z9.literal("auto_retry_start"), attempt: z9.number(), at: z9.number().optional() }),
  wireContextSchema.extend({ type: z9.literal("auto_retry_end"), attempt: z9.number(), success: z9.boolean().optional() }),
  runtimeGraphSnapshotEventSchema,
  hostInteractionRequestSchema
];
var sessionStatsSchema = z9.object({ contextUsage: z9.object({ tokens: z9.number().nullable(), contextWindow: z9.number() }) });
var runnerEventSchema = z10.discriminatedUnion("type", [...messageSchemas, ...toolSchemas, ...lifecycleSchemas]);
var knownEventTypes = new Set(runnerEventSchema.options.map((schema) => schema.shape.type.value));
var base = z11.object({ id: z11.string().optional(), type: z11.literal("response"), command: z11.string().min(1) });
var runnerResponseSchema = z11.discriminatedUnion("success", [
  base.extend({ success: z11.literal(true), data: z11.unknown().optional() }).passthrough(),
  base.extend({ success: z11.literal(false), error: z11.string() }).passthrough()
]);
var SessionCoordinator = class {
  store;
  modelProvider;
  executionEnv;
  resourceLoader;
  isStarted = false;
  isClosed = false;
  isAborted = false;
  listeners = /* @__PURE__ */ new Set();
  constructor(options) {
    this.store = options.store;
    this.modelProvider = options.modelProvider;
    this.executionEnv = options.executionEnv;
    this.resourceLoader = options.resourceLoader;
  }
  async start() {
    await this.store.acquireLock();
    this.isStarted = true;
  }
  async prompt(content, _options) {
    if (this.isClosed) {
      throw new Error("Session is closed");
    }
    if (this.isAborted) {
      throw new Error("Session is aborted");
    }
    if (!this.isStarted) {
      throw new Error("Session is not started. Call start() before submitting prompts");
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Prompt content must be a non-empty string");
    }
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { status: "accepted", id };
  }
  emitEvent(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  events(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
  async abort() {
    this.isAborted = true;
    this.emitEvent({ type: "session/aborted" });
  }
  getState() {
    return {
      isStarted: this.isStarted,
      isAborted: this.isAborted,
      isClosed: this.isClosed,
      sessionDir: this.store.sessionDir
    };
  }
  async setSubagentPolicy(params) {
    await this.store.saveDocument("subagents", "policy_ack", params);
    return { ok: true };
  }
  async close() {
    this.isClosed = true;
    this.isStarted = false;
    this.listeners.clear();
    await this.store.releaseLock();
    await this.store.close();
  }
};

// packages/execution/dist/index.js
import { promises as fs2 } from "node:fs";
import * as path2 from "node:path";
import { exec, execFile } from "node:child_process";
var LocalNodeExecutionEnv = class {
  id;
  cwd;
  constructor(options) {
    this.id = options?.id ?? "local-node";
    this.cwd = options?.cwd ?? process.cwd();
  }
  resolvePath(filePath) {
    return path2.isAbsolute(filePath) ? filePath : path2.resolve(this.cwd, filePath);
  }
  async readFile(filePath) {
    return await fs2.readFile(this.resolvePath(filePath), "utf8");
  }
  async writeFile(filePath, content) {
    const fullPath = this.resolvePath(filePath);
    await fs2.mkdir(path2.dirname(fullPath), { recursive: true });
    await fs2.writeFile(fullPath, content, "utf8");
  }
  async exec(argvOrCommand, options, context) {
    return new Promise((resolve23) => {
      const execCwd = options?.cwd ?? this.cwd;
      const execEnv = { ...process.env, ...options?.env };
      const timeout = options?.timeoutMs ?? 3e4;
      let stdout = "";
      let stderr = "";
      const handleOutput = (chunk, isErr = false) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (isErr) stderr += text;
        else stdout += text;
        if (options?.onOutput) {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          options.onOutput(buf, context, { skipped: false });
        }
      };
      const child = typeof argvOrCommand === "string" ? exec(argvOrCommand, { cwd: execCwd, env: execEnv, timeout, signal: options?.signal }) : execFile(argvOrCommand[0], argvOrCommand.slice(1), {
        cwd: execCwd,
        env: execEnv,
        timeout,
        signal: options?.signal
      });
      child.stdout?.on("data", (chunk) => handleOutput(chunk, false));
      child.stderr?.on("data", (chunk) => handleOutput(chunk, true));
      child.on("error", (err) => {
        resolve23({
          ok: false,
          value: { exitCode: 1 },
          stdout,
          stderr: stderr || err.message,
          exitCode: 1
        });
      });
      child.on("close", (code) => {
        const exitCode = code ?? 0;
        resolve23({
          ok: exitCode === 0,
          value: { exitCode },
          stdout,
          stderr,
          exitCode
        });
      });
    });
  }
  async statFile(filePath) {
    const stat = await fs2.stat(this.resolvePath(filePath));
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs
    };
  }
  async listFiles(dirPath) {
    return await fs2.readdir(this.resolvePath(dirPath));
  }
  async cleanup(_context) {
  }
};

// packages/adapter-pi-durable/dist/index.js
import { basename as basename2, join as join32, resolve as resolve22 } from "node:path";
import { BACKGROUND_CONTEXT as BACKGROUND_CONTEXT5 } from "@earendil-works/chord/context";
import {
  createSession,
  defineDocFamily
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage as openNodeSqliteStorage2 } from "@earendil-works/pi-durable/storage/sqlite/node";
import { execFileSync as execFileSync2 } from "node:child_process";
import { readFile as readFile2, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { join as join6 } from "node:path";
import lockfile2 from "proper-lockfile";
import { existsSync as existsSync5, mkdirSync as mkdirSync2, readdirSync as readdirSync2, rmSync as rmSync2 } from "node:fs";
import { DatabaseSync as DatabaseSync2 } from "node:sqlite";
import { join as join22, resolve as resolve4 } from "node:path";
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { mkdir as mkdir2, readdir as readdir2, realpath as realpath2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename as basename22, join as join42, resolve as resolve32 } from "node:path";
var DurableHarnessError = class extends Error {
  code;
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
  }
};
var DurableStorageError = class extends DurableHarnessError {
  constructor(message, cause, code = "STORAGE_ERROR") {
    super(message, code, cause);
  }
};
function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function isVerifiedRunnerProcess(owner) {
  if (!isProcessAlive(owner.pid)) return false;
  try {
    const output = execFileSync2("ps", ["-p", String(owner.pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 1e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return output.includes("node") || output.includes("runner") || output.includes("durable") || output.includes("bb");
  } catch {
    return false;
  }
}
function logUnexpectedErr(err, allowedCode, context) {
  if (err?.code !== allowedCode) {
    console.warn(`[SessionStorage] ${context}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function writeOwnerFile(directory, owner) {
  await writeFile2(join6(directory, "session.owner.json"), JSON.stringify(owner, null, 2), "utf8");
}
async function readOwnerFile(directory) {
  try {
    const content = await readFile2(join6(directory, "session.owner.json"), "utf8");
    return JSON.parse(content);
  } catch (err) {
    logUnexpectedErr(err, "ENOENT", `Corrupted or unreadable session.owner.json in ${directory}`);
    return null;
  }
}
async function removeOwnerFile(directory) {
  await rm2(join6(directory, "session.owner.json"), { force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `Failed to remove owner file in ${directory}`)
  );
}
async function forceUnlock(directory) {
  await lockfile2.unlock(directory, { realpath: false }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `unlock warning for ${directory}`)
  );
  await rm2(`${directory}.lock`, { recursive: true, force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `lockfile cleanup warning for ${directory}`)
  );
}
async function acquireSessionLock(directory, cwd, id) {
  const lockOpts = { realpath: false, retries: { retries: 2, minTimeout: 100, maxTimeout: 200 } };
  let rawRelease;
  try {
    rawRelease = await lockfile2.lock(directory, lockOpts);
  } catch (initialErr) {
    let owner = await readOwnerFile(directory);
    if (!owner) {
      await new Promise((r) => setTimeout(r, 100));
      owner = await readOwnerFile(directory);
    }
    if (!owner) throw new Error(`Session is already open in another process: ${directory}`, { cause: initialErr });
    const isAlive = isProcessAlive(owner.pid);
    const isRunner = isAlive && isVerifiedRunnerProcess(owner);
    if (!isAlive || !isRunner) {
      await forceUnlock(directory);
      await removeOwnerFile(directory);
      try {
        rawRelease = await lockfile2.lock(directory, lockOpts);
      } catch (retryErr) {
        throw new DurableStorageError(`Session is already open in another process (PID: ${owner.pid}): ${directory}`, retryErr);
      }
    } else {
      throw new DurableStorageError(`Session is already open in another live process (PID: ${owner.pid}): ${directory}`, initialErr);
    }
  }
  await writeOwnerFile(directory, { pid: process.pid, id, cwd, startedAt: Date.now() });
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await removeOwnerFile(directory);
    } finally {
      await rawRelease();
    }
  };
}
function forkSessionDatabase(options) {
  let sourceDir = resolve4(options.sourceDir);
  if (sourceDir.endsWith(".sqlite")) {
    sourceDir = resolve4(sourceDir, "..");
  }
  const sourceDb = join22(sourceDir, "session.sqlite");
  if (!existsSync5(sourceDir) || !existsSync5(sourceDb)) {
    throw new Error(`Cannot fork: source session database not found for "${options.sourceDir}"`);
  }
  let targetDir = resolve4(options.targetDir);
  if (targetDir.endsWith(".sqlite")) {
    targetDir = resolve4(targetDir, "..");
  }
  mkdirSync2(targetDir, { recursive: true });
  const targetDb = join22(targetDir, "session.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) {
    const targetFile = `${targetDb}${suffix}`;
    if (existsSync5(targetFile)) rmSync2(targetFile, { force: true });
  }
  const sourceConn = new DatabaseSync2(sourceDb);
  try {
    try {
      sourceConn.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
    }
    const escapedTarget = targetDb.replace(/'/g, "''");
    sourceConn.exec(`VACUUM INTO '${escapedTarget}';`);
  } finally {
    sourceConn.close();
  }
  const db = new DatabaseSync2(targetDb);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    if (options.checkpointId !== void 0) {
      const entryId = Number(options.checkpointId);
      if (Number.isFinite(entryId) && entryId > 0) {
        const hasEntries = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "entries");
        if (hasEntries) {
          db.prepare("DELETE FROM entries WHERE id > ?").run(entryId);
        }
        const hasTasks = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "tasks");
        if (hasTasks) {
          db.prepare("DELETE FROM tasks WHERE id > ?").run(entryId);
        }
      }
    }
  } finally {
    db.close();
  }
  const targetLockDir = `${targetDir}.lock`;
  if (existsSync5(targetLockDir)) {
    rmSync2(targetLockDir, { recursive: true, force: true });
  }
  if (existsSync5(targetDir)) {
    const entries = readdirSync2(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.endsWith(".lock") || entry.name === ".lock" || entry.name === "session.owner.json") {
        rmSync2(join22(targetDir, entry.name), { recursive: true, force: true });
      }
    }
  }
}
var genericDocFamily = defineDocFamily({
  checkpointWhen: () => false,
  kind: "dz.document",
  version: 1,
  scope: "session",
  initial: () => ({})
});
var PiDurableSessionStore = class {
  sessionDir;
  cwd;
  releaseLockFn = null;
  sessionInstance = null;
  constructor(options) {
    this.sessionDir = resolve22(options.sessionDir);
    this.cwd = options.cwd ? resolve22(options.cwd) : process.cwd();
  }
  get isLocked() {
    return this.releaseLockFn !== null;
  }
  async getSession() {
    if (!this.sessionInstance) {
      const dbPath = join32(this.sessionDir, "session.sqlite");
      const storage = await openNodeSqliteStorage2(dbPath);
      this.sessionInstance = createSession(storage);
    }
    return this.sessionInstance;
  }
  async acquireLock() {
    if (this.isLocked) throw new Error(`Lock already held for session: ${this.sessionDir}`);
    const id = basename2(this.sessionDir);
    this.releaseLockFn = await acquireSessionLock(this.sessionDir, this.cwd, id);
  }
  async releaseLock() {
    if (this.releaseLockFn) {
      const release = this.releaseLockFn;
      this.releaseLockFn = null;
      await release();
    }
  }
  async saveDocument(collection, docId, data) {
    const session = await this.getSession();
    await session.commit(async (tx) => {
      const doc = await tx.doc(genericDocFamily, `${collection}:${docId}`);
      for (const key of Object.keys(doc)) {
        delete doc[key];
      }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        Object.assign(doc, structuredClone(data));
      } else {
        doc._value = structuredClone(data);
      }
    }, BACKGROUND_CONTEXT5);
  }
  async readDocument(collection, docId) {
    const session = await this.getSession();
    const snap = await session.snapshot(genericDocFamily, `${collection}:${docId}`, BACKGROUND_CONTEXT5);
    if (!snap || Object.keys(snap).length === 0) return void 0;
    if ("_value" in snap && Object.keys(snap).length === 1) {
      return snap._value;
    }
    return structuredClone(snap);
  }
  async forkSession(checkpointId, newSessionDir) {
    forkSessionDatabase({ sourceDir: this.sessionDir, targetDir: newSessionDir, checkpointId });
  }
  watchTasks(onUpdate) {
    onUpdate([]);
    return { close: () => {
    } };
  }
  async close() {
    if (this.sessionInstance) {
      const session = this.sessionInstance;
      this.sessionInstance = null;
      await session.close(BACKGROUND_CONTEXT5);
    }
    await this.releaseLock();
  }
};

// packages/adapter-pi-ai/dist/index.js
import {
  resolveCliModel as resolveCliModel2
} from "@earendil-works/pi-coding-agent";
import {
  DefaultResourceLoader as DefaultResourceLoader2,
  ModelRuntime as ModelRuntime2,
  SettingsManager as SettingsManager2,
  getAgentDir,
  resolveModelScopeWithDiagnostics as resolveModelScopeWithDiagnostics2
} from "@earendil-works/pi-coding-agent";
var PiAiModelProvider = class {
  #modelRuntime;
  #settingsManager;
  constructor(modelRuntime, settingsManager) {
    this.#modelRuntime = modelRuntime;
    this.#settingsManager = settingsManager;
  }
  get modelRuntime() {
    return this.#modelRuntime;
  }
  get settingsManager() {
    return this.#settingsManager;
  }
  async getAvailableModels() {
    const models = this.#modelRuntime.getAvailableSnapshot();
    return models.map((m) => ({
      provider: m.provider,
      modelId: m.id
    }));
  }
  async resolveModel(ref) {
    if (ref?.model !== void 0) {
      const resolved = resolveCliModel2({
        cliProvider: ref.provider,
        cliModel: ref.model,
        modelRuntime: this.#modelRuntime
      });
      if (resolved.error !== void 0 || resolved.model === void 0) {
        throw new Error(`Could not resolve model: ${resolved.error ?? ref.model}`);
      }
      return {
        model: { provider: resolved.model.provider, modelId: resolved.model.id },
        thinkingLevel: ref.thinking ?? resolved.thinkingLevel ?? "off"
      };
    }
    const defaultProvider = this.#settingsManager?.getDefaultProvider?.();
    const defaultModelId = this.#settingsManager?.getDefaultModel?.();
    const defaultThinkingLevel = this.#settingsManager?.getDefaultThinkingLevel?.();
    if (defaultProvider && defaultModelId) {
      const models = this.#modelRuntime.getAvailableSnapshot();
      const matched = models.find((m) => m.provider === defaultProvider && m.id === defaultModelId);
      if (matched) {
        return {
          model: { provider: matched.provider, modelId: matched.id },
          thinkingLevel: defaultThinkingLevel ?? "off"
        };
      }
    }
    const available = this.#modelRuntime.getAvailableSnapshot();
    if (available.length > 0) {
      return {
        model: { provider: available[0].provider, modelId: available[0].id },
        thinkingLevel: "off"
      };
    }
    return {};
  }
};
async function setupRunnerModels(cwd, args) {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager2.create(cwd, agentDir);
  const modelRuntime = await ModelRuntime2.create();
  const resourceLoader = new DefaultResourceLoader2({ cwd, agentDir, settingsManager });
  await resourceLoader.reload();
  const extensionsResult = resourceLoader.getExtensions();
  for (const { name, config } of extensionsResult.runtime.pendingProviderRegistrations) {
    try {
      modelRuntime.registerProvider(name, config);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register provider ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const { provider } of extensionsResult.runtime.pendingNativeProviderRegistrations) {
    try {
      modelRuntime.registerNativeProvider(provider);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register native provider ${provider?.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  for (const { definition } of extensionsResult.runtime.pendingVirtualModelRegistrations) {
    try {
      modelRuntime.registerVirtualModel(definition);
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (!msg.includes("already registered") && !msg.includes("duplicate")) {
        console.warn(`[ModelSetup] Failed to register virtual model ${definition?.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  const availableModels = modelRuntime.getAvailableSnapshot();
  const enabledPatterns = settingsManager.getEnabledModels();
  const scopedScope = enabledPatterns && enabledPatterns.length > 0 ? await resolveModelScopeWithDiagnostics2(enabledPatterns, modelRuntime) : void 0;
  const scopedModelList = scopedScope && scopedScope.scopedModels.length > 0 ? scopedScope.scopedModels.map((sm) => sm.model) : availableModels;
  const scopedModelIds = scopedModelList.map((m) => `${m.provider}/${m.id}`);
  const modelProvider = new PiAiModelProvider(modelRuntime, settingsManager);
  const initialAgent = await modelProvider.resolveModel(
    args.model ? { provider: args.provider, model: args.model, thinking: args.thinking } : void 0
  );
  const defaultModel = initialAgent.model ? modelRuntime.getModel(initialAgent.model.provider, initialAgent.model.modelId) ?? scopedModelList[0] : scopedModelList[0];
  const defaultModelId = defaultModel ? `${defaultModel.provider}/${defaultModel.id}` : void 0;
  const defaultThinkingLevel = initialAgent.thinkingLevel ?? "off";
  const modelScope = {
    scopedModelIds,
    defaultModelId
  };
  return {
    settingsManager,
    modelRuntime,
    scopedModelList,
    defaultModel,
    defaultThinkingLevel,
    modelScope
  };
}

// packages/adapter-codemode/dist/index.js
import { CodemodeSandbox as CodemodeSandbox2 } from "@earendil-works/pi-codemode";
import { createCodemodeExtension as createCodemodeExtension2 } from "@earendil-works/pi-durable/codemode";
var CodemodeExtension2 = class {
  id = "codemode";
  name = "Codemode";
  version = "1.0.0";
  #activeSandbox;
  #sandboxes = /* @__PURE__ */ new Set();
  #contextSandboxes = /* @__PURE__ */ new WeakMap();
  get sandbox() {
    return this.#activeSandbox;
  }
  getSandboxFor(ctx) {
    return this.#contextSandboxes.get(ctx);
  }
  register(ctx) {
    if (!ctx.registry) return;
    const sandbox = new CodemodeSandbox2();
    this.#activeSandbox = sandbox;
    this.#sandboxes.add(sandbox);
    this.#contextSandboxes.set(ctx, sandbox);
    const ext = createCodemodeExtension2({
      sandbox,
      get namespaces() {
        return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
      }
    });
    ctx.registry.install(ext);
  }
  async teardown() {
    const sandboxes = Array.from(this.#sandboxes);
    this.#sandboxes.clear();
    this.#activeSandbox = void 0;
    for (const sb of sandboxes) {
      const target = sb;
      if (typeof target.close === "function") {
        await target.close();
      } else if (typeof target.dispose === "function") {
        await target.dispose();
      }
    }
  }
};
var codemodeExtension2 = new CodemodeExtension2();

// packages/extension-pi-resource/dist/index.js
import { defineExtension as defineExtension4 } from "@earendil-works/pi-durable";
import { SettingsManager as SettingsManager3, DefaultResourceLoader as DefaultResourceLoader3, getAgentDir as getAgentDir2 } from "@earendil-works/pi-coding-agent";
function createPiResourceExtension(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir2();
  const settingsManager = options.settingsManager ?? SettingsManager3.create(cwd);
  const resourceLoader = options.resourceLoader ?? new DefaultResourceLoader3({
    cwd,
    agentDir,
    settingsManager
  });
  const baseExt = defineExtension4({
    name: "pi-resource"
  });
  return Object.assign(baseExt, {
    configProvider: settingsManager,
    resourceLoader
  });
}

// packages/runner/src/composition.ts
async function assembleDurableZero(options = {}) {
  const cwd = resolve5(options.cwd ?? process.cwd());
  const sessionDir = options.sessionDir ? resolve5(options.sessionDir) : options.session ? resolve5(cwd, options.session) : resolve5(cwd, ".durable/sessions/default");
  const executionEnv = options.executionEnv ?? new LocalNodeExecutionEnv({ cwd });
  const store = options.store ?? new PiDurableSessionStore({ sessionDir, cwd });
  const resourceExt = createPiResourceExtension({ cwd });
  const codemodeExt = new CodemodeExtension2();
  let modelProvider = options.modelProvider;
  if (!modelProvider) {
    try {
      const { modelRuntime, settingsManager } = await setupRunnerModels(cwd, {
        provider: options.provider,
        model: options.model,
        thinking: options.thinking
      });
      modelProvider = new PiAiModelProvider(modelRuntime, settingsManager);
    } catch {
    }
  }
  const coordinator = new SessionCoordinator({
    store,
    modelProvider,
    executionEnv
  });
  const server = new StdioJsonRpcServer({
    stdin: options.stdin,
    stdout: options.stdout,
    handler: async (method, params) => {
      if (method === "session/prompt") {
        return coordinator.prompt(params.content, params.options);
      }
      if (method === "session/abort") return coordinator.abort();
      if (method === "session/getState") return coordinator.getState();
      if (method === "session/setSubagentPolicy") return coordinator.setSubagentPolicy(params);
      throw new Error(`Unknown method: ${method}`);
    }
  });
  server.start();
  const unsubEvents = coordinator.events((event) => {
    const payload = { event };
    options.onNotification?.("session/event", payload);
    server.sendNotification("session/event", payload);
  });
  let isClosed = false;
  const close = async () => {
    if (isClosed) return;
    isClosed = true;
    unsubEvents();
    server.stop();
    await coordinator.close();
  };
  return {
    coordinator,
    store,
    executionEnv,
    server,
    resourceExt,
    codemodeExt,
    modelProvider,
    close
  };
}
export {
  assembleDurableZero,
  parseCliArgs
};
//# sourceMappingURL=index.js.map
