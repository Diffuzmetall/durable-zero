// packages/contracts/src/diagnostics.ts
import { z } from "zod";
var piPathStatusSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  type: z.enum(["file", "directory"]),
  required: z.boolean()
});
var extensionDiagnosticSchema = z.object({
  path: z.string(),
  resolvedPath: z.string(),
  tools: z.array(z.string()),
  commands: z.array(z.string()),
  supportedHooks: z.array(z.string()),
  unsupportedHooks: z.array(z.string())
});
var count = z.number().int().nonnegative();
var strings = z.array(z.string());
var piDiagnosticsReportSchema = z.object({
  version: z.string(),
  durableVersion: z.string(),
  agentDir: z.string(),
  paths: z.record(z.string(), piPathStatusSchema),
  settings: z.object({
    defaultProvider: z.string().optional(),
    defaultModel: z.string().optional(),
    thinkingLevel: z.string().optional(),
    packages: strings,
    extensions: strings
  }),
  models: z.object({ total: count, providers: strings, defaultModelAvailable: z.boolean() }),
  extensions: z.object({
    total: count,
    errors: z.array(z.object({ path: z.string(), error: z.string() })),
    warnings: z.array(z.object({ path: z.string(), warning: z.string() })),
    items: z.array(extensionDiagnosticSchema)
  }),
  skills: z.object({ total: count, sample: strings }),
  tools: z.object({ total: count, system: strings, custom: strings, mcp: strings }),
  status: z.enum(["healthy", "warning", "error"]),
  summary: z.string()
});

// packages/contracts/src/runner-channel.ts
import { z as z2 } from "zod";
var runnerChannelSchema = z2.discriminatedUnion("kind", [
  z2.object({ kind: z2.literal("ready"), ready: z2.boolean().optional() }).passthrough(),
  z2.object({ kind: z2.literal("model-scope"), scopedModelIds: z2.array(z2.string()).optional(), defaultModelId: z2.string().optional() }).passthrough(),
  z2.object({ kind: z2.literal("reply"), id: z2.union([z2.string(), z2.number()]), result: z2.unknown().optional(), error: z2.unknown().optional() }).passthrough(),
  z2.object({
    kind: z2.literal("tool_call_request"),
    callId: z2.string(),
    toolName: z2.string(),
    arguments: z2.unknown().default({})
  }).passthrough(),
  z2.object({
    kind: z2.literal("tool_call_response"),
    callId: z2.string(),
    result: z2.unknown().optional(),
    isError: z2.boolean().optional()
  }).passthrough(),
  z2.object({
    kind: z2.literal("interaction_request"),
    id: z2.union([z2.string(), z2.number()]),
    interactionKind: z2.string().optional(),
    dialogKind: z2.string().optional(),
    title: z2.string().optional(),
    message: z2.string().optional(),
    data: z2.unknown().optional()
  }).passthrough(),
  z2.object({
    kind: z2.literal("interaction_response"),
    id: z2.union([z2.string(), z2.number()]),
    result: z2.unknown().optional(),
    error: z2.unknown().optional()
  }).passthrough()
]);
var runnerBridgeRequestSchema = z2.object({
  kind: z2.literal("request"),
  id: z2.union([z2.string(), z2.number()]),
  method: z2.string(),
  params: z2.unknown().optional()
}).passthrough();
var knownChannelKinds = new Set(runnerChannelSchema.options.map((schema) => schema.shape.kind.value));

// packages/contracts/src/runner-command.ts
import { z as z4 } from "zod";

// packages/contracts/src/wire-context.ts
import { z as z3 } from "zod";
var conversationIdSchema = z3.union([z3.number().int().positive(), z3.string().regex(/^[1-9]\d*$/)]);
var cumulativeUsageSchema = z3.object({
  totalTokens: z3.number(),
  inputTokens: z3.number(),
  outputTokens: z3.number(),
  cachedInputTokens: z3.number().optional(),
  cacheWriteInputTokens: z3.number().optional()
}).passthrough();
var wireContextSchema = z3.object({
  parentRef: z3.string().optional(),
  conversationId: conversationIdSchema.optional(),
  providerCheckpointId: z3.string().optional(),
  cumulativeUsage: cumulativeUsageSchema.optional(),
  aborted: z3.boolean().optional(),
  stopReason: z3.string().optional(),
  errorMessage: z3.string().optional()
}).passthrough();

// packages/contracts/src/runner-command.ts
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
function parseRunnerCommand(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch (cause) {
    throw new Error("INVALID_COMMAND_JSON", { cause });
  }
  const parsed = runnerCommandSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_COMMAND", { cause: parsed.error });
  return parsed.data;
}

