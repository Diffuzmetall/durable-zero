export class DurablePluginError extends Error {
	readonly pluginId: string;
	readonly code = "PLUGIN_ERROR";

	constructor(pluginId: string, message?: string, cause?: unknown) {
		super(message ?? `Plugin failure: ${pluginId}`, { cause });
		this.name = "DurablePluginError";
		this.pluginId = pluginId;
	}
}
