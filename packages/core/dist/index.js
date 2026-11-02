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
var DynamicPromptSections = class {
  sections = {};
  revision = 0;
  getSections() {
    return { ...this.sections };
  }
  updateSections(sections) {
    this.sections = { ...sections };
    this.revision++;
  }
  getRevision() {
    return this.revision;
  }
};
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
var KEYS = ["preamble", "tools", "rules", "docs", "addendum", "project_context", "skills", "cwd", "mcp_servers", "dynamic_sections"];
function resolveContextFiles(options) {
  return options.contextFiles && options.contextFiles.length > 0 ? options.contextFiles : options.resourceLoader?.getAgentsFiles?.()?.agentsFiles ?? [];
}
function resolveSkills(options) {
  return options.resourceLoader?.getSkills?.()?.skills ?? [];
}
function buildRules(tools) {
  const rules = [];
  const seen = /* @__PURE__ */ new Set();
  const addRule = (rule) => {
    const normalized = rule.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    rules.push(normalized);
  };
  if (tools.some((t) => t.name === "bash")) {
    addRule("Use bash for file operations like ls, rg, find");
  }
  for (const tool of tools) {
    const def = CANONICAL_TOOL_DEFS[tool.name];
    if (def?.promptGuidelines) {
      for (const guideline of def.promptGuidelines) addRule(guideline);
    }
    if (tool.promptGuidelines) {
      for (const guideline of tool.promptGuidelines) addRule(guideline);
    }
  }
  addRule("Be concise in your responses");
  addRule("Show file paths clearly when working with files");
  return rules.map((r) => `- ${r}`).join("\n");
}
function tryReadPromptFile(path2, label) {
  if (!path2 || !existsSync(path2)) return void 0;
  try {
    return readFileSync(path2, "utf8").trim();
  } catch (err) {
    console.error(`Warning: failed to read ${label ?? "prompt"}: ${err}`);
    return void 0;
  }
}
function createPiPrompt(_settings, fallbackCwd, options = {}) {
  const systemPromptOverride = tryReadPromptFile(options.systemPromptPath, "system-prompt");
  const appendPrompt = tryReadPromptFile(options.appendSystemPromptPath, "append-system-prompt");
  const buildSections = (input) => {
    const cwd = input.env?.cwd ?? input.agent.cwd ?? fallbackCwd;
    const contextFiles = resolveContextFiles(options);
    const skills = resolveSkills(options);
    const tools = input.agent.tools ?? [];
    const sections = {};
    if (systemPromptOverride) {
      sections.preamble = systemPromptOverride;
    } else {
      sections.preamble = "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
      const visibleTools = tools.flatMap((t) => {
        const def = CANONICAL_TOOL_DEFS[t.name];
        const snippet = def?.promptSnippet ?? t.promptSnippet;
        return snippet ? [`- ${t.name}: ${snippet}`] : [];
      });
      const toolsText = visibleTools.length > 0 ? visibleTools.join("\n") : "(none)";
      sections.tools = `<tools>
${toolsText}

In addition to the tools above, you may have access to other custom tools depending on the project.
</tools>`;
      sections.rules = `<rules>
${buildRules(tools)}
</rules>`;
    }
    if (appendPrompt) sections.addendum = `<addendum>
${appendPrompt}
</addendum>`;
    if (contextFiles.length > 0) {
      const rendered = contextFiles.map((cf) => `<project_instructions path="${cf.path}">
${cf.content}
</project_instructions>`).join("\n\n");
      sections.project_context = `<project_context>
Project-specific instructions and guidelines:

${rendered}
</project_context>`;
    }
    if (skills.length > 0) sections.skills = `<skills>
${formatSkillsForPrompt(skills, "read")}
</skills>`;
    sections.cwd = `<cwd>
${cwd.replace(/\\/g, "/")}
</cwd>`;
    if (options.dynamicSections) {
      const extra = options.dynamicSections.getSections();
      if (extra.mcp_servers?.trim()) sections.mcp_servers = `<mcp_servers>
${extra.mcp_servers}
</mcp_servers>`;
      const otherEntries = Object.entries(extra).filter(([k, text]) => k !== "mcp_servers" && Boolean(text?.trim()));
      if (otherEntries.length > 0) {
        sections.dynamic_sections = otherEntries.map(([name, text]) => `<${name}>
${text}
</${name}>`).join("\n\n");
      }
    }
    return sections;
  };
  const built = /* @__PURE__ */ new WeakMap();
  const getOrBuild = (input) => {
    const currentRev = options.dynamicSections?.getRevision?.() ?? 0;
    const cached = built.get(input);
    if (cached === void 0 || cached.revision !== currentRev) {
      const sections = buildSections(input);
      built.set(input, { revision: currentRev, sections });
      return sections;
    }
    return cached.sections;
  };
  return defineExtension({
    name: "pi-prompt",
    sections: KEYS.map((key) => section(key, (input) => getOrBuild(input)[key], { tag: false }))
  });
}

// packages/core/src/shared/errors.ts
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
var DurablePluginError = class extends DurableHarnessError {
  pluginId;
  constructor(pluginId, message, cause) {
    super(message ?? `Plugin failure: ${pluginId}`, "PLUGIN_ERROR", cause);
    this.pluginId = pluginId;
  }
};

