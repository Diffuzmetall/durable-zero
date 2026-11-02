import { createCodingTools, CodingTools } from "@earendil-works/pi-durable/tools";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import type { BuiltinExtension, BuiltinExtensionContext } from "./types.ts";

export const codingToolsExtension: BuiltinExtension = {
	id: "coding-tools",
	name: "Coding Tools",
	version: "1.0.0",
	async register(ctx: BuiltinExtensionContext): Promise<void> {
		if (!ctx.registry) return;
		let tools = CodingTools;
		try {
			const images = await createNodePhotonImages();
			tools = createCodingTools({ images });
		} catch {
			// Fall back to standard coding tools if photon images are unavailable
		}
		ctx.registry.install(tools);
	},
};

export default codingToolsExtension;