// packages/contracts/src/runner-event.ts
import { z as z9 } from "zod";

// packages/contracts/src/wire-message.ts
import { z as z5 } from "zod";
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

// packages/contracts/src/wire-tool.ts
import { z as z6 } from "zod";
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

// packages/contracts/src/wire-lifecycle.ts
import { z as z8 } from "zod";

// packages/contracts/src/runtime-graph/schema.ts
import { z as z7 } from "zod";
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

// packages/contracts/src/wire-lifecycle.ts
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
  hostInteractionRequestSchema
];
var sessionStatsSchema = z8.object({ contextUsage: z8.object({ tokens: z8.number().nullable(), contextWindow: z8.number() }) });

// packages/contracts/src/runner-event.ts
var runnerEventSchema = z9.discriminatedUnion("type", [...messageSchemas, ...toolSchemas, ...lifecycleSchemas]);
var knownEventTypes = new Set(runnerEventSchema.options.map((schema) => schema.shape.type.value));

// packages/contracts/src/runner-response.ts
import { z as z10 } from "zod";
var base = z10.object({ id: z10.string().optional(), type: z10.literal("response"), command: z10.string().min(1) });
var runnerResponseSchema = z10.discriminatedUnion("success", [
  base.extend({ success: z10.literal(true), data: z10.unknown().optional() }).passthrough(),
  base.extend({ success: z10.literal(false), error: z10.string() }).passthrough()
]);

// packages/contracts/src/runtime-graph/scope.ts
function isConversationInScope(conversationId, targetConversationId, conversations) {
  if (targetConversationId === 1) return true;
  if (conversationId === targetConversationId) return true;
  let currentId = conversationId;
  const visited = /* @__PURE__ */ new Set();
  while (currentId !== void 0 && !visited.has(currentId)) {
    visited.add(currentId);
    const record = conversations.get(currentId);
    if (!record || !record.owner) {
      return false;
    }
    const ownerConversationId = record.owner.conversationId;
    if (ownerConversationId === targetConversationId) {
      return true;
    }
    currentId = ownerConversationId;
  }
  return false;
}
function filterSnapshotForConversation(snapshot, targetConversationId) {
  const targetId = Number(targetConversationId);
  const rootId = Number(snapshot.scope.rootConversationId);
  if (targetId === rootId) {
    return snapshot;
  }
  const conversationsMap = /* @__PURE__ */ new Map();
  for (const conv of Object.values(snapshot.conversations)) {
    conversationsMap.set(conv.id, conv);
  }
  const filteredNodes = {};
  for (const [key, node] of Object.entries(snapshot.nodes)) {
    if (isConversationInScope(node.conversationId, targetId, conversationsMap)) {
      filteredNodes[key] = node;
    }
  }
  const filteredConversations = {};
  for (const [key, conv] of Object.entries(snapshot.conversations)) {
    if (isConversationInScope(conv.id, targetId, conversationsMap)) {
      filteredConversations[key] = conv;
    }
  }
  const filteredReceipts = [];
  for (const receipt of snapshot.receipts) {
    if (isConversationInScope(receipt.conversationId, targetId, conversationsMap)) {
      filteredReceipts.push(receipt);
    }
  }
  const liveCount = Object.keys(filteredNodes).length;
  const terminalCount = filteredReceipts.length;
  return {
    version: 1,
    scope: snapshot.scope,
    observation: snapshot.observation,
    nodes: filteredNodes,
    conversations: filteredConversations,
    receipts: filteredReceipts,
    stats: {
      liveCount,
      terminalCount,
      totalCount: liveCount + terminalCount
    }
  };
}