// packages/core/src/plugins/registry.ts
var DurablePluginRegistry = class {
  #plugins = /* @__PURE__ */ new Map();
  register(plugin) {
    if (this.#plugins.has(plugin.id)) {
      throw new DurablePluginError(
        plugin.id,
        `Plugin with id '${plugin.id}' is already registered`
      );
    }
    this.#plugins.set(plugin.id, plugin);
  }
  get(id) {
    return this.#plugins.get(id);
  }
  list(category) {
    const all = Array.from(this.#plugins.values());
    if (!category) return all;
    return all.filter((p) => p.category === category);
  }
  async initAll(ctx) {
    for (const plugin of this.#plugins.values()) {
      try {
        await plugin.register(ctx);
      } catch (err) {
        if (err instanceof DurablePluginError) {
          throw err;
        }
        throw new DurablePluginError(
          plugin.id,
          `Failed to initialize plugin '${plugin.id}': ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
    }
  }
  async teardownAll() {
    const plugins = Array.from(this.#plugins.values()).reverse();
    for (const plugin of plugins) {
      if (typeof plugin.teardown === "function") {
        try {
          await plugin.teardown();
        } catch {
        }
      }
    }
  }
};

// packages/core/src/plugins/built-in/coding-tools.ts
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

// packages/core/src/plugins/built-in/codemode.ts
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
function clearDeliveryHold(doc) {
  delete doc.deliveryHold;
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
var SubagentTasksExtension = {
  name: "durable.subagent-tasks",
  tasks: [Anchor, DefaultCourier, DefaultReporter]
};

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
var SubagentPolicyLoadError = class extends SubagentPolicyError {
  code = "SUBAGENT_POLICY_LOAD_ERROR";
  constructor(message, options) {
    super(message, options);
  }
};
var SubagentRevisionConflictError = class extends SubagentPolicyError {
  code = "REVISION_CONFLICT";
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

// packages/core/src/plugins/built-in/subagents.ts
var subagentsPlugin = {
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

// packages/core/src/harness-setup.ts
function configureHarnessHttp(settingsManager) {
  const proxy = settingsManager.getGlobalSettings()?.httpProxy?.trim();
  if (proxy) {
    process.env.HTTP_PROXY ??= proxy;
    process.env.HTTPS_PROXY ??= proxy;
  }
}
function createHarnessSettings(settingsManager, getActiveModel) {
  return {
    get stream() {
      const provider = settingsManager.getProviderRetrySettings?.() ?? {};
      const idle = settingsManager.getHttpIdleTimeoutMs?.() ?? 3e5;
      return {
        timeoutMs: provider.timeoutMs ?? (idle === 0 ? 2147483647 : idle),
        maxRetryDelayMs: provider.maxRetryDelayMs,
        ...provider.maxRetries === void 0 ? {} : { maxRetries: provider.maxRetries }
      };
    },
    get compaction() {
      const active = getActiveModel?.();
      const model = active ? { provider: active.provider, id: active.modelId } : (() => {
        const p = settingsManager.getDefaultProvider();
        const m = settingsManager.getDefaultModel();
        return p && m ? { provider: p, id: m } : void 0;
      })();
      return settingsManager.getCompactionSettings?.(model) ?? {};
    },
    get retry() {
      return settingsManager.getRetrySettings?.() ?? {};
    },
    get steeringMode() {
      return settingsManager.getSteeringMode?.() ?? "immediate";
    },
    get followUpMode() {
      return settingsManager.getFollowUpMode?.() ?? "queue";
    }
  };
}
async function createCodingRegistry(settingsManager, cwd, getSubagentPolicy, promptOptions, dynamicNamespaces, customPlugins = []) {
  const registry = createRegistry();
  const pluginRegistry = new DurablePluginRegistry();
  pluginRegistry.register(codingToolsPlugin);
  pluginRegistry.register(codemodePlugin);
  pluginRegistry.register(subagentsPlugin);
  for (const plugin of customPlugins) {
    pluginRegistry.register(plugin);
  }
  const ctx = {
    registry,
    settingsManager,
    cwd,
    storageDir: cwd,
    getSubagentPolicy,
    prompt: promptOptions,
    dynamicNamespaces
  };
  await pluginRegistry.initAll(ctx);
  registry.install(createToolSearchExtension());
  registry.install(createPiPrompt(settingsManager, cwd, promptOptions));
  return Object.assign(registry, { pluginRegistry });
}
var ExecutionEnvs = class {
  #defaultCwd;
  #envs = /* @__PURE__ */ new Map();
  constructor(defaultCwd) {
    this.#defaultCwd = defaultCwd;
  }
  env = ({ cwd = this.#defaultCwd }) => {
    let env = this.#envs.get(cwd);
    if (env === void 0) {
      env = new NodeExecutionEnv({ cwd });
      this.#envs.set(cwd, env);
    }
    return env;
  };
  async cleanup(context) {
    const envs = [...this.#envs.values()];
    this.#envs.clear();
    for (const env of envs) await env.cleanup(context);
  }
};
async function findInitialAgentModel(settingsManager, modelRuntime, cli) {
  if (cli?.model !== void 0) {
    const resolved = resolveCliModel({ cliProvider: cli.provider, cliModel: cli.model, modelRuntime });
    if (resolved.error !== void 0 || resolved.model === void 0) {
      throw new Error(`Could not resolve model: ${resolved.error ?? cli.model}`);
    }
    return {
      model: { provider: resolved.model.provider, modelId: resolved.model.id },
      thinkingLevel: cli.thinking ?? resolved.thinkingLevel ?? "off"
    };
  }
  const defaultProvider = settingsManager.getDefaultProvider?.();
  const defaultModelId = settingsManager.getDefaultModel?.();
  const defaultThinkingLevel = settingsManager.getDefaultThinkingLevel?.();
  if (defaultProvider && defaultModelId) {
    const models = modelRuntime.getAvailableSnapshot();
    const matched = models.find((m) => m.provider === defaultProvider && m.id === defaultModelId);
    if (matched) {
      return {
        model: { provider: matched.provider, modelId: matched.id },
        thinkingLevel: defaultThinkingLevel ?? "off"
      };
    }
  }
  const available = modelRuntime.getAvailableSnapshot();
  if (available.length > 0) {
    return {
      model: { provider: available[0].provider, modelId: available[0].id },
      thinkingLevel: "off"
    };
  }
  return {};
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
function getAgentDir(env = process.env) {
  const override = env.PI_AGENT_DIR?.trim() || env.PI_CODING_AGENT_DIR?.trim();
  if (override && override.length > 0) return resolve(override);
  return join(homedir(), ".pi", "agent");
}

// packages/core/src/session-storage.ts
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
    const output = execFileSync("ps", ["-p", String(owner.pid), "-o", "command="], {
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
  await writeFile(join2(directory, "session.owner.json"), JSON.stringify(owner, null, 2), "utf8");
}
async function readOwnerFile(directory) {
  try {
    const content = await readFile(join2(directory, "session.owner.json"), "utf8");
    return JSON.parse(content);
  } catch (err) {
    logUnexpectedErr(err, "ENOENT", `Corrupted or unreadable session.owner.json in ${directory}`);
    return null;
  }
}
async function removeOwnerFile(directory) {
  await rm(join2(directory, "session.owner.json"), { force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `Failed to remove owner file in ${directory}`)
  );
}
async function forceUnlock(directory) {
  await lockfile.unlock(directory, { realpath: false }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `unlock warning for ${directory}`)
  );
  await rm(`${directory}.lock`, { recursive: true, force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `lockfile cleanup warning for ${directory}`)
  );
}
async function acquireSessionLock(directory, cwd, id) {
  const lockOpts = { realpath: false, retries: { retries: 2, minTimeout: 100, maxTimeout: 200 } };
  let rawRelease;
  try {
    rawRelease = await lockfile.lock(directory, lockOpts);
  } catch (initialErr) {
    let owner = await readOwnerFile(directory);
    if (!owner) {
      await new Promise((r) => setTimeout(r, 100));
      owner = await readOwnerFile(directory);
    }
    if (!owner) {
      throw new Error(`Session is already open in another process: ${directory}`, { cause: initialErr });
    }
    const isAlive = isProcessAlive(owner.pid);
    const isRunner = isAlive && isVerifiedRunnerProcess(owner);
    if (!isAlive || !isRunner) {
      await forceUnlock(directory);
      await removeOwnerFile(directory);
      try {
        rawRelease = await lockfile.lock(directory, lockOpts);
      } catch (retryErr) {
        throw new DurableStorageError(`Session is already open in another process (PID: ${owner.pid}): ${directory}`, retryErr);
      }
    } else {
      throw new DurableStorageError(
        `Session is already open in another live process (PID: ${owner.pid}): ${directory}`,
        initialErr
      );
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
async function selectSession(cwdInput, continueSession, targetSession) {
  const cwd = await realpath(resolve2(cwdInput));
  const root = join2(getAgentDir(), "experimental", "durable-sessions", createHash("sha256").update(cwd).digest("hex").slice(0, 24));
  await mkdir(root, { recursive: true });
  let directory;
  let created = false;
  if (targetSession) {
    const clean = targetSession.endsWith(".sqlite") ? resolve2(targetSession, "..") : targetSession;
    directory = clean.includes("/") || clean.includes("\\") ? resolve2(clean) : join2(root, clean);
    try {
      await mkdir(directory, { recursive: true });
      const entries = await readdir(directory);
      if (!entries.includes("session.sqlite")) {
        created = true;
      }
    } catch (err) {
      logUnexpectedErr(err, "ENOENT", `Directory inspection failed in ${directory}`);
    }
  } else if (continueSession) {
    const entries = await readdir(root, { withFileTypes: true });
    const newest = entries.filter((entry) => entry.isDirectory() && /^\d{13}-[0-9a-f-]{36}$/u.test(entry.name)).map((entry) => entry.name).sort().at(-1);
    if (!newest) throw new Error(`No durable session exists for ${cwd}`);
    directory = join2(root, newest);
  } else {
    directory = join2(root, `${String(Date.now()).padStart(13, "0")}-${randomUUID()}`);
    await mkdir(directory);
    created = true;
  }
  const id = basename(directory);
  const release = await acquireSessionLock(directory, cwd, id);
  return { id, directory, database: join2(directory, "session.sqlite"), cwd, created, release };
}

// packages/core/src/runtime-types.ts
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  ROOT_CONVERSATION_ID
} from "@earendil-works/pi-durable";
var runtimeContext = BACKGROUND_CONTEXT;
function agentOf(view) {
  return view.docs["pi.agent"] ?? {};
}
function titleOf(entry) {
  const message = entry?.model?.[0];
  if (message?.role !== "user") return {};
  const text = typeof message.content === "string" ? message.content : message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join(" ");
  return { title: text.replace(/\s+/g, " ").trim() };
}
async function firstInput(harness, id) {
  if (id === ROOT_CONVERSATION_ID) return {};
  const conversation = await harness.conversation(id, runtimeContext);
  let first;
  let cursor;
  do {
    const page = await conversation.entries({}, 256, cursor, runtimeContext);
    first = [...page.items].reverse().find((entry) => entry.kind === "pi.user") ?? first;
    cursor = page.next;
  } while (cursor !== void 0);
  return titleOf(first);
}

// packages/core/src/compaction-hooks.ts
var CompactionSideEffectError = class extends Error {
  code;
  operation;
  constructor(operation, cause) {
    const code = operation === "compact_context" ? "CONTEXT_RETRIEVAL_FAILED" : "COMPACTION_HOOK_FAILED";
    super(`${operation} failed (${code})`, { cause });
    this.name = "CompactionSideEffectError";
    this.operation = operation;
    this.code = code;
  }
};
async function runCompactionSideEffect(operation, action, notice) {
  try {
    return { status: "succeeded", value: await action() };
  } catch (cause) {
    const error = new CompactionSideEffectError(operation, cause);
    notice("warning", error.message);
    return { status: "failed", error };
  }
}

// packages/core/src/runtime-controller.ts
import { clampThinkingLevel, getSupportedThinkingLevels as getSupportedThinkingLevels2 } from "@earendil-works/pi-ai";

// packages/core/src/runtime-hydration.ts
function hydrateSessionActiveTools(rootAgent, activeEnvState) {
  if (Array.isArray(rootAgent.tools)) {
    activeEnvState.setActiveTools?.(rootAgent.tools.map((t) => t.name));
  }
}
async function createConversationBinding(conversation, ctx = runtimeContext) {
  if (typeof conversation.viewState === "function") {
    return conversation.viewState(ctx);
  }
  const watch = await conversation.watch(ctx);
  let currentVal = watch.value;
  const subscribers = /* @__PURE__ */ new Set();
  watch.start(async ({ value }) => {
    currentVal = value;
    for (const sub of subscribers) sub(value);
  });
  return {
    get value() {
      return currentVal;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      void watch.stop(ctx);
    }
  };
}
async function createTaskGraphBinding(harness, ctx = runtimeContext) {
  if (typeof harness.taskGraph === "function") {
    return harness.taskGraph(ctx);
  }
  const watch = await harness.watchTaskGraph(ctx);
  let currentVal = watch.value;
  const subscribers = /* @__PURE__ */ new Set();
  watch.start(async ({ value }) => {
    currentVal = value;
    for (const sub of subscribers) sub(value);
  });
  return {
    get value() {
      return currentVal;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      void watch.stop(ctx);
    }
  };
}
async function loadSummaries(harness, rootId) {
  const summaries = [];
  let cursor;
  do {
    const page = await harness.commit((tx) => tx.scanConversations({}, 256, cursor), runtimeContext);
    for (const { id } of page.items) summaries.push({ id, label: id === rootId ? "main" : `subagent ${id}`, ...await firstInput(harness, id) });
    cursor = page.next;
  } while (cursor !== void 0);
  return summaries;
}

// packages/core/src/runtime-controller.ts
function createDurableController(ctx) {
  let queue = Promise.resolve();
  const command = (operation) => {
    queue = queue.then(operation).catch(ctx.fail);
    return queue;
  };
  const watchAnswer = (submission) => {
    void submission.wait(runtimeContext).then(async (settled) => {
      if (settled.status === "unanswered" && settled.reason !== "aborted") {
        ctx.notice(
          "error",
          `No answer: ${settled.reason}${settled.detail === void 0 ? "" : ` ${JSON.stringify(settled.detail)}`}`
        );
      }
      if (ctx.extensionRunner) {
        try {
          await ctx.extensionRunner.emit({ type: "agent_end", messages: [] });
          await ctx.extensionRunner.emit({ type: "agent_settled", aborted: settled.status === "unanswered" && settled.reason === "aborted" });
        } catch (err) {
          ctx.notice("warning", `agent lifecycle hook error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }, ctx.fail);
  };
  const agentModel = () => {
    const ref = agentOf(ctx.getState().conversation).model;
    const model = ref === void 0 ? void 0 : ctx.modelRuntime.getModel(ref.provider, ref.modelId);
    if (model === void 0) {
      throw new Error(ref === void 0 ? "No model selected" : "Current model is unavailable");
    }
    return model;
  };
  return {
    submit: (input, whenBusy) => command(async () => {
      const isStr = typeof input === "string";
      const prompt = isStr ? input : input.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      const images = isStr ? void 0 : input.filter((c) => c.type === "image");
      if (ctx.extensionRunner) {
        try {
          const currentAgent = await ctx.bindings.current.agent(runtimeContext);
          const activeTools = currentAgent.tools.map((t) => t.name);
          const hookRes = await ctx.extensionRunner.emitBeforeAgentStart(
            { messageType: "user", prompt, images: images?.length ? images : void 0 },
            {
              cwd: ctx.cwd ?? process.cwd(),
              selectedTools: activeTools,
              sections: ctx.dynamicSections?.getSections() ?? {}
            }
          );
          if (hookRes?.systemPromptOptions?.sections && ctx.dynamicSections) {
            ctx.dynamicSections.updateSections(hookRes.systemPromptOptions.sections);
          }
          const selectedTools = hookRes?.systemPromptOptions?.selectedTools;
          const handlerEdited = selectedTools && (selectedTools.length !== activeTools.length || selectedTools.some((name, i) => name !== activeTools[i]));
          const nextActiveTools = handlerEdited ? selectedTools : ctx.getActiveTools?.() ?? ctx.extensionRunner?.getActiveTools?.() ?? activeTools;
          if (handlerEdited && ctx.setActiveTools) ctx.setActiveTools(selectedTools);
          if (nextActiveTools && (nextActiveTools.length !== activeTools.length || nextActiveTools.some((name, i) => name !== activeTools[i]))) {
            await ctx.bindings.current.configure({ modelTools: nextActiveTools.map((name) => ({ name })) }, runtimeContext);
          }
        } catch (err) {
          ctx.notice(
            "warning",
            `before_agent_start error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      return watchAnswer(await ctx.bindings.current.submit({ type: "input", content: input, whenBusy }, runtimeContext));
    }),
    compact: (instructions) => command(async () => {
      const extensionRunner = ctx.extensionRunner;
      if (extensionRunner) {
        const context = await runCompactionSideEffect("compact_context", () => ctx.bindings.current.context(runtimeContext), ctx.notice);
        if (context.status === "succeeded") {
          const ctxView = context.value;
          const msgs = [...ctxView.messages], entries = [...ctxView.entries];
          await runCompactionSideEffect("session_before_compact", () => extensionRunner.emit({
            type: "session_before_compact",
            preparation: { firstKeptEntryId: ctxView.head?.id !== void 0 ? String(ctxView.head.id) : "", messagesToSummarize: msgs, turnPrefixMessages: [], isSplitTurn: false, tokensBefore: 0, fileOps: { read: /* @__PURE__ */ new Set(), written: /* @__PURE__ */ new Set(), edited: /* @__PURE__ */ new Set() }, settings: {} },
            branchEntries: entries,
            customInstructions: instructions,
            reason: "manual",
            willRetry: false,
            signal: new AbortController().signal
          }), ctx.notice);
        }
      }
      const id = await ctx.bindings.current.compact(instructions, runtimeContext);
      void ctx.opened.waitForTask(id, runtimeContext).then(async (receipt) => {
        const outcome = receipt.state.outcome;
        if (outcome.status === "completed") {
          if (extensionRunner) {
            void runCompactionSideEffect("session_compact", () => extensionRunner.emit({
              type: "session_compact",
              compactionEntry: { id: outcome.result?.entryId ?? "", type: "compaction", summary: "", tokensBefore: 0, tokensAfter: 0 },
              fromExtension: false,
              reason: "manual",
              willRetry: false
            }), ctx.notice).catch(ctx.fail);
          }
          const { entryId, submissionId } = outcome.result;
          const status = submissionId === void 0 ? void 0 : (await (await ctx.opened.submission(submissionId, runtimeContext))?.status(runtimeContext))?.status;
          const msg = entryId !== void 0 || status === "done" ? "Compacted." : status === "queued" ? "Compaction summary queued; it is placed at the next turn boundary." : status === "unanswered" ? "Compaction summary dropped: the context changed under it." : "Nothing to compact: the context fits in the recent window that is kept verbatim.";
          ctx.notice("info", msg);
        } else if (outcome.status === "aborted") {
          ctx.notice("info", "Compaction aborted.");
        } else {
          ctx.notice("error", `Compaction ${outcome.status}: ${outcome.error?.message ?? outcome.reason ?? ""}`);
        }
      }).catch(ctx.fail);
    }),
    abort: () => command(async () => {
      await ctx.bindings.current.abort(runtimeContext, { background: true });
      const childConversationIds = [];
      await ctx.bindings.current.commit(async (tx) => {
        const doc = await tx.doc(SubagentsDoc, ctx.bindings.current.id);
        for (const agent of Object.values(doc?.agents ?? {})) {
          if (!agent.settled && agent.conversationId) {
            childConversationIds.push(agent.conversationId);
          }
        }
      }, runtimeContext).catch((err) => {
        ctx.notice("warning", `Cascade abort read error: ${err}`);
      });
      for (const childId of childConversationIds) {
        const child = await ctx.opened.conversation(childId, runtimeContext).catch((err) => {
          ctx.notice("warning", `Failed to access subagent: ${err}`);
          return void 0;
        });
        if (child) {
          await child.abort(runtimeContext, { background: true }).catch((err) => {
            ctx.notice("warning", `Failed to abort subagent: ${err}`);
          });
        }
      }
    }),
    cycleThinking: () => command(async () => {
      const model = agentModel();
      if (!model.reasoning) throw new Error("Current model does not support thinking");
      const levels = getSupportedThinkingLevels2(model), level = agentOf(ctx.getState().conversation).thinkingLevel ?? "off";
      await ctx.bindings.current.configure({ thinkingLevel: levels[(levels.indexOf(level) + 1) % levels.length] ?? "off" }, runtimeContext);
    }),
    setThinkingLevel: (targetLevel) => command(async () => {
      const model = agentModel();
      if (!model.reasoning) {
        if (targetLevel === "off" || targetLevel === "none") {
          return void await ctx.bindings.current.configure({ thinkingLevel: "off" }, runtimeContext);
        }
        throw new Error("Current model does not support thinking");
      }
      await ctx.bindings.current.configure({ thinkingLevel: clampThinkingLevel(model, targetLevel) }, runtimeContext);
    }),
    setModel: (ref) => command(async () => {
      const model = ctx.modelRuntime.getModel(ref.provider, ref.modelId);
      if (model === void 0) throw new Error(`Unknown model: ${ref.provider}/${ref.modelId}`);
      ctx.setActiveModelRef(ref);
      const thinking = agentOf(ctx.getState().conversation).thinkingLevel ?? "off";
      await ctx.bindings.current.configure({ model: ref, thinkingLevel: clampThinkingLevel(model, thinking) }, runtimeContext);
    }),
    toggleTasks: () => command(async () => {
      if (ctx.bindings.tasksOpen) return ctx.bindings.closeTasks();
      ctx.bindings.attachTasks(await createTaskGraphBinding(ctx.opened, runtimeContext));
    }),
    switchConversation: (id) => command(async () => {
      const next = await ctx.opened.conversation(id, runtimeContext);
      if (next === void 0) throw new Error(`Conversation ${id} does not exist`);
      ctx.bindings.bindConversation(next, await createConversationBinding(next, runtimeContext));
    })
  };
}

// packages/core/src/runtime-bindings.ts
var RuntimeBindings = class {
  conversation;
  view;
  unsubscribe;
  tasks;
  unsubscribeTasks;
  epoch = 0;
  taskEpoch = 0;
  closed = false;
  update;
  constructor(conversation, view, update) {
    this.conversation = conversation;
    this.view = view;
    this.update = update;
    try {
      this.unsubscribe = view.subscribe((value) => {
        if (!this.closed && this.epoch === 0) this.update({ conversation: value });
      });
    } catch (cause) {
      try {
        view.dispose();
      } catch (cleanup) {
        throw new AggregateError([cause, cleanup], "SUBSCRIBE_FAILED");
      }
      throw new Error("SUBSCRIBE_FAILED", { cause });
    }
  }
  get current() {
    return this.conversation;
  }
  get tasksOpen() {
    return this.tasks !== void 0;
  }
  bindConversation(conversation, view) {
    if (this.closed) {
      view.dispose();
      throw new Error("BINDING_CLOSED");
    }
    if (this.view === view) return;
    const epoch = this.epoch + 1;
    let unsubscribe;
    try {
      unsubscribe = view.subscribe((value) => {
        if (!this.closed && this.epoch === epoch) this.update({ conversation: value });
      });
    } catch (cause) {
      view.dispose();
      throw new Error("SUBSCRIBE_FAILED", { cause });
    }
    const previous = this.view, previousUnsubscribe = this.unsubscribe;
    this.view = view;
    this.conversation = conversation;
    this.unsubscribe = unsubscribe;
    this.epoch = epoch;
    try {
      previousUnsubscribe();
    } finally {
      previous.dispose();
    }
    this.update({ conversation: view.value });
  }
  attachTasks(view) {
    if (this.closed) {
      view.dispose();
      throw new Error("BINDING_CLOSED");
    }
    if (this.tasks === view) return;
    const epoch = this.taskEpoch + 1;
    let unsubscribe;
    try {
      unsubscribe = view.subscribe((value) => {
        if (!this.closed && this.taskEpoch === epoch) this.update({ tasks: value });
      });
    } catch (cause) {
      view.dispose();
      throw new Error("SUBSCRIBE_FAILED", { cause });
    }
    const previous = this.tasks, previousUnsubscribe = this.unsubscribeTasks;
    this.tasks = view;
    this.unsubscribeTasks = unsubscribe;
    this.taskEpoch = epoch;
    try {
      previousUnsubscribe?.();
    } finally {
      previous?.dispose();
    }
    this.update({ tasks: view.value });
  }
  closeTasks() {
    if (!this.tasks) return;
    this.taskEpoch++;
    const previous = this.tasks, unsubscribe = this.unsubscribeTasks;
    this.tasks = void 0;
    this.unsubscribeTasks = void 0;
    try {
      unsubscribe?.();
    } finally {
      previous.dispose();
    }
    if (!this.closed) this.update({ tasks: void 0 });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.epoch++;
    try {
      this.unsubscribe();
    } finally {
      try {
        this.view.dispose();
      } finally {
        this.closeTasks();
      }
    }
  }
};

// packages/core/src/runtime-cleanup.ts
async function closeRuntimeResources(operations) {
  const failures = [];
  for (const operation of operations) {
    try {
      await operation();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length) throw new AggregateError(failures, "RUNTIME_CLEANUP_FAILED");
}

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

// packages/core/src/shared/extension-ui-context.ts
function createExtensionUIContext(onNotice) {
  return {
    select: async () => void 0,
    confirm: async () => false,
    input: async () => void 0,
    notify: (message, type = "info") => {
      onNotice?.(type, message);
    },
    onTerminalInput: () => () => {
    },
    setStatus: () => {
    },
    setWorkingMessage: () => {
    },
    setWorkingVisible: () => {
    },
    setWorkingIndicator: () => {
    },
    setHiddenThinkingLabel: () => {
    },
    setWidget: () => {
    },
    setFooter: () => {
    },
    setHeader: () => {
    },
    setTitle: () => {
    },
    custom: async () => void 0,
    pasteToEditor: () => {
    },
    setEditorText: () => {
    },
    getEditorText: () => "",
    editor: async () => void 0,
    addAutocompleteProvider: () => {
    },
    setEditorComponent: () => {
    },
    getEditorComponent: () => void 0,
    theme: {},
    getAllThemes: () => [],
    getTheme: () => void 0,
    setTheme: () => ({ success: true }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {
    }
  };
}

// packages/core/src/shared/extension-runner.ts
function createStandardExtensionFactories() {
  return [createMcpExtension()];
}
function createExtensionActions(options, initialActiveTools = []) {
  let activeToolNames = [...initialActiveTools];
  let sessionName;
  const sendMessage = (message, sendOptions) => {
    if (sendOptions?.triggerTurn && message?.content) {
      const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      void options.onSubmitUserMessage?.(text, sendOptions.deliverAs === "steer" ? "steer" : "followUp");
    }
  };
  const sendUserMessage = (content, sendOptions) => {
    void options.onSubmitUserMessage?.(content, sendOptions?.deliverAs);
  };
  return {
    getActiveTools: () => activeToolNames,
    getAllTools: () => {
      const map = /* @__PURE__ */ new Map();
      if (options.getCallableTools) {
        for (const t of options.getCallableTools()) {
          map.set(t.name, {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            exposure: "direct",
            reachesTools: t.name === "codemode" || t.name === "tool_search"
          });
        }
      }
      if (options.getRegisteredTools) {
        for (const t of options.getRegisteredTools()) {
          map.set(t.definition.name, {
            name: t.definition.name,
            description: t.definition.description,
            parameters: t.definition.parameters,
            promptGuidelines: t.definition.promptGuidelines,
            exposure: t.definition.exposure ?? "direct",
            namespace: t.definition.namespace,
            annotations: t.definition.annotations,
            sourceInfo: t.sourceInfo
          });
        }
      }
      return Array.from(map.values());
    },
    getSettings: () => ({
      ...options.settingsManager?.getGlobalSettings() ?? {},
      ...options.settingsManager?.getProjectSettings() ?? {}
    }),
    setActiveTools: (toolNames) => {
      activeToolNames = [...toolNames];
      options.onActiveToolsChanged?.(activeToolNames);
    },
    refreshTools: () => {
      options.onToolsChanged?.();
    },
    getThinkingLevel: () => options.settingsManager?.getDefaultThinkingLevel?.() ?? "high",
    setThinkingLevel: () => {
    },
    setModel: async () => false,
    getCommands: () => [],
    sendMessage,
    sendUserMessage,
    appendEntry: (customType, data) => {
      options.sessionManager?.appendCustomEntry(customType, data);
    },
    setSessionName: (name) => {
      sessionName = name;
    },
    getSessionName: () => sessionName,
    setLabel: () => {
    }
  };
}
async function setupExtensionRunner(options) {
  const sessionManager = SessionManager.create(options.cwd);
  const modelRegistry = new ModelRegistry(options.modelRuntime);
  const runner = new ExtensionRunner(options.extensions, options.runtime, options.cwd, sessionManager, modelRegistry);
  runner.setUIContext(createExtensionUIContext(options.onNotice));
  const initialActive = options.initialActiveTools ? [...options.initialActiveTools] : options.getCallableTools ? options.getCallableTools().map((t) => t.name) : [];
  const actions = createExtensionActions({
    getRegisteredTools: () => runner.getAllRegisteredTools(),
    getCallableTools: options.getCallableTools,
    settingsManager: options.settingsManager,
    onActiveToolsChanged: options.onActiveToolsChanged,
    onToolsChanged: options.onToolsChanged,
    sessionManager,
    onSubmitUserMessage: options.onSubmitUserMessage
  }, initialActive);
  const contextActions = {
    getModel: () => {
      const active = options.settingsManager?.getDefaultModel?.();
      const provider = options.settingsManager?.getDefaultProvider?.();
      if (active && provider) {
        const found = options.modelRuntime.getModel(provider, active);
        if (found) return found;
      }
      return options.modelRuntime.getAvailableSnapshot()[0];
    },
    getScopedModels: () => options.modelRuntime.getAvailableSnapshot().map((model) => ({ model })),
    isIdle: () => options.isIdle ? options.isIdle() : true,
    isProjectTrusted: () => true,
    getSignal: () => void 0,
    abort: () => {
      options.onAbort?.();
    },
    hasPendingMessages: () => false,
    shutdown: () => {
    },
    getContextUsage: () => {
      const u = options.getContextUsage?.();
      if (!u) return void 0;
      const pct = typeof u.tokens === "number" && u.contextWindow > 0 ? u.tokens / u.contextWindow * 100 : null;
      return { tokens: u.tokens, contextWindow: u.contextWindow, percent: pct };
    },
    compact: (opts) => {
      options.onCompact?.(typeof opts === "string" ? opts : opts?.customInstructions);
    },
    getSystemPrompt: () => "",
    getSystemPromptOptions: () => ({ cwd: options.cwd }),
    executeTool: (callerId, name, args, opts) => options.executeToolFn(callerId, name, args, opts),
    getCallableTools: () => options.getCallableTools ? options.getCallableTools() : runner.getAllRegisteredTools().map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
      promptGuidelines: t.definition.promptGuidelines,
      exposure: t.definition.exposure,
      namespace: t.definition.namespace,
      annotations: t.definition.annotations,
      sourceInfo: t.sourceInfo
    }))
  };
  runner.bindCore(actions, contextActions);
  await runner.emit({ type: "session_start", reason: "startup" });
  return runner;
}

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
function hasOutput(api) {
  return typeof api === "object" && api !== null && "output" in api && typeof api.output === "function";
}
function createStandardExtensionFactories2() {
  return [createMcpExtension2()];
}
function adaptExtensionTool(toolDef, executeToolFn, createToolContext, getExtensionRunner) {
  const exposure = toolDef.exposure;
  const isDeferred = exposure === "deferred";
  const callers = exposure === "model-only" ? ["model"] : exposure === "codemode" || exposure === "codemode-deferred" ? ["tools"] : exposure === "hidden" ? [] : ["model", "tools"];
  return defineTool2({
    name: toolDef.name,
    description: toolDef.description,
    parameters: toolDef.parameters,
    callers,
    ...toolDef.promptSnippet ? { promptSnippet: toolDef.promptSnippet } : {},
    ...toolDef.promptGuidelines?.length ? { promptGuidelines: toolDef.promptGuidelines } : {},
    ...isDeferred ? { deferred: true } : {},
    ...toolDef.outputSchema ? {
      outputSchema: toolDef.outputSchema,
      structuredOutputSchema: toolDef.outputSchema
    } : {},
    async execute(args, api, runtimeContext2) {
      const runner = getExtensionRunner?.();
      const abortSignal = runtimeContext2?.abortSignal;
      if (runner?.hasHandlers("tool_call")) {
        const hookResult = await runner.emitToolCall({
          type: "tool_call",
          toolName: toolDef.name,
          toolCallId: api.callId,
          input: args ?? {}
        });
        if (hookResult?.block) {
          const blockContent = [{ type: "text", text: `Tool execution blocked: ${hookResult.reason ?? "policy"}` }];
          return {
            output: blockContent,
            isError: true
          };
        }
      }
      const base = createToolContext?.(api.callId);
      const descriptors = {
        ...Object.getOwnPropertyDescriptors(base ?? {}),
        tools: {
          get: () => base?.tools ?? [],
          configurable: true,
          enumerable: true
        },
        executeTool: {
          value: async (name, nestedArgs, options) => base?.executeTool ? base.executeTool(name, nestedArgs, options) : executeToolFn(api.callId, name, nestedArgs, options),
          configurable: true,
          enumerable: true,
          writable: true
        }
      };
      const ctx = Object.defineProperties({}, descriptors);
      const coercedArgs = schemaPort.coerce(toolDef.parameters, args);
      try {
        const result = await toolDef.execute(
          api.callId,
          coercedArgs,
          abortSignal,
          (update) => {
            if (update?.content && hasOutput(api)) {
              const textChunks = update.content.filter((c) => c.type === "text").map((c) => c.text).join("");
              if (textChunks.length > 0) api.output(textChunks);
            }
          },
          ctx
        );
        if (runner?.hasHandlers("tool_result")) {
          await runner.emitToolResult({
            type: "tool_result",
            toolName: toolDef.name,
            toolCallId: api.callId,
            input: args ?? {},
            content: result.content,
            details: result.details ?? void 0,
            isError: result.isError ?? false
          });
        }
        const structuredOutput = result.structuredContent !== void 0 ? result.structuredContent : result.structuredOutput;
        return {
          output: result.content,
          isError: result.isError,
          details: result.details ?? void 0,
          ...structuredOutput !== void 0 ? { structuredOutput } : {}
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorContent = [{ type: "text", text: message }];
        if (runner?.hasHandlers("tool_result")) {
          await runner.emitToolResult({
            type: "tool_result",
            toolName: toolDef.name,
            toolCallId: api.callId,
            input: args ?? {},
            content: errorContent,
            details: void 0,
            isError: true
          });
        }
        return {
          output: errorContent,
          isError: true
        };
      }
    }
  });
}
function installExtensionTools(registry, tools) {
  if (tools.length === 0) return;
  registry.install(defineExtension3({ name: "extension-tools", tools }));
}

// packages/core/src/extension-mount.ts
import "@earendil-works/pi-coding-agent";
function createNestedToolExecutor(registry, getExtensionRunner, getEnv) {
  return async (callerId, name, args, options) => {
    const runner = getExtensionRunner?.();
    let target = registry.snapshot().tools().find((t) => t.tool.name === name);
    if (!target && runner) {
      const toolDef = runner.getAllRegisteredTools().find((t) => t.definition.name === name);
      if (toolDef) {
        const ctx = (callId) => runner.createToolContext(callId, options?.signal);
        const adapted = adaptExtensionTool(toolDef.definition, createNestedToolExecutor(registry, getExtensionRunner, getEnv), ctx, () => runner);
        installExtensionTools(registry, [adapted]);
        target = registry.snapshot().tools().find((t) => t.tool.name === name);
      }
    }
    if (!target) {
      return { toolCall: { type: "toolCall", id: `${callerId}/nested`, name, arguments: args }, result: { content: [{ type: "text", text: `Tool ${name} not found` }], details: {} }, isError: true };
    }
    if (runner?.hasHandlers("tool_call")) {
      const hook = await runner.emitToolCall({
        type: "tool_call",
        toolName: name,
        toolCallId: `${callerId}/nested`,
        parentToolCallId: callerId,
        input: args ?? {}
      });
      if (hook?.block) {
        return {
          toolCall: { type: "toolCall", id: `${callerId}/nested`, name, arguments: args },
          result: { content: [{ type: "text", text: `Tool execution blocked: ${hook.reason ?? "policy"}` }], details: {} },
          isError: true
        };
      }
    }
    try {
      const executor = target.tool.execute;
      let outputText = "";
      const api = {
        callId: `${callerId}/nested`,
        output: (chunk) => {
          outputText += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        },
        retainedOutput: () => ({ text: outputText, truncated: false }),
        outputWindow: void 0,
        env: getEnv?.(),
        diagnostic: () => {
        }
      };
      const res = await executor(args, api, runtimeContext);
      const rawBlocks = res?.output;
      const content = Array.isArray(rawBlocks) ? rawBlocks : rawBlocks !== void 0 ? [{ type: "text", text: String(rawBlocks) }] : [{ type: "text", text: outputText }];
      if (runner?.hasHandlers("tool_result")) {
        await runner.emitToolResult({
          type: "tool_result",
          toolName: name,
          toolCallId: `${callerId}/nested`,
          parentToolCallId: callerId,
          input: args ?? {},
          content,
          details: res?.details,
          isError: !!res?.isError
        });
      }
      const structuredOutput = res?.structuredContent !== void 0 ? res.structuredContent : res?.structuredOutput;
      return {
        toolCall: { type: "toolCall", id: `${callerId}/nested`, name, arguments: args },
        result: {
          content,
          details: res?.details,
          ...structuredOutput !== void 0 ? { structuredOutput } : {}
        },
        isError: !!res?.isError
      };
    } catch (err) {
      const errorContent = [{ type: "text", text: err instanceof Error ? err.message : String(err) }];
      if (runner?.hasHandlers("tool_result")) {
        await runner.emitToolResult({
          type: "tool_result",
          toolName: name,
          toolCallId: `${callerId}/nested`,
          parentToolCallId: callerId,
          input: args ?? {},
          content: errorContent,
          details: {},
          isError: true
        });
      }
      return { toolCall: { type: "toolCall", id: `${callerId}/nested`, name, arguments: args }, result: { content: errorContent, details: {} }, isError: true };
    }
  };
}
async function mountExtensionBridge(location, modelRuntime, extensionsResult, registry, executeToolFn, report, dynamicSections, onNotice, settingsManager, dynamicNamespaces, actionsDelegate) {
  let extensionRunner;
  try {
    const syncToolsToRegistry = () => {
      if (!extensionRunner) return;
      const all = extensionRunner.getAllRegisteredTools();
      dynamicNamespaces?.registerFromToolDefinitions(all.map((t) => t.definition));
      const adapted = all.map(
        (t) => adaptExtensionTool(t.definition, executeToolFn, (callId) => extensionRunner.createToolContext(callId, void 0), () => extensionRunner)
      );
      installExtensionTools(registry, adapted);
    };
    extensionRunner = await setupExtensionRunner({
      extensions: extensionsResult.extensions,
      runtime: extensionsResult.runtime,
      cwd: location.cwd,
      modelRuntime,
      executeToolFn,
      getCallableTools: () => {
        const map = /* @__PURE__ */ new Map();
        for (const t of registry.snapshot().tools()) {
          map.set(t.tool.name, { name: t.tool.name, description: t.tool.description ?? "", parameters: t.tool.parameters });
        }
        for (const t of extensionRunner?.getAllRegisteredTools() ?? []) {
          map.set(t.definition.name, { ...t.definition, sourceInfo: t.sourceInfo });
        }
        return Array.from(map.values());
      },
      onToolsChanged: syncToolsToRegistry,
      onActiveToolsChanged: (tools) => {
        try {
          void actionsDelegate?.onConfigureModelTools?.(tools)?.catch((err) => console.warn("[ExtensionMount] Configure model tools error:", err));
        } catch (err) {
          console.warn("[ExtensionMount] Synchronous error configuring model tools:", err);
        }
      },
      onNotice,
      settingsManager,
      onAbort: () => actionsDelegate?.onAbort?.(),
      onCompact: (i) => actionsDelegate?.onCompact?.(i),
      getContextUsage: () => actionsDelegate?.getContextUsage?.(),
      isIdle: () => actionsDelegate?.isIdle ? actionsDelegate.isIdle() : true,
      onSubmitUserMessage: (c, d) => actionsDelegate?.onSubmitUserMessage?.(c, d)
    });
    if (extensionRunner) {
      extensionRunner.onError((err) => {
        report(err);
        onNotice?.("error", `[Extension Error] ${err.extensionPath} (${err.event}): ${err.error}`);
      });
      syncToolsToRegistry();
      try {
        await new Promise((r) => setImmediate(r));
        const currentTools = extensionRunner.getActiveTools?.() ?? registry.snapshot().tools().map((t) => t.tool.name);
        const beforeStart = await extensionRunner.emitBeforeAgentStart(
          { messageType: "user", prompt: "", images: void 0 },
          { cwd: location.cwd, selectedTools: currentTools, sections: dynamicSections?.getSections() ?? {} }
        );
        if (beforeStart?.systemPromptOptions?.sections && dynamicSections) {
          dynamicSections.updateSections(beforeStart.systemPromptOptions.sections);
        }
        const selected = beforeStart?.systemPromptOptions?.selectedTools;
        if (selected && (selected.length !== currentTools.length || selected.some((t, i) => t !== currentTools[i]))) {
          extensionsResult.runtime.setActiveTools?.(selected);
        }
      } catch (err) {
        report(err);
      }
    }
  } catch (error) {
    report(error);
  }
  return {
    extensionRunner,
    cleanup: () => extensionRunner?.emit({ type: "session_shutdown", reason: "quit" }).catch((err) => console.warn("[ExtensionBridge] Cleanup session_shutdown:", err)) ?? Promise.resolve(),
    setActiveTools: (tools) => extensionsResult.runtime.setActiveTools?.(tools),
    getActiveTools: () => extensionsResult.runtime.getActiveTools?.() ?? []
  };
}

// packages/core/src/runtime-loader.ts
import { Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

// packages/core/src/codemode-namespaces.ts
var DynamicCodemodeNamespaces = class {
  list = [];
  seen = /* @__PURE__ */ new Set();
  getNamespaces() {
    return this.list;
  }
  registerNamespace(ns) {
    if (this.seen.has(ns.prefix)) {
      const idx = this.list.findIndex((n) => n.prefix === ns.prefix);
      if (idx !== -1) {
        const existing = this.list[idx];
        this.list[idx] = {
          name: ns.name || existing.name,
          prefix: ns.prefix,
          description: ns.description ?? existing.description,
          instructions: ns.instructions ?? existing.instructions
        };
      }
      return;
    }
    this.seen.add(ns.prefix);
    this.list.push(ns);
  }
  registerFromToolDefinitions(toolDefs) {
    for (const def of toolDefs) {
      const match = def.name.match(/^mcp__([a-zA-Z0-9_\-]+?)__/);
      if (match && match[1]) {
        const serverName = match[1];
        const prefix = `mcp__${serverName}__`;
        this.registerNamespace({
          name: def.namespace?.name ?? serverName,
          prefix,
          ...def.namespace?.description ? { description: def.namespace.description } : {},
          ...def.namespace?.instructions ? { instructions: def.namespace.instructions } : {}
        });
      } else if (def.namespace?.name) {
        const name = def.namespace.name;
        const prefix = def.name.startsWith(`${name}__`) ? `${name}__` : def.name.startsWith(`${name}_`) ? `${name}_` : `${name}:`;
        this.registerNamespace({
          name,
          prefix,
          ...def.namespace.description ? { description: def.namespace.description } : {},
          ...def.namespace.instructions ? { instructions: def.namespace.instructions } : {}
        });
      }
    }
  }
};

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

// packages/core/src/subagent-policy-state.ts
function createSubagentPolicyHolder(options) {
  let currentRecord = options.initialRecord ? subagentPolicyRecordSchema.parse(options.initialRecord) : {
    version: 1,
    revision: 0,
    policy: { mode: "inherit" }
  };
  let writeQueue = Promise.resolve();
  return {
    getRecord() {
      return structuredClone(currentRecord);
    },
    async setRecord(record) {
      const validated = subagentPolicyRecordSchema.parse(record);
      return new Promise((resolve3, reject) => {
        writeQueue = writeQueue.catch(() => {
        }).then(async () => {
          try {
            if (validated.revision < currentRecord.revision) {
              throw new SubagentRevisionConflictError(
                `Revision downgrade rejected: incoming revision ${validated.revision} < current ${currentRecord.revision}`
              );
            }
            if (validated.revision === currentRecord.revision) {
              const currentStr = JSON.stringify(currentRecord);
              const incomingStr = JSON.stringify(validated);
              if (currentStr === incomingStr) {
                resolve3();
                return;
              }
              throw new SubagentRevisionConflictError(
                `Revision conflict: revision ${validated.revision} already exists with different payload`
              );
            }
            await options.persist(validated);
            currentRecord = validated;
            resolve3();
          } catch (error) {
            reject(error);
          }
        });
      });
    }
  };
}

// packages/core/src/subagent-policy-ack.ts
var SubagentPolicyAckDoc = defineDoc2({
  kind: "durable.subagent-policy-ack",
  version: 1,
  scope: "session",
  checkpointWhen: () => false,
  initial: () => ({ record: null })
});
async function loadSubagentPolicyHolder(harness) {
  let initialRecord;
  await harness.commit(async (tx) => {
    const doc = await tx.doc(SubagentPolicyAckDoc);
    if (doc.record !== null && doc.record !== void 0) {
      const parsed = subagentPolicyRecordSchema.safeParse(doc.record);
      if (!parsed.success) {
        throw new SubagentPolicyLoadError("Stored subagent policy ACK is corrupted", {
          cause: parsed.error
        });
      }
      initialRecord = parsed.data;
    }
  }, runtimeContext);
  return createSubagentPolicyHolder({
    initialRecord,
    persist: async (record) => {
      await harness.commit(async (tx) => {
        const doc = await tx.doc(SubagentPolicyAckDoc);
        doc.record = record;
      }, runtimeContext);
    }
  });
}

// packages/core/src/runtime-loader.ts
function logRegError(kind, identifier, err) {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (!msg.includes("already registered") && !msg.includes("duplicate")) {
    console.warn(`[RuntimeLoader] Failed to register ${kind} '${identifier}': ${err instanceof Error ? err.message : String(err)}`);
  }
}
function registerPendingProviders(modelRuntime, runtime) {
  for (const { name, config } of runtime.pendingProviderRegistrations) {
    try {
      modelRuntime.registerProvider(name, config);
    } catch (err) {
      logRegError("provider", name, err);
    }
  }
  for (const { provider } of runtime.pendingNativeProviderRegistrations) {
    try {
      modelRuntime.registerNativeProvider(provider);
    } catch (err) {
      logRegError("native provider", provider?.id ?? "unknown", err);
    }
  }
  for (const { definition } of runtime.pendingVirtualModelRegistrations) {
    try {
      modelRuntime.registerVirtualModel(definition);
    } catch (err) {
      logRegError("virtual model", definition?.id ?? "unknown", err);
    }
  }
}
async function loadHarnessEnvironment(location, options, envs) {
  try {
    initTheme();
  } catch (err) {
    console.warn(`[RuntimeLoader] Theme initialization warning: ${err instanceof Error ? err.message : String(err)}`);
  }
  const modelRuntime = await ModelRuntime.create();
  const settingsManager = SettingsManager.create(location.cwd);
  const extEnv = process.env.PI_ADDITIONAL_EXTENSIONS;
  const extPaths = [
    ...options.cli?.extensions ?? (options.cli?.extension ? [options.cli.extension] : []),
    ...extEnv ? extEnv.split(",").map((s) => s.trim()).filter(Boolean) : []
  ];
  const resourceLoader = new DefaultResourceLoader({
    cwd: location.cwd,
    agentDir: getAgentDir(),
    settingsManager,
    extensionFactories: createStandardExtensionFactories(),
    additionalSkillPaths: options.cli?.skills,
    additionalExtensionPaths: extPaths.length > 0 ? extPaths : void 0,
    noExtensions: options.cli?.noGlobalExtensions ?? false
  });
  await resourceLoader.reload();
  const extensionsResult = resourceLoader.getExtensions();
  registerPendingProviders(modelRuntime, extensionsResult.runtime);
  configureHarnessHttp(settingsManager);
  let activeModelRef;
  const getActiveModel = () => {
    if (activeModelRef) return activeModelRef;
    const p = settingsManager.getDefaultProvider();
    const m = settingsManager.getDefaultModel();
    return p && m ? { provider: p, modelId: m } : void 0;
  };
  const dynamicSections = new DynamicPromptSections();
  const dynamicNamespaces = new DynamicCodemodeNamespaces();
  const settings = createHarnessSettings(settingsManager, getActiveModel);
  let subagentPolicyHolder;
  const getSubagentPolicy = () => {
    if (!subagentPolicyHolder) {
      throw new Error("Subagent policy accessed before runtime initialization");
    }
    return subagentPolicyHolder.getRecord();
  };
  const codingRegistry = await createCodingRegistry(
    settingsManager,
    location.cwd,
    getSubagentPolicy,
    { ...options.prompt, resourceLoader, dynamicSections },
    dynamicNamespaces,
    options.plugins
  );
  const registry = codingRegistry;
  const pendingReports = [];
  const report = (error) => pendingReports.push(error);
  let liveNoticeForwarder;
  let runnerRef;
  const executeToolFn = createNestedToolExecutor(
    registry,
    () => runnerRef,
    () => envs.env({ cwd: location.cwd })
  );
  const actionsDelegate = {};
  const mounted = await mountExtensionBridge(
    location,
    modelRuntime,
    extensionsResult,
    registry,
    executeToolFn,
    report,
    dynamicSections,
    (level, message) => {
      if (liveNoticeForwarder) {
        liveNoticeForwarder(level, message);
      } else {
        pendingReports.push({ kind: "notice", level, message });
      }
    },
    settingsManager,
    dynamicNamespaces,
    actionsDelegate
  );
  runnerRef = mounted.extensionRunner;
  let harness;
  const sessionCleanup = async () => {
    await codingRegistry.pluginRegistry.teardownAll().catch((err) => {
      console.warn("[RuntimeLoader] Plugin teardown error:", err);
    });
    await mounted.cleanup?.();
  };
  try {
    harness = await Harness.open(
      await openNodeSqliteStorage(location.database),
      { models: modelRuntime, registry, settings, env: envs.env, onReport: report },
      runtimeContext
    );
    subagentPolicyHolder = await loadSubagentPolicyHolder(harness);
  } catch (error) {
    await Promise.allSettled([
      harness?.close(runtimeContext),
      sessionCleanup()
    ]);
    throw error;
  }
  const initial = location.created ? await findInitialAgentModel(settingsManager, modelRuntime, options.cli) : void 0;
  if (initial?.model) activeModelRef = initial.model;
  return {
    modelRuntime,
    settingsManager,
    harness,
    subagentPolicyHolder,
    initialModelRef: initial?.model,
    initialThinkingLevel: initial?.thinkingLevel,
    fallbackMessage: initial?.fallbackMessage,
    pendingReports,
    getActiveModel,
    setActiveModelRef: (ref) => {
      activeModelRef = ref;
    },
    cleanup: sessionCleanup,
    extensionRunner: mounted.extensionRunner,
    actionsDelegate,
    dynamicSections,
    setNoticeForwarder: (forwarder) => {
      liveNoticeForwarder = forwarder;
    },
    setActiveTools: mounted.setActiveTools,
    getActiveTools: mounted.getActiveTools
  };
}

// packages/core/src/runtime.ts
async function openDurable(options = {}) {
  const location = await selectSession(options.cwd ?? process.cwd(), options.continueSession ?? false, options.session);
  const envs = new ExecutionEnvs(location.cwd);
  let harness;
  let envState;
  try {
    const activeEnvState = await loadHarnessEnvironment(location, options, envs);
    envState = activeEnvState;
    const { modelRuntime, settingsManager } = activeEnvState;
    harness = activeEnvState.harness;
    const initialTools = activeEnvState.extensionRunner?.getActiveTools?.();
    const root = await harness.root(runtimeContext, {
      agent: {
        cwd: location.cwd,
        ...activeEnvState.initialModelRef ? { model: activeEnvState.initialModelRef } : {},
        ...activeEnvState.initialThinkingLevel ? { thinkingLevel: activeEnvState.initialThinkingLevel } : {},
        ...Array.isArray(initialTools) ? { modelTools: initialTools.map((name) => ({ name })) } : {}
      }
    });
    if (!location.created) {
      const rootAgent = await root.agent(runtimeContext);
      if (rootAgent.model) activeEnvState.setActiveModelRef(rootAgent.model);
      hydrateSessionActiveTools(rootAgent, activeEnvState);
      if (options.cli !== void 0) {
        const cli = await findInitialAgentModel(settingsManager, modelRuntime, options.cli);
        if (cli.model) {
          activeEnvState.setActiveModelRef(cli.model);
          await root.configure({ model: cli.model, thinkingLevel: cli.thinkingLevel }, runtimeContext);
        } else if (cli.thinkingLevel !== void 0) {
          await root.configure({ thinkingLevel: cli.thinkingLevel }, runtimeContext);
        }
      }
    }
    const summaries = await loadSummaries(harness, root.id);
    const conversation = await createConversationBinding(root, runtimeContext);
    const enabled = settingsManager.getEnabledModels();
    const scoped = enabled?.length ? await resolveModelScopeWithDiagnostics(enabled, modelRuntime) : void 0;
    const scopedList = scoped?.scopedModels?.length ? scoped.scopedModels.map((sm) => sm.model) : modelRuntime.getAvailableSnapshot();
    const models = () => scopedList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name, contextWindow: m.contextWindow }));
    let state = {
      session: { id: location.id, directory: location.directory, cwd: location.cwd },
      conversation: conversation.value,
      conversations: summaries,
      models: models(),
      notices: []
    };
    const listeners = /* @__PURE__ */ new Set();
    let notifying = false;
    const update = (patch) => {
      state = { ...state, ...patch };
      if (notifying) return;
      notifying = true;
      setImmediate(() => {
        notifying = false;
        for (const listener of listeners) listener();
      });
    };
    let nextNotice = 1;
    const notice = (level, message) => {
      update({ notices: [...state.notices, { id: nextNotice++, level, message }].slice(-20) });
    };
    const fail = (err) => notice("error", err instanceof Error ? err.message : String(err));
    for (const report of activeEnvState.pendingReports) {
      if (report && typeof report === "object" && "kind" in report && report.kind === "notice") {
        const nr = report;
        notice(nr.level, nr.message);
      } else {
        notice("warning", report instanceof Error ? report.message : String(report));
      }
    }
    activeEnvState.setNoticeForwarder?.((level, message) => notice(level, message));
    const bindings = new RuntimeBindings(root, conversation, update);
    const handlePublication = (pub) => {
      let convs = state.conversations;
      for (const ch of pub.changes ?? []) {
        if (ch.type === "conversation") {
          convs = [...convs, { id: ch.value.id, label: ch.value.id === root.id ? "main" : `subagent ${ch.value.id}` }];
        } else if (ch.type === "entry" && ch.value.kind === "pi.user") {
          const id = ch.value.conversationId;
          convs = convs.map((s) => s.id === id && !s.title ? { ...s, ...titleOf(ch.value) } : s);
        }
      }
      if (convs !== state.conversations) update({ conversations: convs });
    };
    const observation = typeof harness.observeCommits === "function" ? harness.observeCommits({ advance: handlePublication, end: () => {
    } }) : void 0;
    const unsubscribeCommits = observation ? () => observation.detach?.() : harness.subscribeCommits?.(handlePublication);
    const opened = harness;
    const controller = createDurableController({
      bindings,
      opened,
      modelRuntime,
      getState: () => state,
      notice,
      fail,
      setActiveModelRef: (ref) => activeEnvState.setActiveModelRef(ref),
      extensionRunner: activeEnvState.extensionRunner,
      dynamicSections: activeEnvState.dynamicSections,
      cwd: location.cwd,
      setActiveTools: activeEnvState.setActiveTools,
      getActiveTools: activeEnvState.getActiveTools
    });
    if (activeEnvState.actionsDelegate) {
      activeEnvState.actionsDelegate.onAbort = () => {
        void controller.abort();
      };
      activeEnvState.actionsDelegate.onCompact = (i) => {
        void controller.compact(i);
      };
      activeEnvState.actionsDelegate.isIdle = () => true;
      activeEnvState.actionsDelegate.onSubmitUserMessage = async (content, deliverAs) => {
        await controller.submit(content, deliverAs ?? "followUp");
      };
      activeEnvState.actionsDelegate.onConfigureModelTools = async (tools) => {
        await root.configure({ modelTools: tools.map((name) => ({ name })) }, runtimeContext);
      };
      activeEnvState.actionsDelegate.getContextUsage = () => {
        const doc = state.conversation.docs["pi.agent"] ?? {};
        const p = doc.model?.provider, m = doc.model?.modelId ?? doc.model?.id;
        return { tokens: null, contextWindow: (p && m ? modelRuntime.getModel(p, m)?.contextWindow : void 0) ?? 128e3 };
      };
    }
    const saved = agentOf(state.conversation).model;
    if (!saved) notice("warning", "No model configured; select one with /model.");
    else if (!modelRuntime.getModel(saved.provider, saved.modelId)) {
      notice("warning", `Saved model is unavailable: ${saved.provider}/${saved.modelId}`);
    }
    if (activeEnvState.fallbackMessage) notice("info", activeEnvState.fallbackMessage);
    await controller.toggleTasks();
    harness.resume();
    let closing;
    return {
      view: {
        current: () => state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      },
      controller,
      settings: settingsManager,
      modelRuntime,
      harness,
      subagentPolicyHolder: activeEnvState.subagentPolicyHolder,
      close() {
        return closing ??= closeRuntimeResources([
          () => {
            listeners.clear();
            bindings.close();
          },
          unsubscribeCommits,
          () => opened.close(runtimeContext),
          () => envs.cleanup(runtimeContext),
          () => activeEnvState.cleanup?.(),
          () => location.release()
        ]);
      }
    };
  } catch (error) {
    await envState?.cleanup?.().catch((err) => console.warn("[DurableRuntime] Cleanup extension runner:", err));
    await harness?.close(runtimeContext).catch((err) => console.warn("[DurableRuntime] Cleanup harness:", err));
    await location.release().catch((err) => console.warn("[DurableRuntime] Cleanup location:", err));
    throw error;
  }
}

// packages/core/src/bridge/durable-contracts.ts
import { NestedCallDoc } from "@earendil-works/pi-durable";
async function watchEvents(harness, conversationId, context) {
  const conversation = await harness.conversation(conversationId, context);
  if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
  const watch = await conversation.watch(context);
  const initial = watch.value;
  const snapshot = {
    type: "snapshot",
    entries: initial?.entries ?? [],
    ...initial?.docs?.["pi.live"]?.run ? { run: { inputs: initial.docs["pi.live"].run.inputs } } : {},
    tools: initial?.docs?.["pi.live"]?.tools ?? [],
    nestedTools: initial?.docs?.["pi.live"]?.nestedTools ?? [],
    compactions: initial?.docs?.["pi.live"]?.compactions ?? [],
    inbox: [],
    agent: initial?.docs?.["pi.agent"] ?? {},
    usage: initial?.docs?.["pi.usage"] ?? {}
  };
  return {
    snapshot,
    start(listener) {
      let seenEntriesCount = initial?.entries?.length ?? 0;
      const emittedToolEnds = /* @__PURE__ */ new Set();
      const seenNestedTools = /* @__PURE__ */ new Map();
      watch.start(async (call, ctx) => {
        const val = call?.value ?? call;
        if (!val) return;
        const events = [];
        const nested = val.docs?.["pi.live"]?.nestedTools ?? [];
        for (const n of nested) {
          if (n.callId && !seenNestedTools.has(n.callId)) {
            seenNestedTools.set(n.callId, n);
          }
          if (n.callId && n.status === "done" && !emittedToolEnds.has(n.callId)) {
            emittedToolEnds.add(n.callId);
            const toolName = n.name ?? n.toolName ?? "tool";
            let nestedResult;
            if (n.parentTaskId && typeof harness.snapshot === "function") {
              const key = n.callId.split("/").pop();
              try {
                const stored = await harness.snapshot(NestedCallDoc, n.parentTaskId, key, context);
                nestedResult = stored?.result;
              } catch {
              }
            }
            events.push({
              type: "tool_execution_end",
              toolCallId: n.callId,
              toolName,
              taskId: n.taskId,
              parentToolCallId: n.parentCallId,
              parentTaskId: n.parentTaskId,
              result: nestedResult ?? {
                isError: Boolean(n.summary?.isError ?? n.summary?.error ?? n.isError),
                output: n.output,
                details: n.details
              }
            });
          }
        }
        if (!val.docs?.["pi.live"]?.nestedTools && seenNestedTools.size > 0) {
          for (const [callId, n] of seenNestedTools) {
            if (!emittedToolEnds.has(callId)) {
              emittedToolEnds.add(callId);
              const toolName = n.name ?? n.toolName ?? "tool";
              events.push({
                type: "tool_execution_end",
                toolCallId: callId,
                toolName,
                taskId: n.taskId,
                parentToolCallId: n.parentCallId,
                parentTaskId: n.parentTaskId,
                result: n.result ?? {
                  isError: Boolean(n.summary?.isError ?? n.summary?.error ?? n.isError),
                  output: n.output,
                  details: n.details
                }
              });
            }
          }
        }
        if (val.entries?.length && val.entries.length > seenEntriesCount) {
          for (let i = seenEntriesCount; i < val.entries.length; i++) {
            const entry = val.entries[i];
            const modelMsg = entry?.model?.[0];
            if (modelMsg?.role === "toolResult") {
              let toolName = modelMsg.toolName ?? "tool";
              if (!modelMsg.toolName) {
                for (let j = i - 1; j >= 0; j--) {
                  const prevMsg = val.entries[j]?.model?.[0];
                  if (prevMsg?.role === "assistant" && Array.isArray(prevMsg.content)) {
                    const call2 = prevMsg.content.find((c) => c.type === "toolCall" && c.id === modelMsg.toolCallId);
                    if (call2?.name) {
                      toolName = call2.name;
                      break;
                    }
                  }
                }
              }
              const callId = modelMsg.toolCallId ?? String(entry.id);
              if (!emittedToolEnds.has(callId)) {
                emittedToolEnds.add(callId);
                events.push({
                  type: "tool_execution_end",
                  toolCallId: callId,
                  toolName,
                  entry
                });
              }
            }
            events.push({ type: "entry_appended", entry });
          }
          seenEntriesCount = val.entries.length;
        }
        if (events.length > 0) {
          await listener(events, ctx);
        }
      });
    },
    async stop() {
      return watch.stop(context);
    }
  };
}
function isAgentDocument(doc) {
  return typeof doc === "object" && doc !== null;
}
function isUsageDocument(doc) {
  return typeof doc === "object" && doc !== null;
}
function isToolCallBlock(block) {
  return typeof block === "object" && block !== null && block.type === "toolCall";
}
function isConversationEntryRecord(entry) {
  return typeof entry === "object" && entry !== null;
}

// packages/core/src/bridge/assistant-message-builder.ts
function extractCumulativeUsage(current) {
  const rawUsageDoc = current?.conversation?.docs?.["pi.usage"];
  if (!rawUsageDoc || typeof rawUsageDoc !== "object") {
    return void 0;
  }
  const usageDoc = rawUsageDoc;
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteInputTokens = 0;
  let hasUsage = false;
  const accumulate = (entry) => {
    if (!entry || typeof entry !== "object") return;
    const inTok = Number(entry.input ?? 0);
    const outTok = Number(entry.output ?? 0);
    const totTok = Number(entry.totalTokens ?? inTok + outTok);
    const cacheRead = Number(entry.cacheRead ?? 0);
    const cacheWrite = Number(entry.cacheWrite ?? 0);
    if (totTok > 0 || inTok > 0 || outTok > 0 || cacheRead > 0 || cacheWrite > 0) {
      hasUsage = true;
      totalTokens += totTok;
      inputTokens += inTok;
      outputTokens += outTok;
      cachedInputTokens += cacheRead;
      cacheWriteInputTokens += cacheWrite;
    }
  };
  if (usageDoc.models && typeof usageDoc.models === "object") {
    for (const modelUsage of Object.values(usageDoc.models)) {
      accumulate(modelUsage);
    }
  }
  if (usageDoc.tools && typeof usageDoc.tools === "object") {
    for (const toolUsage of Object.values(usageDoc.tools)) {
      accumulate(toolUsage);
    }
  }
  if (!hasUsage && (usageDoc.totalTokens != null || usageDoc.input != null || usageDoc.output != null)) {
    accumulate(usageDoc);
  }
  if (!hasUsage && totalTokens === 0) {
    return void 0;
  }
  return {
    totalTokens,
    inputTokens,
    outputTokens,
    ...cachedInputTokens > 0 ? { cachedInputTokens } : {},
    ...cacheWriteInputTokens > 0 ? { cacheWriteInputTokens } : {}
  };
}
function buildFinalAssistantMessage(current, lastGenerationText, lastThinkingText) {
  const entries = current.conversation.entries ?? [];
  const lastAssistantEntry = [...entries].reverse().find(
    (e) => isConversationEntryRecord(e) && e.kind === "pi.assistant"
  );
  const lastAssistantMsg = lastAssistantEntry?.model?.[0];
  if (lastAssistantMsg) {
    const rawErr = lastAssistantMsg.errorMessage;
    const errorMessage = typeof rawErr === "string" ? rawErr : void 0;
    const stopReason = typeof lastAssistantMsg.stopReason === "string" ? lastAssistantMsg.stopReason : errorMessage ? "error" : "stop";
    let content = Array.isArray(lastAssistantMsg.content) ? lastAssistantMsg.content : [{ type: "text", text: lastGenerationText }];
    if (content.length === 0 && (stopReason === "error" || errorMessage)) {
      content = [{ type: "text", text: errorMessage ? `\u26A0\uFE0F ${errorMessage}` : "An error occurred during turn generation." }];
    }
    const usage = typeof lastAssistantMsg.usage === "object" && lastAssistantMsg.usage !== null ? lastAssistantMsg.usage : void 0;
    return {
      role: "assistant",
      content,
      stopReason,
      ...errorMessage ? { errorMessage } : {},
      usage
    };
  }
  const finalContent = [];
  if (lastThinkingText) {
    finalContent.push({ type: "thinking", thinking: lastThinkingText });
  }
  if (lastGenerationText) {
    finalContent.push({ type: "text", text: lastGenerationText });
  }
  const rawUsageDoc = current?.conversation?.docs?.["pi.usage"];
  const usageDoc = isUsageDocument(rawUsageDoc) ? rawUsageDoc : {};
  const cumUsage = extractCumulativeUsage(current);
  const inTok = cumUsage?.inputTokens ?? usageDoc.input;
  const outTok = cumUsage?.outputTokens ?? usageDoc.output;
  const cacheRead = cumUsage?.cachedInputTokens ?? usageDoc.cacheRead;
  const cacheWrite = cumUsage?.cacheWriteInputTokens ?? usageDoc.cacheWrite;
  const totalTokens = cumUsage?.totalTokens ?? usageDoc.totalTokens ?? (inTok ?? 0) + (outTok ?? 0);
  return {
    role: "assistant",
    content: finalContent.length > 0 ? finalContent : [{ type: "text", text: "" }],
    stopReason: "stop",
    usage: {
      input: inTok,
      output: outTok,
      cacheRead,
      cacheWrite,
      totalTokens,
      cost: usageDoc.cost
    }
  };
}

// packages/core/src/bridge/turn-summary.ts
function findSubmissionFault(inputs, submissions, lastTaskError) {
  if (inputs && submissions) {
    for (const id of inputs) {
      const sub = submissions.get(id);
      if (sub && sub.status === "unanswered") {
        const isAborted = sub.reason === "aborted";
        return {
          isAborted,
          isError: !isAborted,
          errorMessage: sub.detail || sub.reason || lastTaskError || "Turn ended with unanswered input"
        };
      }
    }
  }
  if (lastTaskError) {
    return { isAborted: false, isError: true, errorMessage: lastTaskError };
  }
  return void 0;
}
function resolveTurnSummary(current, currentText, currentThinking, lastAssistantMessage, resolveContextWindow, fault) {
  const tail = current?.conversation?.entries?.at(-1);
  const lastCheckpointId = tail?.id !== void 0 ? String(tail.id) : void 0;
  const finalMsg = lastAssistantMessage ?? buildFinalAssistantMessage(
    current,
    currentText,
    currentThinking
  );
  const rawAgentDoc = current?.conversation?.docs?.["pi.agent"];
  const agentDoc = isAgentDocument(rawAgentDoc) ? rawAgentDoc : {};
  const cw = resolveContextWindow?.(agentDoc.model?.provider, agentDoc.model?.modelId);
  const cumulativeUsage = extractCumulativeUsage(current);
  const entries = current?.conversation?.entries ?? [];
  const lastAssistantEntry = [...entries].reverse().find(
    (e) => isConversationEntryRecord(e) && e.kind === "pi.assistant"
  );
  const firstModelMsg = lastAssistantEntry?.model?.[0];
  const isLastAssistantAborted = Boolean(
    firstModelMsg && "stopReason" in firstModelMsg && firstModelMsg.stopReason === "aborted"
  );
  const isAborted = finalMsg.stopReason === "aborted" || isLastAssistantAborted || Boolean(fault?.isAborted);
  const rawLastErr = firstModelMsg && "errorMessage" in firstModelMsg ? firstModelMsg.errorMessage : void 0;
  const lastErrStr = typeof rawLastErr === "string" ? rawLastErr : void 0;
  const isLastAssistantError = Boolean(
    firstModelMsg && "stopReason" in firstModelMsg && firstModelMsg.stopReason === "error" || lastErrStr
  );
  const isError = finalMsg.stopReason === "error" || isLastAssistantError || Boolean(fault?.isError);
  const errorMessage = finalMsg.errorMessage ?? fault?.errorMessage ?? lastErrStr;
  if (isAborted && finalMsg.stopReason !== "aborted") {
    finalMsg.stopReason = "aborted";
  } else if (isError && finalMsg.stopReason !== "error") {
    finalMsg.stopReason = "error";
  }
  if (errorMessage && !finalMsg.errorMessage) {
    finalMsg.errorMessage = errorMessage;
  }
  return { finalMsg, cw, cumulativeUsage, isAborted, isError, errorMessage, lastCheckpointId };
}

// packages/core/src/bridge/native-tool-result.ts
function extractCanonicalToolDetails(event) {
  if (typeof event !== "object" || event === null) return void 0;
  const rec = event;
  if (rec.result && typeof rec.result === "object" && "details" in rec.result) {
    return rec.result.details;
  }
  if (rec.entry && typeof rec.entry === "object" && Array.isArray(rec.entry.model)) {
    const msg = rec.entry.model[0];
    if (msg && typeof msg === "object" && "details" in msg) {
      return msg.details;
    }
  }
  if ("details" in rec) {
    return rec.details;
  }
  return void 0;
}
function decodeEntry(entry) {
  const msg = entry.model?.[0];
  if (!msg || typeof msg !== "object" || msg.role !== "toolResult") {
    return {
      status: "invalid",
      isError: true,
      errorMessage: "Tool execution entry is missing a valid toolResult message"
    };
  }
  return {
    status: "entry",
    isError: Boolean(msg.isError),
    rawOutput: msg.content ?? msg.output,
    details: "details" in msg ? msg.details : void 0
  };
}
function decodeResult(result) {
  return {
    status: "result",
    isError: Boolean(result.isError),
    rawOutput: result.output ?? result.structuredOutput,
    details: "details" in result ? result.details : void 0,
    diagnostics: result.diagnostics ?? []
  };
}
function decodeNativeToolEnd(event) {
  const hasEntry = event.entry !== void 0;
  const hasResult = event.result !== void 0;
  if (hasEntry && hasResult) {
    return {
      status: "invalid",
      isError: true,
      errorMessage: "Tool protocol invariant violation: both entry and result present in tool_execution_end"
    };
  }
  if (!hasEntry && !hasResult) {
    return {
      status: "missing",
      isError: true,
      errorMessage: "Tool execution completed without generating an entry record or nested result"
    };
  }
  if (hasResult && event.result) {
    return decodeResult(event.result);
  }
  if (event.entry) {
    return decodeEntry(event.entry);
  }
  return {
    status: "invalid",
    isError: true,
    errorMessage: "Tool execution entry is missing"
  };
}

// packages/core/src/bridge/tool-result-presentation.ts
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail
} from "@earendil-works/pi-coding-agent";
function isImageContent(value) {
  if (typeof value !== "object" || value === null) return false;
  const rec = value;
  return rec.type === "image" && (typeof rec.data === "string" || typeof rec.mimeType === "string");
}
function redactImageStructures(value) {
  if (typeof value !== "object" || value === null) return value;
  if (isImageContent(value)) {
    const rec = value;
    return { ...rec, data: "[image data omitted]" };
  }
  if (Array.isArray(value)) {
    return value.map(redactImageStructures);
  }
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = redactImageStructures(v);
  }
  return result;
}
function formatContentBlock(block) {
  if (typeof block === "string") return block;
  if (typeof block !== "object" || block === null) return String(block);
  const rec = block;
  if (typeof rec.text === "string") return rec.text;
  if (isImageContent(rec)) {
    return `[image: ${String(rec.mimeType ?? "image")}]`;
  }
  return JSON.stringify(redactImageStructures(rec));
}
function formatRawOutput(toolName, raw) {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map(formatContentBlock).filter(Boolean).join("\n");
  }
  if (typeof raw === "object" && raw !== null) {
    const rec = raw;
    if (toolName === "bash" && typeof rec.output === "string") {
      return rec.output;
    }
    if (isImageContent(rec)) {
      return `[image: ${String(rec.mimeType ?? "image")}]`;
    }
    return JSON.stringify(redactImageStructures(raw), null, 2);
  }
  return "";
}
function renderDiagnostics(diagnostics) {
  return diagnostics.filter((d) => d && typeof d.message === "string" && d.message.length > 0).map((d) => d.severity && d.severity !== "info" ? `[${d.severity}] ${d.message}` : d.message).join("\n");
}
function presentToolResult(params) {
  const { toolName, rawOutput, isError, diagnostics, retainedOutput } = params;
  let text = "";
  if (rawOutput !== void 0) {
    text = formatRawOutput(toolName, rawOutput);
  } else if (retainedOutput) {
    text = retainedOutput;
  }
  if (diagnostics && diagnostics.length > 0) {
    const diagText = renderDiagnostics(diagnostics);
    if (diagText) {
      text = text ? `${text}
${diagText}` : diagText;
    }
  }
  if (!text && isError) {
    text = `Tool ${toolName} failed`;
  }
  return truncateTail(text, {
    maxBytes: DEFAULT_MAX_BYTES,
    maxLines: DEFAULT_MAX_LINES
  }).content;
}

// packages/core/src/bridge/tool-progress-state.ts
var ToolProgressState = class {
  active = /* @__PURE__ */ new Map();
  applyOutputUpdate(callId, output) {
    if (!output) {
      return this.active.get(callId)?.output;
    }
    let current = this.active.get(callId)?.output ?? "";
    if ("set" in output) {
      current = output.set;
    } else {
      const trim = typeof output.trimStart === "number" ? Math.max(0, output.trimStart) : 0;
      const append = typeof output.append === "string" ? output.append : "";
      current = current.slice(trim) + append;
    }
    const existing = this.active.get(callId);
    if (existing) {
      existing.output = current;
    } else {
      this.active.set(callId, { output: current });
    }
    return current;
  }
  setDetails(callId, details) {
    const existing = this.active.get(callId);
    if (existing) {
      existing.details = details;
    } else {
      this.active.set(callId, { output: "", details });
    }
  }
  getDetails(callId) {
    return this.active.get(callId)?.details;
  }
  getRetainedOutput(callId) {
    return this.active.get(callId)?.output;
  }
  take(callId) {
    const slot = this.active.get(callId);
    this.active.delete(callId);
    return slot ? { output: slot.output, details: slot.details } : {};
  }
  clear() {
    this.active.clear();
  }
  seedFromSnapshot(tools, nestedTools) {
    const all = [...tools ?? [], ...nestedTools ?? []];
    for (const t of all) {
      if (t && t.callId !== void 0) {
        const outputStr = typeof t.output === "string" ? t.output : "";
        this.active.set(t.callId, { output: outputStr, details: t.details });
      }
    }
  }
};

// packages/core/src/bridge/tool-result-extractor.ts
function buildTerminalError(event, decoded, canonicalDetails, parentRef) {
  return {
    type: "tool_execution_end",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    result: decoded.errorMessage,
    isError: true,
    ...canonicalDetails !== void 0 ? { details: canonicalDetails } : {},
    ...parentRef !== void 0 ? { parentRef } : {}
  };
}
function buildTerminalSuccess(event, decoded, scoped, canonicalDetails, parentRef) {
  const details = canonicalDetails !== void 0 ? canonicalDetails : scoped.details;
  const result = presentToolResult({
    toolName: event.toolName,
    rawOutput: decoded.rawOutput,
    isError: decoded.isError,
    diagnostics: decoded.status === "result" ? decoded.diagnostics : void 0,
    retainedOutput: scoped.output
  });
  return {
    type: "tool_execution_end",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    result,
    isError: decoded.isError,
    ...details !== void 0 ? { details } : {},
    ...parentRef !== void 0 ? { parentRef } : {}
  };
}
var ToolEventProjector = class {
  progressState = new ToolProgressState();
  projectToolUpdate(event, parentRef) {
    let partialResult;
    if (event.output) {
      partialResult = this.progressState.applyOutputUpdate(event.toolCallId, event.output);
    } else if (event.details !== void 0) {
      partialResult = this.progressState.getRetainedOutput(event.toolCallId) ?? "";
    }
    if (event.details !== void 0) {
      this.progressState.setDetails(event.toolCallId, event.details);
    }
    let trimStart;
    if (event.output && "trimStart" in event.output && typeof event.output.trimStart === "number") {
      trimStart = event.output.trimStart;
    }
    if (partialResult !== void 0 || trimStart !== void 0 || event.details !== void 0) {
      return {
        type: "tool_execution_update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: partialResult ?? "",
        ...trimStart !== void 0 ? { trimStart } : {},
        ...event.details !== void 0 ? { details: event.details } : {},
        ...parentRef !== void 0 ? { parentRef } : {}
      };
    }
    return void 0;
  }
  projectToolEnd(event, parentRef) {
    const decoded = decodeNativeToolEnd(event);
    const scoped = this.progressState.take(event.toolCallId);
    const canonicalDetails = extractCanonicalToolDetails(event);
    if (decoded.status === "missing" || decoded.status === "invalid") {
      const fallback = canonicalDetails !== void 0 ? canonicalDetails : scoped.details;
      return buildTerminalError(event, decoded, fallback, parentRef);
    }
    return buildTerminalSuccess(event, decoded, scoped, canonicalDetails, parentRef);
  }
  clear() {
    this.progressState.clear();
  }
  seedFromSnapshot(tools, nestedTools) {
    this.progressState.seedFromSnapshot(tools, nestedTools);
  }
};

// packages/core/src/bridge/child-run-outcome.ts
function resolveChildRunOutcome(inputs, submissions, lastTaskError) {
  if (inputs && submissions) {
    let hasDoneInput = false;
    for (const id of inputs) {
      const sub = submissions.get(id);
      if (sub) {
        if (sub.status === "done") {
          hasDoneInput = true;
        } else if (sub.status === "unanswered") {
          const isAborted = sub.reason === "aborted" || sub.reason === "cancelled";
          return {
            status: isAborted ? "interrupted" : "failed",
            isAborted,
            isError: !isAborted,
            errorMessage: sub.detail || sub.reason || lastTaskError || "Task failed"
          };
        }
      }
    }
    if (hasDoneInput) {
      return { status: "completed" };
    }
  }
  if (lastTaskError) {
    return {
      status: "failed",
      isError: true,
      errorMessage: lastTaskError
    };
  }
  return { status: "completed" };
}

// packages/core/src/bridge/durable-child-event-adapter.ts
var DurableChildEventAdapter = class {
  output;
  parentRef;
  conversationId;
  toolProjector = new ToolEventProjector();
  submissions = /* @__PURE__ */ new Map();
  lastTaskError;
  currentText = "";
  currentThinking = "";
  isInThinking = false;
  constructor(output, parentRef, conversationId) {
    this.output = output;
    this.parentRef = parentRef;
    this.conversationId = conversationId;
  }
  closeThinkingIfNeeded() {
    if (!this.isInThinking) return;
    this.isInThinking = false;
    this.output({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: this.currentThinking },
      parentRef: this.parentRef,
      ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
    });
  }
  handleBatch(batch, current) {
    if (batch.some((ev) => ev.type === "run_start")) {
      this.lastTaskError = void 0;
      this.submissions.clear();
    }
    for (const ev of batch) {
      if (ev.type === "task_failed") {
        this.lastTaskError = ev.message;
      } else if (ev.type === "submission" && ev.record?.id !== void 0) {
        this.submissions.set(ev.record.id, ev.record);
      }
    }
    for (const ev of batch) {
      this.handleEvent(ev, current);
    }
  }
  handleEvent(event, _current) {
    switch (event.type) {
      case "message_update": {
        for (const change of event.changes) {
          const thinkDelta = change.type === "thinking_delta" ? change.delta : change.type === "thinking_start" && change.block.type === "thinking" && change.block.thinking ? change.block.thinking : void 0;
          const textDelta = change.type === "text_delta" ? change.delta : change.type === "text_start" && change.block.type === "text" && change.block.text ? change.block.text : void 0;
          if (thinkDelta) {
            this.isInThinking = true;
            this.currentThinking += thinkDelta;
            this.output({
              type: "message_update",
              assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: thinkDelta },
              parentRef: this.parentRef,
              ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
            });
          } else if (textDelta) {
            this.closeThinkingIfNeeded();
            this.currentText += textDelta;
            this.output({
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: textDelta },
              parentRef: this.parentRef,
              ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
            });
          }
        }
        break;
      }
      case "tool_execution_start": {
        this.closeThinkingIfNeeded();
        this.output({
          type: "tool_execution_start",
          toolCallId: `${this.parentRef}:${event.toolCallId}`,
          toolName: event.toolName,
          args: event.args ?? {},
          parentRef: this.parentRef,
          ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
        });
        break;
      }
      case "tool_execution_update": {
        const update = this.toolProjector.projectToolUpdate(
          { ...event, toolCallId: `${this.parentRef}:${event.toolCallId}` },
          this.parentRef
        );
        if (update) {
          this.output({
            ...update,
            ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
          });
        }
        break;
      }
      case "tool_execution_end": {
        const end = this.toolProjector.projectToolEnd(
          { ...event, toolCallId: `${this.parentRef}:${event.toolCallId}` },
          this.parentRef
        );
        this.output({
          ...end,
          ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
        });
        break;
      }
      case "message_end": {
        this.closeThinkingIfNeeded();
        const message = event.entry?.model?.[0];
        if (message?.role === "assistant" && Array.isArray(message.content)) {
          const fullText = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
          if (fullText.startsWith(this.currentText) && fullText.length > this.currentText.length) {
            const delta = fullText.slice(this.currentText.length);
            this.output({
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta },
              parentRef: this.parentRef,
              ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
            });
          }
          this.currentText = "";
          this.currentThinking = "";
        }
        break;
      }
      case "run_end": {
        this.closeThinkingIfNeeded();
        this.toolProjector.clear();
        const outcome = resolveChildRunOutcome(event.inputs, this.submissions, this.lastTaskError);
        this.output({
          type: "agent_end",
          messages: [],
          parentRef: this.parentRef,
          ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {},
          ...outcome.isAborted ? { aborted: true, stopReason: "aborted" } : {},
          ...outcome.isError && !outcome.isAborted ? { stopReason: "error", ...outcome.errorMessage ? { errorMessage: outcome.errorMessage } : {} } : {}
        });
        break;
      }
      case "turn_start": {
        this.output({
          type: "turn_start",
          parentRef: this.parentRef,
          ...this.conversationId !== void 0 ? { conversationId: this.conversationId } : {}
        });
        break;
      }
      case "snapshot": {
        const snap = event;
        const prefix = (slots) => slots?.map((s) => ({ ...s, callId: `${this.parentRef}:${s.callId}` }));
        this.toolProjector.seedFromSnapshot(prefix(snap.tools), prefix(snap.nestedTools));
        break;
      }
      case "run_start": {
        this.toolProjector.clear();
        break;
      }
      default:
        break;
    }
  }
};

// packages/core/src/bridge/durable-event-adapter.ts
var DurableEventAdapter = class {
  output;
  resolveContextWindow;
  submissions = /* @__PURE__ */ new Map();
  activeToolNames = /* @__PURE__ */ new Map();
  toolProjector = new ToolEventProjector();
  lastTaskError;
  lastAssistantMessage;
  lastCheckpointId;
  currentText = "";
  currentThinking = "";
  isInThinking = false;
  constructor(output, resolveContextWindow) {
    this.output = output;
    this.resolveContextWindow = resolveContextWindow;
  }
  closeThinkingIfNeeded() {
    if (!this.isInThinking) return;
    this.isInThinking = false;
    this.output({ type: "message_update", assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: this.currentThinking } });
  }
  resolveParentRef(parentToolCallId) {
    if (parentToolCallId === void 0) return void 0;
    const name = this.activeToolNames.get(parentToolCallId);
    if (name === "codemode" || name !== void 0 && name !== "subagent" && name !== "agent_spawn" && name !== "agent_spawn_graph") return void 0;
    return String(parentToolCallId);
  }
  createChildAdapter(parentCallId, conversationId) {
    return new DurableChildEventAdapter(this.output, parentCallId, conversationId);
  }
  emitTerminal(type, current, inputs) {
    this.closeThinkingIfNeeded();
    const fault = type === "agent_end" ? findSubmissionFault(inputs, this.submissions, this.lastTaskError) : void 0;
    const summary = resolveTurnSummary(current, this.currentText, this.currentThinking, this.lastAssistantMessage, this.resolveContextWindow, fault);
    if (summary.lastCheckpointId) this.lastCheckpointId = summary.lastCheckpointId;
    const isAborted = summary.isAborted;
    const isError = summary.isError && !isAborted;
    const base = {
      contextWindow: summary.cw,
      ...this.lastCheckpointId && { providerCheckpointId: this.lastCheckpointId },
      ...summary.cumulativeUsage && { cumulativeUsage: summary.cumulativeUsage },
      ...isAborted && { aborted: true, stopReason: "aborted" },
      ...isError && { stopReason: "error", ...summary.errorMessage && { errorMessage: summary.errorMessage } }
    };
    if (type === "turn_end") this.output({ type: "turn_end", message: summary.finalMsg, ...base });
    else this.output({ type: "agent_end", messages: [summary.finalMsg], ...base });
  }
  handleBatch(batch, current) {
    for (const ev of batch) {
      if (ev.type === "task_failed") this.lastTaskError = ev.message;
      else if (ev.type === "submission" && ev.record?.id !== void 0) this.submissions.set(ev.record.id, ev.record);
    }
    for (const ev of batch) this.handleEvent(ev, current);
  }
  handleEvent(event, current) {
    switch (event.type) {
      case "snapshot": {
        const snap = event;
        const entries = snap.view?.conversation?.entries ?? snap.entries ?? current?.conversation?.entries;
        const tail = entries?.at(-1);
        if (tail?.id !== void 0) this.lastCheckpointId = String(tail.id);
        this.toolProjector.seedFromSnapshot(snap.tools, snap.nestedTools);
        break;
      }
      case "run_start": {
        this.lastTaskError = void 0;
        this.currentText = "";
        this.currentThinking = "";
        this.isInThinking = false;
        this.lastAssistantMessage = void 0;
        this.activeToolNames.clear();
        this.toolProjector.clear();
        this.output({ type: "agent_start" });
        break;
      }
      case "turn_start": {
        this.output({ type: "turn_start" });
        break;
      }
      case "message_update": {
        for (const change of event.changes) {
          const thinkDelta = change.type === "thinking_delta" ? change.delta : change.type === "thinking_start" && change.block.type === "thinking" && change.block.thinking ? change.block.thinking : void 0;
          const textDelta = change.type === "text_delta" ? change.delta : change.type === "text_start" && change.block.type === "text" && change.block.text ? change.block.text : void 0;
          if (thinkDelta) {
            this.isInThinking = true;
            this.currentThinking += thinkDelta;
            this.output({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: thinkDelta } });
          } else if (textDelta) {
            this.closeThinkingIfNeeded();
            this.currentText += textDelta;
            this.output({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: textDelta } });
          }
        }
        break;
      }
      case "tool_execution_start": {
        this.closeThinkingIfNeeded();
        this.activeToolNames.set(event.toolCallId, event.toolName);
        const parentRef = this.resolveParentRef(event.parentToolCallId);
        this.output({ type: "tool_execution_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args ?? {}, ...parentRef !== void 0 ? { parentRef } : {} });
        break;
      }
      case "tool_execution_update": {
        const update = this.toolProjector.projectToolUpdate(event, this.resolveParentRef(event.parentToolCallId));
        if (update) this.output(update);
        break;
      }
      case "tool_execution_end": {
        this.output(this.toolProjector.projectToolEnd(event, this.resolveParentRef(event.parentToolCallId)));
        break;
      }
      case "message_end": {
        this.closeThinkingIfNeeded();
        const modelItem = event.entry?.model?.[0];
        const msg = typeof modelItem === "object" && modelItem !== null ? modelItem : void 0;
        if (msg?.role === "assistant") {
          const errMsg = typeof msg.errorMessage === "string" ? msg.errorMessage : void 0;
          const stopReason = msg.stopReason ?? (errMsg ? "error" : "stop");
          let content = msg.content ?? [{ type: "text", text: this.currentText }];
          if (content.length === 0 && (stopReason === "error" || errMsg)) {
            content = [{ type: "text", text: errMsg ? `\u26A0\uFE0F ${errMsg}` : "An error occurred during turn generation." }];
          }
          this.lastAssistantMessage = {
            role: "assistant",
            content,
            stopReason,
            ...errMsg ? { errorMessage: errMsg } : {},
            usage: msg.usage
          };
          this.output({ type: "message_end", message: this.lastAssistantMessage });
          this.currentText = "";
          this.currentThinking = "";
        }
        break;
      }
      case "task_failed":
        this.lastTaskError = event.message;
        break;
      case "submission":
        if (event.record?.id !== void 0) this.submissions.set(event.record.id, event.record);
        break;
      case "compaction_start":
        this.output({ type: "compaction_start", reason: event.reason === "threshold" ? "threshold" : "manual" });
        break;
      case "compaction_end":
        this.output({ type: "compaction_end", reason: event.reason === "threshold" ? "threshold" : "manual", aborted: false });
        break;
      case "turn_end":
        this.emitTerminal("turn_end", current);
        break;
      case "run_end":
        this.toolProjector.clear();
        this.emitTerminal("agent_end", current, event.inputs);
        break;
      case "auto_retry_start":
        this.output({ type: "auto_retry_start", attempt: event.attempt, ...event.at !== void 0 ? { at: event.at } : {}, ...event.errorMessage ? { errorMessage: event.errorMessage } : {} });
        break;
      case "auto_retry_end":
        this.output({ type: "auto_retry_end", attempt: event.attempt });
        break;
    }
  }
};

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

// packages/core/src/subagent-watcher.ts
function extractChildConversationId(event) {
  if (event.type === "tool_execution_update" || event.type === "tool_execution_end") {
    const details = extractCanonicalToolDetails(event);
    return details?.conversationId;
  }
  return void 0;
}
async function startSubagentWatcher(harness, adapter, getCurrentView, options) {
  const watch = options?.watchEventsFn ?? watchEvents;
  const attached = /* @__PURE__ */ new Set();
  const activeStreams = /* @__PURE__ */ new Map();
  const attach = async (conversationId, parentCallId) => {
    if (attached.has(conversationId)) return;
    attached.add(conversationId);
    const isChild = parentCallId !== void 0;
    const childAdapter = isChild ? adapter.createChildAdapter(parentCallId, conversationId) : void 0;
    try {
      const stream = await watch(harness, conversationId, BACKGROUND_CONTEXT2);
      activeStreams.set(conversationId, stream);
      stream.start(async (batch) => {
        try {
          const view = getCurrentView();
          if (childAdapter) {
            childAdapter.handleBatch(batch, view);
          } else {
            adapter.handleBatch(batch, view);
          }
          for (const event of batch) {
            const childId = extractChildConversationId(event);
            if (childId !== void 0 && !attached.has(childId)) {
              const callId = "toolCallId" in event ? isChild ? `${parentCallId}:${String(event.toolCallId)}` : String(event.toolCallId) : parentCallId ?? "subagent";
              void attach(childId, callId);
            }
          }
        } catch (err) {
          console.error(`[SubagentWatcher] Batch handling error for conversation ${conversationId}:`, err);
        }
      });
    } catch (err) {
      console.error(`[SubagentWatcher] Failed to attach stream for conversation ${conversationId}:`, err);
    }
  };
  await attach(ROOT_CONVERSATION_ID2);
  try {
    const index = await harness.snapshot(BindingIndexDoc, BACKGROUND_CONTEXT2);
    if (index?.byThreadId) {
      for (const convId of Object.values(index.byThreadId)) {
        if (convId && convId !== ROOT_CONVERSATION_ID2) {
          await attach(convId, "subagent");
        }
      }
    }
    const subagents = await harness.snapshot(SubagentsDoc, ROOT_CONVERSATION_ID2, BACKGROUND_CONTEXT2);
    if (subagents?.agents) {
      for (const agent of Object.values(subagents.agents)) {
        if (agent?.conversationId && agent.conversationId !== ROOT_CONVERSATION_ID2) {
          await attach(agent.conversationId, String(agent.ownerTaskId ?? "subagent"));
        }
      }
    }
  } catch (err) {
    console.warn(`[SubagentWatcher] Bootstrap child discovery warning: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    ensureAttached: async (conversationId, parentCallId) => {
      await attach(conversationId, parentCallId ?? "subagent");
    },
    close: () => {
      for (const stream of activeStreams.values()) {
        try {
          stream.stop();
        } catch (err) {
          console.warn(`[SubagentWatcher] Stream stop warning: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      activeStreams.clear();
      attached.clear();
    }
  };
}

// packages/core/src/engine.ts
var DurableEngine = class _DurableEngine {
  #instance;
  sessionDir;
  eventListeners = /* @__PURE__ */ new Set();
  eventAdapter;
  watcher;
  unsubscribeView;
  constructor(instance, sessionDir) {
    this.#instance = instance;
    this.sessionDir = sessionDir;
    this.eventAdapter = new DurableEventAdapter((event) => {
      for (const listener of this.eventListeners) {
        listener(event);
      }
    });
    this.unsubscribeView = this.#instance.view.subscribe(this.eventAdapter.subscriber);
  }
  static async open(options = {}) {
    const sessionDir = options.sessionDir ?? options.session ?? process.cwd();
    const instance = await openDurable({
      cwd: options.cwd ?? process.cwd(),
      sessionDir,
      session: options.session,
      continueSession: options.continueSession,
      cli: {
        extensions: options.extensions,
        noGlobalExtensions: options.noGlobalExtensions
      }
    });
    const engine = new _DurableEngine(instance, sessionDir);
    engine.watcher = await startSubagentWatcher(
      instance.harness,
      engine.eventAdapter,
      () => instance.view.current()
    );
    return engine;
  }
  getSnapshot() {
    return this.#instance.view.current();
  }
  async prompt(content, options) {
    await this.#instance.controller.submit(content, options?.deliverAs ?? "followUp");
  }
  events(callback) {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }
  async abort() {
    await this.#instance.controller.abort();
  }
  async close() {
    this.eventListeners.clear();
    this.unsubscribeView?.();
    this.watcher?.close();
    await this.#instance.close();
  }
};

// packages/core/src/session-daemon.ts
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
var SessionDaemon = class {
  socketPath;
  server = null;
  activeSockets = /* @__PURE__ */ new Set();
  constructor(sessionDir, options = {}) {
    const fileName = options.socketFileName ?? "runner.sock";
    this.socketPath = path.join(sessionDir, fileName);
  }
  getSocketPath() {
    return this.socketPath;
  }
  async tryConnectClient(timeoutMs = 250) {
    if (!fs.existsSync(this.socketPath)) {
      return null;
    }
    return new Promise((resolve3) => {
      let settled = false;
      const socket = net.createConnection({ path: this.socketPath });
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        if (!result) {
          socket.destroy();
          try {
            if (fs.existsSync(this.socketPath)) {
              fs.unlinkSync(this.socketPath);
            }
          } catch {
          }
        }
        resolve3(result);
      };
      const timer = setTimeout(() => cleanup(null), timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve3(socket);
        }
      });
      socket.once("error", () => {
        clearTimeout(timer);
        cleanup(null);
      });
    });
  }
  async startMaster(onConnection) {
    if (this.server) {
      return true;
    }
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
      }
    }
    return new Promise((resolve3, reject) => {
      const server = net.createServer((socket) => {
        this.activeSockets.add(socket);
        socket.on("close", () => this.activeSockets.delete(socket));
        onConnection(socket);
      });
      server.once("error", (err) => {
        this.server = null;
        reject(err);
      });
      server.listen(this.socketPath, () => {
        this.server = server;
        resolve3(true);
      });
    });
  }
  async close() {
    for (const socket of this.activeSockets) {
      try {
        socket.destroy();
      } catch {
      }
    }
    this.activeSockets.clear();
    if (this.server) {
      await new Promise((resolve3) => {
        this.server.close(() => resolve3());
      });
      this.server = null;
    }
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
      }
    }
  }
};

// packages/core/src/bridge/view-stream-projector.ts
var ViewStreamProjector = class {
  sink;
  activeRunId = null;
  constructor(sink) {
    this.sink = sink;
  }
  project(state) {
    const run = state.run;
    if (run && run.state === "running" && this.activeRunId !== run.id) {
      this.activeRunId = run.id;
      this.sink({
        type: "agent_start",
        conversationId: state.conversationId
      });
      this.sink({
        type: "turn_start",
        conversationId: state.conversationId
      });
      return;
    }
    if (!run && this.activeRunId) {
      this.activeRunId = null;
      this.sink({
        type: "turn_end",
        conversationId: state.conversationId
      });
      this.sink({
        type: "agent_end",
        conversationId: state.conversationId
      });
    }
  }
};

// packages/core/src/shared/version.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
var esmRequire = createRequire(import.meta.url);
var currentDir = dirname(fileURLToPath(import.meta.url));
function getPiDurableVersion() {
  try {
    const durablePkg = esmRequire.resolve("@earendil-works/pi-durable/package.json");
    if (existsSync2(durablePkg)) {
      const parsed = JSON.parse(readFileSync2(durablePkg, "utf8"));
      if (parsed.version) return parsed.version;
    }
  } catch (err) {
    const code = err?.code;
    if (code !== "MODULE_NOT_FOUND" && code !== "ENOENT") {
      console.warn(`[Version] Failed to resolve durable package: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  try {
    const pluginPkg = join3(currentDir, "..", "..", "package.json");
    if (existsSync2(pluginPkg)) {
      const parsed = JSON.parse(readFileSync2(pluginPkg, "utf8"));
      const dep = parsed.dependencies?.["@earendil-works/pi-durable"]?.replace(/^[\^~]/, "");
      if (dep) return dep;
    }
  } catch (err) {
    const code = err?.code;
    if (code !== "ENOENT") {
      console.warn(`[Version] Failed to read plugin package: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return "1.0.0";
}
export {
  Anchor,
  BACKGROUND,
  DefaultCourier,
  DefaultReporter,
  DurableEngine,
  DynamicCodemodeNamespaces,
  SchemaPort,
  SessionDaemon,
  SubagentTasksExtension,
  ViewStreamProjector,
  adaptExtensionTool,
  agentOf,
  answerText,
  clearDeliveryHold,
  courierFor,
  courierIsIdle,
  createNestedToolExecutor,
  createStandardExtensionFactories2 as createStandardExtensionFactories,
  createSubagentExtension,
  firstInput,
  getPiDurableVersion,
  hasOutput,
  hydrateSessionActiveTools,
  installExtensionTools,
  isAgentDocument,
  isConversationEntryRecord,
  isToolCallBlock,
  isUsageDocument,
  isWatchCall,
  mountExtensionBridge,
  openDurable,
  reporterFor,
  runtimeContext,
  titleOf,
  unwrapWatchValue,
  watchEvents
};
//# sourceMappingURL=index.js.map
