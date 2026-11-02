// packages/plugins/src/coding-tools.ts
import { createCodingTools, CodingTools } from "@earendil-works/pi-durable/tools";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
var codingToolsPlugin = {
  id: "coding-tools",
  name: "Coding Tools",
  category: "built-in",
  version: "1.0.0",
  async register(ctx) {
    if (!ctx.registry) return;
    let tools = CodingTools;
    try {
      const images = await createNodePhotonImages();
      tools = createCodingTools({ images });
    } catch {
    }
    ctx.registry.install(tools);
  }
};

// packages/plugins/src/codemode.ts
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
var activeSandbox;
var codemodePlugin = {
  id: "codemode",
  name: "Codemode",
  category: "built-in",
  version: "1.0.0",
  register(ctx) {
    if (!ctx.registry) return;
    activeSandbox = new CodemodeSandbox();
    const ext = createCodemodeExtension({
      sandbox: activeSandbox,
      get namespaces() {
        return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
      }
    });
    ctx.registry.install(ext);
  },
  async teardown() {
    if (activeSandbox) {
      const sb = activeSandbox;
      if (typeof sb.close === "function") {
        await sb.close();
      } else if (typeof sb.dispose === "function") {
        await sb.dispose();
      }
      activeSandbox = void 0;
    }
  }
};

// packages/core/src/runtime.ts
import { resolveModelScopeWithDiagnostics } from "@earendil-works/pi-coding-agent";

// packages/core/src/harness-setup.ts
import {
  createRegistry
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { createToolSearchExtension } from "@earendil-works/pi-durable/tool-search";
import {
  resolveCliModel
} from "@earendil-works/pi-coding-agent";

// packages/core/src/prompt.ts
import { existsSync, readFileSync } from "node:fs";
import { defineExtension, section } from "@earendil-works/pi-durable";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  formatSkillsForPrompt
} from "@earendil-works/pi-coding-agent";
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

// packages/core/src/plugins/built-in/coding-tools.ts
import { createCodingTools as createCodingTools2, CodingTools as CodingTools2 } from "@earendil-works/pi-durable/tools";
import { createNodePhotonImages as createNodePhotonImages2 } from "@earendil-works/pi-durable/images/node";

// packages/core/src/plugins/built-in/codemode.ts
import { createCodemodeExtension as createCodemodeExtension2 } from "@earendil-works/pi-durable/codemode";
import { CodemodeSandbox as CodemodeSandbox2 } from "@earendil-works/pi-codemode";

// packages/core/src/subagent.ts
import { Type } from "@sinclair/typebox";
import {
  configure,
  defineExtension as defineExtension2,
  defineTool
} from "@earendil-works/pi-durable";

// packages/core/src/subagent-docs.ts
import {
  AssistantEntry,
  defineDoc
} from "@earendil-works/pi-durable";
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
async function answerText(api, answer, context) {
  const entry = await api.commit((tx) => tx.entry(AssistantEntry, answer), context);
  return extractAssistantText(entry);
}

// packages/core/src/subagent-delivery.ts
import {
  AssistantEntry as AssistantEntry2,
  defineTask as defineTask2
} from "@earendil-works/pi-durable";

// packages/core/src/subagent-courier.ts
import { defineTask } from "@earendil-works/pi-durable";

// packages/core/src/watcher-compat.ts
function isWatchCall(item) {
  return typeof item === "object" && item !== null && "kind" in item && item.kind === "value" && "value" in item;
}
function unwrapWatchValue(item) {
  if (isWatchCall(item)) {
    return item.value;
  }
  return item;
}

