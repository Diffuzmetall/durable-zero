import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

export interface PiResourceExtensionOptions {
	cwd?: string;
	agentDir?: string;
	settingsManager?: SettingsManager;
	resourceLoader?: DefaultResourceLoader;
}

export interface PiResourceExtension extends Extension {
	readonly configProvider: SettingsManager;
	readonly resourceLoader: DefaultResourceLoader;
}

export function createPiResourceExtension(options: Partial<PiResourceExtensionOptions> = {}): PiResourceExtension {
	const cwd = options.cwd ?? process.cwd();
	const agentDir = options.agentDir ?? getAgentDir();
	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd);
	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
		});

	const baseExt = defineExtension({
		name: "pi-resource",
	});

	return Object.assign(baseExt, {
		configProvider: settingsManager,
		resourceLoader,
	});
}
