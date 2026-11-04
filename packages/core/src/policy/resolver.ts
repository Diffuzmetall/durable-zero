import { normalizeModelReference } from "../models/provider.ts";
import type {
	ResolvedChildConfiguration,
	SubagentModelReference,
	SubagentPolicyRecord,
	SubagentThinkingLevel,
} from "./types.ts";
import {
	SubagentModelUnavailableError,
	SubagentPolicyInvalidError,
} from "./errors.ts";

const EXTENDED_THINKING_LEVELS: readonly SubagentThinkingLevel[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export function getSupportedThinkingLevels(model: {
	reasoning?: boolean;
	thinkingLevelMap?: Record<string, unknown>;
}): readonly SubagentThinkingLevel[] {
	if (!model.reasoning) {
		return ["off"];
	}
	return EXTENDED_THINKING_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh" || level === "max") return mapped !== undefined;
		return true;
	});
}

export function mapBbReasoningToNativeThinking(
	level: string | undefined,
): SubagentThinkingLevel {
	if (level === "none" || level === undefined) {
		return "off";
	}
	return level as SubagentThinkingLevel;
}

export function mapNativeThinkingToBbReasoning(
	level: SubagentThinkingLevel,
): string {
	if (level === "off") {
		return "none";
	}
	return level;
}

export interface ResolveSubagentParentContext {
	model?: SubagentModelReference;
	thinkingLevel?: SubagentThinkingLevel | "none";
}

export function resolveSubagentModelConfiguration(
	record: SubagentPolicyRecord,
	parentContext: ResolveSubagentParentContext,
	availableModels: readonly any[],
): ResolvedChildConfiguration {
	if (record.policy.mode === "inherit") {
		const parentModel = normalizeModelReference(parentContext.model);
		if (!parentModel) {
			throw new SubagentPolicyInvalidError(
				"Parent model is required for inherit mode",
			);
		}
		return {
			model: {
				provider: parentModel.provider,
				modelId: parentModel.modelId,
			},
			thinkingLevel: mapBbReasoningToNativeThinking(parentContext.thinkingLevel),
			source: "parent_inherited",
			policyRevision: record.revision,
		};
	}

	const targetProfile = record.policy.configuredProfile;
	const targetModel = normalizeModelReference(targetProfile?.model);
	const foundModel = targetModel
		? availableModels.find((m) => {
				const availableNorm = normalizeModelReference(m, m.provider);
				return (
					availableNorm &&
					availableNorm.provider === targetModel.provider &&
					availableNorm.modelId === targetModel.modelId
				);
			})
		: undefined;

	if (!foundModel || !targetModel) {
		throw new SubagentModelUnavailableError(
			`Configured subagent model "${targetProfile?.model?.provider}/${targetProfile?.model?.modelId}" is unavailable or unauthenticated. Update the subagent model in Settings → Installed plugins → Pi Durable → Subagents.`,
		);
	}

	const supportedLevels = getSupportedThinkingLevels(foundModel);
	if (!supportedLevels.includes(targetProfile.thinkingLevel)) {
		throw new SubagentPolicyInvalidError(
			`Thinking level "${targetProfile.thinkingLevel}" is not supported by model "${targetModel.provider}/${targetModel.modelId}". Supported levels: ${supportedLevels.join(", ")}.`,
		);
	}

	return {
		model: {
			provider: targetModel.provider,
			modelId: targetModel.modelId,
		},
		thinkingLevel: targetProfile.thinkingLevel,
		source: "user_configured",
		policyRevision: record.revision,
	};
}