// packages/core/src/subagent-courier.ts
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
          await new Promise((resolve3) => {
            const timer = setTimeout(() => resolve3(), holdTimeoutMs);
            timer.unref?.();
            watch.start((rawCall) => {
              const v = unwrapWatchValue(rawCall);
              if (v?.deliveryHold === void 0) {
                clearTimeout(timer);
                resolve3();
              }
              return Promise.resolve();
            });
            void watch.closed.then(() => {
              clearTimeout(timer);
              resolve3();
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

// packages/core/src/subagent-delivery.ts
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

// packages/core/src/subagent-role.ts
function buildTechnicalWorkerRole() {
  return [
    "You are an isolated worker subagent.",
    "Your goal is to solve the delegated task using your available tools.",
    "Execute the assigned task thoroughly, verify your findings, and return your final answer concisely."
  ].join("\n");
}

// packages/core/src/policy/resolver.ts
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";

// packages/core/src/shared/model-ref.ts
function normalizeModelReference(raw, defaultProvider) {
  if (!raw || typeof raw !== "object") return void 0;
  const r = raw;
  const provider = typeof r.provider === "string" && r.provider.trim() ? r.provider.trim() : defaultProvider?.trim();
  const rawId = typeof r.modelId === "string" && r.modelId.trim() ? r.modelId.trim() : typeof r.id === "string" && r.id.trim() ? r.id.trim() : void 0;
  if (!provider || !rawId) return void 0;
  const prefix = `${provider}/`;
  const cleanModelId = rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
  return { provider, modelId: cleanModelId };
}

// packages/core/src/policy/errors.ts
var SubagentPolicyError = class extends Error {
  cause;
  constructor(message, options) {
    super(message);
    this.name = this.constructor.name;
    this.cause = options?.cause;
  }
};
var SubagentPolicyInvalidError = class extends SubagentPolicyError {
  code = "SUBAGENT_POLICY_INVALID";
  constructor(message, options) {
    super(message, options);
  }
};
var SubagentModelUnavailableError = class extends SubagentPolicyError {
  code = "SUBAGENT_MODEL_UNAVAILABLE";
  constructor(message, options) {
    super(message, options);
  }
};

// packages/core/src/policy/resolver.ts
function mapBbReasoningToNativeThinking(level) {
  if (level === "none" || level === void 0) {
    return "off";
  }
  return level;
}
function resolveSubagentModelConfiguration(record, parentContext, availableModels) {
  if (record.policy.mode === "inherit") {
    const parentModel = normalizeModelReference(parentContext.model);
    if (!parentModel) {
      throw new SubagentPolicyInvalidError(
        "Parent model is required for inherit mode"
      );
    }
    return {
      model: {
        provider: parentModel.provider,
        modelId: parentModel.modelId
      },
      thinkingLevel: mapBbReasoningToNativeThinking(parentContext.thinkingLevel),
      source: "parent_inherited",
      policyRevision: record.revision
    };
  }
  const targetProfile = record.policy.configuredProfile;
  const targetModel = normalizeModelReference(targetProfile.model);
  const foundModel = targetModel ? availableModels.find((m) => {
    const availableNorm = normalizeModelReference(m, m.provider);
    return availableNorm && availableNorm.provider === targetModel.provider && availableNorm.modelId === targetModel.modelId;
  }) : void 0;
  if (!foundModel || !targetModel) {
    throw new SubagentModelUnavailableError(
      `Configured subagent model "${targetProfile.model.provider}/${targetProfile.model.modelId}" is unavailable or unauthenticated. Update the subagent model in Settings \u2192 Installed plugins \u2192 Pi Durable \u2192 Subagents.`
    );
  }
  const supportedLevels = getSupportedThinkingLevels(foundModel);
  if (!supportedLevels.includes(targetProfile.thinkingLevel)) {
    throw new SubagentPolicyInvalidError(
      `Thinking level "${targetProfile.thinkingLevel}" is not supported by model "${targetModel.provider}/${targetModel.modelId}". Supported levels: ${supportedLevels.join(", ")}.`
    );
  }
  return {
    model: {
      provider: targetModel.provider,
      modelId: targetModel.modelId
    },
    thinkingLevel: targetProfile.thinkingLevel,
    source: "user_configured",
    policyRevision: record.revision
  };
}

// packages/core/src/subagent.ts
function createSubagentExtension(getPolicy) {
  return defineExtension2({
    name: "subagent",
    tools: [
      defineTool({
        name: "subagent",
        description: "Delegate a self-contained task to an async subagent. Uses the configured runtime subagent model policy (inherits parent model or uses provider-configured model). Runs in the background by default without blocking the conversation.",
        parameters: Type.Object({
          task: Type.String({ description: "What the subagent should do" }),
          background: Type.Optional(
            Type.Boolean({
              description: "Run in background asynchronously (default: true). Set false only if an immediate synchronous answer is strictly required.",
              default: true
            })
          )
        }),
        replay: "safe",
        execute: async (args, api, context) => {
          if (api.conversationId !== void 0 && Number(api.conversationId) > 1) {
            return {
              output: [
                {
                  type: "text",
                  text: "Subagent recursion blocked: nested subagents are not permitted to spawn further subagents (max depth 1 reached)."
                }
              ],
              isError: true,
              details: { error: "MAX_DEPTH_EXCEEDED", task: args.task }
            };
          }
          const isBackground = args.background !== false;
          const key = `subagent:${api.taskId}`;
          const requestId = `subagent:${api.taskId}`;
          const existingRecord = await api.commit(async (tx) => {
            const state = await tx.doc(SubagentsDoc, api.conversationId);
            return state?.agents?.[key];
          }, context);
          let childRecord;
          if (existingRecord) {
            childRecord = existingRecord;
          } else {
            const parentAgent = await api.agent(context);
            const policySnapshot = getPolicy();
            const availableModels = policySnapshot.policy.mode === "configured" ? await api.models.getAvailable() : [];
            const resolved = resolveSubagentModelConfiguration(
              policySnapshot,
              {
                model: normalizeModelReference(parentAgent?.model),
                thinkingLevel: parentAgent?.thinkingLevel ?? "off"
              },
              availableModels
            );
            childRecord = await api.commit(async (tx) => {
              const state = await tx.doc(SubagentsDoc, api.conversationId);
              if (state?.agents?.[key]) {
                return state.agents[key];
              }
              const existingAnchorId = state?.agents?.[key]?.anchorTaskId;
              let existingConv = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
              if (!existingConv && existingAnchorId !== void 0) {
                existingConv = (await tx.scanConversations({ ownerTaskId: existingAnchorId }, 1)).items[0];
              }
              let childId = existingConv?.id ?? state?.agents?.[key]?.conversationId;
              let anchorId = existingAnchorId;
              if (childId === void 0) {
                if (isBackground) {
                  anchorId = await tx.createTask(Anchor, null, BACKGROUND);
                }
                const ownership = isBackground && anchorId !== void 0 ? { kind: "task", taskId: anchorId } : { kind: "task", taskId: api.taskId };
                const created = await tx.createConversation({ ownership });
                await configure(tx, created.id, {
                  model: resolved.model,
                  thinkingLevel: resolved.thinkingLevel,
                  instructions: buildTechnicalWorkerRole()
                });
                childId = created.id;
              }
              const record = {
                name: args.task.trim(),
                conversationId: childId,
                requestId,
                task: args.task,
                role: "worker",
                ownerTaskId: api.taskId,
                ...anchorId !== void 0 ? { anchorTaskId: anchorId } : {},
                background: isBackground,
                actualModel: resolved.model,
                thinkingLevel: resolved.thinkingLevel,
                source: resolved.source,
                policyRevision: resolved.policyRevision
              };
              if (isBackground) {
                record.reporter = await tx.createTask(
                  DefaultReporter,
                  { key, conversationId: childId, task: args.task, requestId },
                  BACKGROUND
                );
              }
              if (state) {
                state.agents ??= {};
                state.agents[key] = record;
              }
              return record;
            }, context);
          }
          const detailsPayload = {
            conversationId: childRecord.conversationId,
            task: args.task,
            background: isBackground
          };
          if (childRecord.actualModel) {
            detailsPayload.actualModel = childRecord.actualModel;
          }
          if (childRecord.thinkingLevel) {
            detailsPayload.thinkingLevel = childRecord.thinkingLevel;
          }
          if (childRecord.source) {
            detailsPayload.source = childRecord.source;
          }
          if (childRecord.policyRevision !== void 0) {
            detailsPayload.policyRevision = childRecord.policyRevision;
          }
          await api.details(detailsPayload, context);
          if (isBackground) {
            return {
              output: [
                {
                  type: "text",
                  text: `Subagent spawned in background (conversation ${childRecord.conversationId}). The task is running independently and will report upon completion.`
                }
              ],
              details: detailsPayload
            };
          }
          const handle = await api.conversation(childRecord.conversationId, context);
          if (!handle) throw new Error(`Failed to access subagent conversation: ${childRecord.conversationId}`);
          const submission = await handle.submit({ type: "input", content: args.task, requestId }, context);
          const settled = await submission.wait(context);
          if (settled.status !== "done" || settled.type !== "input") {
            throw new Error(`Subagent ${childRecord.conversationId} failed: ${settled.status}`);
          }
          const text = await answerText(api, settled.answer, context);
          await api.commit(async (tx) => {
            const state = await tx.doc(SubagentsDoc, api.conversationId);
            if (state?.agents?.[key]) {
              state.agents[key].settled = true;
              state.agents[key].report = text;
            }
          }, context);
          return {
            output: [{ type: "text", text }],
            details: detailsPayload
          };
        }
      })
    ]
  });
}

// packages/core/src/session-storage.ts
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import "node:os";
import { basename, join as join2, resolve as resolve2 } from "node:path";
import lockfile from "proper-lockfile";

// packages/core/src/shared/agent-dir.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// packages/core/src/runtime-types.ts
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  ROOT_CONVERSATION_ID
} from "@earendil-works/pi-durable";

// packages/core/src/runtime-controller.ts
import { clampThinkingLevel, getSupportedThinkingLevels as getSupportedThinkingLevels2 } from "@earendil-works/pi-ai";

// packages/core/src/runtime-loader.ts
import {
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  initTheme
} from "@earendil-works/pi-coding-agent";

// packages/core/src/shared/extension-runner.ts
import {
  createMcpExtension,
  ExtensionRunner,
  ModelRegistry,
  SessionManager
} from "@earendil-works/pi-coding-agent";

// packages/core/src/tool-adapter.ts
import {
  createMcpExtension as createMcpExtension2
} from "@earendil-works/pi-coding-agent";
import {
  defineExtension as defineExtension3,
  defineTool as defineTool2
} from "@earendil-works/pi-durable";

// packages/core/src/schema-port.ts
import { Value } from "@sinclair/typebox/value";
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
        const path2 = rawPath ? rawPath.replace(/^\//, "") : "root";
        errors.push(`- ${path2}: ${errObj.message ?? "validation error"}`);
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

// packages/core/src/tool-adapter.ts
var schemaPort = new SchemaPort();

// packages/core/src/extension-mount.ts
import "@earendil-works/pi-coding-agent";

// packages/core/src/runtime-loader.ts
import { Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

// packages/core/src/subagent-policy-ack.ts
import { defineDoc as defineDoc2 } from "@earendil-works/pi-durable";

// packages/core/src/policy/schema.ts
import { z } from "zod";
var subagentThinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);
var subagentModelReferenceSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1)
}).strict();
var subagentModelProfileSchema = z.object({
  model: subagentModelReferenceSchema,
  thinkingLevel: subagentThinkingLevelSchema
}).strict();
var subagentPolicySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("inherit"),
    configuredProfile: subagentModelProfileSchema.optional()
  }).strict(),
  z.object({
    mode: z.literal("configured"),
    configuredProfile: subagentModelProfileSchema
  }).strict()
]);
var subagentPolicyRecordSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().optional(),
  policy: subagentPolicySchema
}).strict();
var subagentPolicySetInputSchema = z.object({
  policy: subagentPolicySchema,
  expectedRevision: z.number().int().nonnegative()
}).strict();
var subagentPolicyGetOutputSchema = z.object({
  record: subagentPolicyRecordSchema
}).strict();
var subagentPolicySetOutputSchema = z.object({
  record: subagentPolicyRecordSchema
}).strict();

