import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

export interface PiResourceExtensionOptions {
	cwd: string;
	agentDir?: string;
	settingsManager?: SettingsManager;
	resourceLoader?: DefaultResourceLoader;
}

export interface PiResourceExtension extends Extension {
	readonly configProvider: SettingsManager;
	readonly resourceLoader: DefaultResourceLoader;
}

export function createPiResourceExtension(options: PiResourceExtensionOptions): PiResourceExtension {
	const settingsManager = options.settingsManager ?? SettingsManager.create(options.cwd);
	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			cwd: options.cwd,
			agentDir: options.agentDir,
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
