// packages/core/src/errors.ts
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
var SessionNotFoundError = class extends DurableStorageError {
  sessionId;
  constructor(sessionId, message, cause) {
    super(message ?? `Session not found: ${sessionId}`, cause, "SESSION_NOT_FOUND");
    this.sessionId = sessionId;
  }
};
var StorageCorruptionError = class extends DurableStorageError {
  constructor(message = "Storage corrupted", cause) {
    super(message, cause, "STORAGE_CORRUPTED");
  }
};
var DurableCommandError = class extends DurableHarnessError {
  constructor(message, cause, code = "COMMAND_ERROR") {
    super(message, code, cause);
  }
};
var InvalidCommandPayloadError = class extends DurableCommandError {
  command;
  constructor(command, message, cause) {
    super(message ?? `Invalid payload for command: ${command}`, cause, "INVALID_COMMAND_PAYLOAD");
    this.command = command;
  }
};
var BuiltinExtensionError = class extends DurableHarnessError {
  extensionId;
  constructor(extensionId, message, options) {
    super(`[Built-in Extension ${extensionId}] ${message}`, "BUILTIN_EXTENSION_ERROR", options?.cause);
    this.name = "BuiltinExtensionError";
    this.extensionId = extensionId;
  }
};
var DurablePluginError = class extends DurableHarnessError {
  pluginId;
  constructor(pluginId, message, cause) {
    super(message ?? `Plugin failure: ${pluginId}`, "PLUGIN_ERROR", cause);
    this.pluginId = pluginId;
  }
};
var SessionError = class extends DurableHarnessError {
  constructor(code, message, cause) {
    super(message, code, cause);
    this.name = "SessionError";
  }
};

// packages/core/src/version.ts
var CORE_VERSION = "0.26.31";

// packages/core/src/prompt.ts
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

// packages/core/src/models/provider.ts
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
function formatModelCliArg(ref) {
  const normalized = normalizeModelReference(ref);
  if (!normalized) return `${ref.provider}/${ref.modelId}`;
  return `${normalized.provider}/${normalized.modelId}`;
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
var EXTENDED_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
];
function getSupportedThinkingLevels(model) {
  if (!model.reasoning) {
    return ["off"];
  }
  return EXTENDED_THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === "xhigh" || level === "max") return mapped !== void 0;
    return true;
  });
}
function mapBbReasoningToNativeThinking(level) {
  if (level === "none" || level === void 0) {
    return "off";
  }
  return level;
}
function mapNativeThinkingToBbReasoning(level) {
  if (level === "off") {
    return "none";
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
  const targetModel = normalizeModelReference(targetProfile?.model);
  const foundModel = targetModel ? availableModels.find((m) => {
    const availableNorm = normalizeModelReference(m, m.provider);
    return availableNorm && availableNorm.provider === targetModel.provider && availableNorm.modelId === targetModel.modelId;
  }) : void 0;
  if (!foundModel || !targetModel) {
    throw new SubagentModelUnavailableError(
      `Configured subagent model "${targetProfile?.model?.provider}/${targetProfile?.model?.modelId}" is unavailable or unauthenticated. Update the subagent model in Settings \u2192 Installed plugins \u2192 Pi Durable \u2192 Subagents.`
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

// packages/core/src/policy/schema.ts
import { z } from "zod";
var SUBAGENT_POLICY_KV_KEY = "subagent.policy.v1";
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

// packages/core/src/policy/store.ts
var SubagentPolicyStore = class {
  kv;
  clock;
  currentRecord = null;
  writeQueue = Promise.resolve();
  constructor(kv, options) {
    this.kv = kv;
    this.clock = options?.clock ?? (() => (/* @__PURE__ */ new Date()).toISOString());
  }
  async hydrate() {
    let raw;
    try {
      raw = await this.kv.get(SUBAGENT_POLICY_KV_KEY);
    } catch (error) {
      throw new SubagentPolicyLoadError(
        "Failed to read subagent policy from storage",
        { cause: error }
      );
    }
    if (raw === void 0) {
      const defaultRecord = {
        version: 1,
        revision: 0,
        policy: { mode: "inherit" }
      };
      this.currentRecord = defaultRecord;
      return structuredClone(defaultRecord);
    }
    const parsed = subagentPolicyRecordSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SubagentPolicyLoadError(
        "Stored subagent policy is corrupted",
        { cause: parsed.error }
      );
    }
    this.currentRecord = parsed.data;
    return structuredClone(this.currentRecord);
  }
  getRecord() {
    if (!this.currentRecord) {
      throw new SubagentPolicyLoadError("Subagent policy store is not hydrated");
    }
    return structuredClone(this.currentRecord);
  }
  async setPolicy(policy, expectedRevision) {
    const validatedPolicy = subagentPolicySchema.parse(policy);
    return new Promise((resolve, reject) => {
      this.writeQueue = this.writeQueue.catch(() => {
      }).then(async () => {
        try {
          if (!this.currentRecord) {
            throw new SubagentPolicyLoadError(
              "Subagent policy store is not hydrated"
            );
          }
          if (expectedRevision !== this.currentRecord.revision) {
            throw new SubagentRevisionConflictError(
              `Revision conflict: expected revision ${expectedRevision}, but current revision is ${this.currentRecord.revision}`
            );
          }
          const newRecord = {
            version: 1,
            revision: this.currentRecord.revision + 1,
            updatedAt: this.clock(),
            policy: validatedPolicy
          };
          subagentPolicyRecordSchema.parse(newRecord);
          await this.kv.set(SUBAGENT_POLICY_KV_KEY, newRecord);
          this.currentRecord = structuredClone(newRecord);
          resolve(structuredClone(newRecord));
        } catch (error) {
          reject(error);
        }
      });
    });
  }
};

// packages/core/src/session/coordinator.ts
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
export {
  BuiltinExtensionError,
  CORE_VERSION,
  DurableCommandError,
  DurableHarnessError,
  DurablePluginError,
  DurableStorageError,
  DynamicPromptSections,
  InvalidCommandPayloadError,
  SUBAGENT_POLICY_KV_KEY,
  SessionCoordinator,
  SessionError,
  SessionNotFoundError,
  StorageCorruptionError,
  SubagentModelUnavailableError,
  SubagentPolicyError,
  SubagentPolicyInvalidError,
  SubagentPolicyLoadError,
  SubagentPolicyStore,
  SubagentRevisionConflictError,
  formatModelCliArg,
  getSupportedThinkingLevels,
  mapBbReasoningToNativeThinking,
  mapNativeThinkingToBbReasoning,
  normalizeModelReference,
  resolveSubagentModelConfiguration,
  subagentModelProfileSchema,
  subagentModelReferenceSchema,
  subagentPolicyGetOutputSchema,
  subagentPolicyRecordSchema,
  subagentPolicySchema,
  subagentPolicySetInputSchema,
  subagentPolicySetOutputSchema,
  subagentThinkingLevelSchema
};
//# sourceMappingURL=index.js.map