// packages/core/src/subagent-policy-ack.ts
var SubagentPolicyAckDoc = defineDoc2({
  kind: "durable.subagent-policy-ack",
  version: 1,
  scope: "session",
  checkpointWhen: () => false,
  initial: () => ({ record: null })
});

// packages/core/src/bridge/durable-contracts.ts
import { NestedCallDoc } from "@earendil-works/pi-durable";

// packages/core/src/bridge/tool-result-presentation.ts
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";

// packages/core/src/subagent-watcher.ts
import {
  ROOT_CONVERSATION_ID as ROOT_CONVERSATION_ID2
} from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT as BACKGROUND_CONTEXT2 } from "@earendil-works/chord/context";

// packages/core/src/binding-docs.ts
import { defineDoc as defineDoc3 } from "@earendil-works/pi-durable";
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

// packages/core/src/session-daemon.ts
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

// packages/core/src/shared/version.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
var esmRequire = createRequire(import.meta.url);
var currentDir = dirname(fileURLToPath(import.meta.url));

// packages/plugins/src/subagents.ts
var subagentsPlugin2 = {
  id: "subagents",
  name: "Subagents",
  category: "built-in",
  version: "1.0.0",
  register(ctx) {
    if (!ctx.registry) return;
    if (typeof ctx.getSubagentPolicy === "function") {
      ctx.registry.install(createSubagentExtension(ctx.getSubagentPolicy));
    }
    ctx.registry.install(Anchor);
    ctx.registry.install(DefaultCourier);
    ctx.registry.install(DefaultReporter);
  },
  teardown() {
  }
};
export {
  codemodePlugin,
  codingToolsPlugin,
  subagentsPlugin2 as subagentsPlugin
};
//# sourceMappingURL=index.js.map
