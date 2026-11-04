import {
	subagentPolicyRecordSchema,
	type SessionCoordinator,
	type IAgentEngine,
	type PromptInput,
	type PromptContentPart,
	type PromptExecutionOptions,
} from "../../../core/src/index.ts";
import {
	JsonRpcMethodNotFoundError,
	JsonRpcInvalidParamsError,
} from "../../../protocol/src/index.ts";
import type { SessionDispatcherOptions } from "./types.ts";
import { UnsupportedCapabilityError } from "./types.ts";

export type MethodHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

function extractPromptInput(params: Record<string, unknown>): PromptInput {
	if (params.content !== undefined) {
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
					throw new JsonRpcInvalidParamsError(`Invalid prompt content part type: ${(part as any).type}`);
				}
			}
			return content as PromptInput;
		}
		throw new JsonRpcInvalidParamsError("Prompt content must be a non-empty string or content parts array");
	}

	const msg = typeof params.message === "string" ? params.message : undefined;
	const imgs = Array.isArray(params.images) ? params.images : undefined;
	if (!msg && (!imgs || imgs.length === 0)) {
		throw new JsonRpcInvalidParamsError("Missing required prompt content, message, or images");
	}

	if (imgs) {
		for (const img of imgs) {
			if (
				!img ||
				typeof img !== "object" ||
				img.type !== "image" ||
				typeof img.data !== "string" ||
				typeof img.mimeType !== "string"
			) {
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
		return imgs as readonly PromptContentPart[];
	}

	return [{ type: "text", text: msg }, ...imgs] as readonly PromptContentPart[];
}

function extractPromptOptions(
	params: Record<string, unknown>,
	forcedDeliverAs?: "steer" | "followUp",
): PromptExecutionOptions {
	let conversationId: string | undefined;
	if (typeof params.conversationId === "string") {
		conversationId = params.conversationId;
	} else if (params.conversationId !== undefined && params.conversationId !== null) {
		throw new JsonRpcInvalidParamsError("conversationId must be a string");
	} else if (params.options && typeof params.options === "object") {
		const optConv = (params.options as any).conversationId;
		if (typeof optConv === "string") {
			conversationId = optConv;
		} else if (optConv !== undefined && optConv !== null) {
			throw new JsonRpcInvalidParamsError("conversationId must be a string");
		}
	}

	let deliverAs = forcedDeliverAs;
	if (!deliverAs) {
		const rawDeliverAs =
			params.deliverAs ?? params.streamingBehavior ?? (params.options as any)?.deliverAs;
		if (rawDeliverAs !== undefined) {
			if (rawDeliverAs !== "steer" && rawDeliverAs !== "followUp") {
				throw new JsonRpcInvalidParamsError("deliverAs must be 'steer' or 'followUp'");
			}
			deliverAs = rawDeliverAs;
		} else {
			deliverAs = "followUp";
		}
	}

	return {
		...(conversationId !== undefined ? { conversationId } : {}),
		...(deliverAs !== undefined ? { deliverAs } : {}),
	};
}

export function createSessionDispatcher(options: SessionDispatcherOptions): MethodHandler {
	const coordinator = options.coordinator;
	const engine = options.engine;

	if (!coordinator || !engine) {
		throw new Error("Both coordinator and engine are required to create a session dispatcher (AP-010, AP-074)");
	}

	return async (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
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
				let conversationId: string | undefined;
				if (params.conversationId !== undefined && params.conversationId !== null) {
					if (typeof params.conversationId !== "string") {
						throw new JsonRpcInvalidParamsError("conversationId must be a string");
					}
					conversationId = params.conversationId;
				}
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
				let instructions: string | undefined;
				if (params.instructions !== undefined && params.instructions !== null) {
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
				if (
					typeof provider !== "string" ||
					provider.trim().length === 0 ||
					typeof modelId !== "string" ||
					modelId.trim().length === 0
				) {
					throw new JsonRpcInvalidParamsError("Missing or invalid provider or modelId");
				}
				await engine.setModel({ provider: provider.trim(), modelId: modelId.trim() });
				return { ok: true };
			}

			case "models/setThinking": {
				const level = params.level;
				const validLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
				if (typeof level !== "string" || !validLevels.has(level)) {
					throw new JsonRpcInvalidParamsError(
						"Missing or invalid thinking level: must be one of off, minimal, low, medium, high, xhigh",
					);
				}
				await engine.setThinkingLevel(level);
				return { ok: true };
			}

			case "session/getState": {
				let conversationId: string | undefined;
				if (params.conversationId !== undefined && params.conversationId !== null) {
					if (typeof params.conversationId !== "string") {
						throw new JsonRpcInvalidParamsError("conversationId must be a string");
					}
					conversationId = params.conversationId;
				}
				return await coordinator.getState(conversationId);
			}

			case "session/getTranscript": {
				let conversationId: string | undefined;
				if (params.conversationId !== undefined && params.conversationId !== null) {
					if (typeof params.conversationId !== "string") {
						throw new JsonRpcInvalidParamsError("conversationId must be a string");
					}
					conversationId = params.conversationId;
				}
				let limit: number | undefined;
				if (params.limit !== undefined && params.limit !== null) {
					if (typeof params.limit !== "number" || !Number.isInteger(params.limit) || params.limit < 0) {
						throw new JsonRpcInvalidParamsError("limit must be a non-negative integer");
					}
					limit = params.limit;
				}
				return await coordinator.getTranscript(conversationId, limit);
			}

			case "session/getStats": {
				let conversationId: string | undefined;
				if (params.conversationId !== undefined && params.conversationId !== null) {
					if (typeof params.conversationId !== "string") {
						throw new JsonRpcInvalidParamsError("conversationId must be a string");
					}
					conversationId = params.conversationId;
				}
				// ARCHITECTURE NOTE (AP-026, AP-076):
				// The returned contextUsage from coordinator.getStats() reflects the engine's current
				// placeholder or token estimate, and does NOT become a verified real-time metric merely
				// because it is routed here. Production verification requires active session metering.
				return await coordinator.getStats(conversationId);
			}

			case "binding/register":
				throw new UnsupportedCapabilityError(
					"binding/register",
					"Runtime binding storage is not exposed on IAgentEngine or SessionCoordinator SPI; requires dedicated IBindingStore or IAgentEngine binding methods.",
				);

			case "binding/list":
				throw new UnsupportedCapabilityError(
					"binding/list",
					"Runtime binding storage is not exposed on IAgentEngine or SessionCoordinator SPI; requires dedicated IBindingStore or IAgentEngine binding methods.",
				);

			case "session/fork":
				throw new UnsupportedCapabilityError(
					"session/fork",
					"Session database forking is not exposed on IAgentEngine or SessionCoordinator SPI; requires administrative ISessionStore.fork() or IAgentEngine session fork port.",
				);

			case "tools/register":
				throw new UnsupportedCapabilityError(
					"tools/register",
					"Dynamic tool registration is not exposed on IAgentEngine or SessionCoordinator SPI; requires tool registry mutation port.",
				);

			default:
				throw new JsonRpcMethodNotFoundError(method);
		}
	};
}
