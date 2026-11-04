import { createSubagentExtension } from "../subagent.ts";
import { Anchor, DefaultCourier, DefaultReporter } from "../subagent-delivery.ts";
import type { BuiltinExtension, BuiltinExtensionContext } from "./types.ts";

export const subagentsExtension: BuiltinExtension = {
	id: "subagents",
	name: "Subagents",
	version: "1.0.0",
	register(ctx: BuiltinExtensionContext): void {
		if (!ctx.registry) return;
		if (typeof ctx.getSubagentPolicy === "function") {
			ctx.registry.install(createSubagentExtension(ctx.getSubagentPolicy));
		}
		ctx.registry.install(Anchor);
		ctx.registry.install(DefaultCourier);
		ctx.registry.install(DefaultReporter);
	},
	teardown(): void {
		// Clean lifecycle teardown hook for subagents extension
	},
};

export default subagentsExtension;
