import type { Registry } from "@earendil-works/pi-durable";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { SubagentPolicyRecord } from "../policy/types.ts";
import type { PromptOptions } from "../prompt.ts";
import type { DynamicCodemodeNamespaces } from "../codemode-namespaces.ts";

export interface SubsystemContext {
	cwd: string;
	storageDir?: string;
	registry?: Registry;
	settingsManager?: SettingsManager;
	getSubagentPolicy?: () => SubagentPolicyRecord;
	prompt?: PromptOptions;
	dynamicNamespaces?: DynamicCodemodeNamespaces;
}

export interface EngineSubsystem {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	register(ctx: SubsystemContext): Promise<void> | void;
	teardown?(): Promise<void> | void;
}
