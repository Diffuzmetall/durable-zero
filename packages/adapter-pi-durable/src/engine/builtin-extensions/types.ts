import type { Registry } from "@earendil-works/pi-durable";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { SubagentPolicyRecord } from "@durable-zero/core";
import type { PromptOptions } from "../prompt.ts";
import type { DynamicCodemodeNamespaces } from "../codemode-namespaces.ts";

export interface BuiltinExtensionContext {
	cwd: string;
	storageDir?: string;
	registry?: Registry;
	settingsManager?: SettingsManager;
	getSubagentPolicy?: () => SubagentPolicyRecord;
	prompt?: PromptOptions;
	dynamicNamespaces?: DynamicCodemodeNamespaces;
}

export interface BuiltinExtension {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	register(ctx: BuiltinExtensionContext): Promise<void> | void;
	teardown?(): Promise<void> | void;
}