// packages/contracts/src/runtime-graph/status.ts
function projectTaskState(input) {
  const { state, abortRequested, blocked, label } = input;
  switch (state.status) {
    case "completing":
      return {
        rawStatus: "completing",
        label: "Completing child work",
        isFinal: false,
        isCompleting: true,
        abortRequested: Boolean(abortRequested),
        blockedReason: blocked
      };
    case "running":
      return {
        rawStatus: "running",
        label: label ?? "Running",
        isFinal: false,
        abortRequested: Boolean(abortRequested),
        blockedReason: blocked
      };
    case "waiting":
      return {
        rawStatus: "waiting",
        label: label ?? "Waiting on dependencies",
        isFinal: false,
        waitingOn: state.on,
        abortRequested: Boolean(abortRequested),
        blockedReason: blocked
      };
    case "sleeping":
      return {
        rawStatus: "sleeping",
        label: label ?? "Waiting for timer",
        isFinal: false,
        sleepUntil: state.until,
        abortRequested: Boolean(abortRequested),
        blockedReason: blocked
      };
    case "pending":
      return {
        rawStatus: "pending",
        label: label ?? "Queued",
        isFinal: false,
        abortRequested: Boolean(abortRequested),
        blockedReason: blocked
      };
    default: {
      const _exhaustive = state;
      throw new Error(`Unhandled live task status: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
function projectTaskReceipt(receipt) {
  const hasToolError = Boolean(receipt.isToolError);
  let label;
  switch (receipt.outcome) {
    case "completed":
      label = hasToolError ? "Completed with tool error" : "Completed successfully";
      break;
    case "failed":
      label = "Task failed";
      break;
    case "aborted":
      label = "Aborted";
      break;
    case "faulted":
      label = "Runtime fault";
      break;
    case "orphaned":
      label = "Orphaned task";
      break;
    default: {
      const _exhaustive = receipt.outcome;
      throw new Error(`Unhandled task outcome: ${_exhaustive}`);
    }
  }
  return {
    outcome: receipt.outcome,
    isFinal: true,
    hasToolError,
    label,
    preview: receipt.preview,
    endedAt: receipt.endedAt,
    durationMs: receipt.durationMs
  };
}

// packages/adapter-pi-durable/src/session-fork.ts
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
function forkSessionDatabase(options) {
  let sourceDir = resolve(options.sourceDir);
  if (sourceDir.endsWith(".sqlite")) {
    sourceDir = resolve(sourceDir, "..");
  }
  const sourceDb = join(sourceDir, "session.sqlite");
  if (!existsSync(sourceDir) || !existsSync(sourceDb)) {
    throw new Error(`Cannot fork: source session database not found for "${options.sourceDir}"`);
  }
  let targetDir = resolve(options.targetDir);
  if (targetDir.endsWith(".sqlite")) {
    targetDir = resolve(targetDir, "..");
  }
  mkdirSync(targetDir, { recursive: true });
  const targetDb = join(targetDir, "session.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) {
    const targetFile = `${targetDb}${suffix}`;
    if (existsSync(targetFile)) rmSync(targetFile, { force: true });
  }
  const sourceConn = new DatabaseSync(sourceDb);
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
  const db = new DatabaseSync(targetDb);
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
  if (existsSync(targetLockDir)) {
    rmSync(targetLockDir, { recursive: true, force: true });
  }
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.endsWith(".lock") || entry.name === ".lock" || entry.name === "session.owner.json") {
        rmSync(join(targetDir, entry.name), { recursive: true, force: true });
      }
    }
  }
}
export {
  BLOCKED_REASONS,
  LIVE_TASK_STATUSES,
  MAX_LABEL_LENGTH,
  MAX_LIVE_NODES,
  MAX_PREVIEW_LENGTH,
  MAX_RECEIPTS,
  MAX_SNAPSHOT_BYTES,
  TASK_OUTCOMES,
  assistantMessageSchema,
  assistantUsageSchema,
  blockedReasonSchema,
  conversationIdSchema,
  cumulativeUsageSchema,
  extensionDiagnosticSchema,
  filterSnapshotForConversation,
  forkSessionDatabase,
  getUtf8ByteLength,
  graphObservationSchema,
  graphScopeSchema,
  hostInteractionRequestSchema,
  hostToolCallSchema,
  isConversationInScope,
  knownChannelKinds,
  knownCommandTypes,
  knownEventTypes,
  lifecycleSchemas,
  liveTaskStatusSchema,
  messageSchemas,
  messageUpdateSchema,
  parseRunnerCommand,
  piDiagnosticsReportSchema,
  piPathStatusSchema,
  projectTaskReceipt,
  projectTaskState,
  runnerBridgeRequestSchema,
  runnerChannelSchema,
  runnerCommandSchema,
  runnerEventSchema,
  runnerRequestHeaderSchema,
  runnerResponseSchema,
  runtimeConversationNodeSchema,
  runtimeGraphSnapshotEventSchema,
  runtimeGraphSnapshotSchema,
  runtimeGraphStatsSchema,
  runtimeTaskNodeSchema,
  runtimeTaskReceiptSchema,
  runtimeTaskStateSchema,
  sessionStatsSchema,
  taskOutcomeSchema,
  taskTokensUsageSchema,
  toolEndSchema,
  toolSchemas,
  toolStartSchema,
  toolUpdateSchema,
  wireContextSchema
};
//# sourceMappingURL=index.js.map
