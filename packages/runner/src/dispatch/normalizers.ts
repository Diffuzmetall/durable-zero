import {
	type PromptInput,
	type PromptContentPart,
} from "@durable-zero/contracts";
import {
	type PromptExecutionOptions,
} from "@durable-zero/core";
import { conversationIdSchema } from "@durable-zero/contracts";
import { JsonRpcInvalidParamsError } from "@durable-zero/protocol";

export function normalizeConversationId(raw: unknown): string | undefined {
	if (raw === undefined || raw === null) {
		return undefined;
	}
	const parsed = conversationIdSchema.safeParse(raw);
	if (!parsed.success) {
		throw new JsonRpcInvalidParamsError(
			`Invalid conversationId: must be a positive integer or non-zero digit string: ${String(raw)}`,
		);
	}
	return String(parsed.data);
}

export function extractPromptInput(params: Record<string, unknown>): PromptInput {
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

export function extractPromptOptions(
	params: Record<string, unknown>,
	forcedDeliverAs?: "steer" | "followUp",
): PromptExecutionOptions {
	const rawConv = params.conversationId ?? (params.options as any)?.conversationId;
	const conversationId = normalizeConversationId(rawConv);

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
