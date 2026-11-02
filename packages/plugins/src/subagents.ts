import { createSubagentExtension } from "@durable-zero/core";
import { Anchor, DefaultCourier, DefaultReporter } from "@durable-zero/core";
import type { DurablePlugin, DurablePluginContext } from "@durable-zero/sdk";

export const subagentsPlugin: DurablePlugin = {
	id: "subagents",
	name: "Subagents",
	category: "built-in",
	version: "1.0.0",
	register(ctx: DurablePluginContext): void {
		if (!ctx.registry) return;
		if (typeof ctx.getSubagentPolicy === "function") {
			ctx.registry.install(createSubagentExtension(ctx.getSubagentPolicy));
		}
		ctx.registry.install(Anchor);
		ctx.registry.install(DefaultCourier);
		ctx.registry.install(DefaultReporter);
	},
	teardown(): void {
		// Clean lifecycle teardown hook for subagents plugin
	},
};

export default subagentsPlugin;
