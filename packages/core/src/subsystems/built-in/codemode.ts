import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import type { EngineSubsystem, SubsystemContext } from "../types.ts";

let activeSandbox: CodemodeSandbox | undefined;

export const codemodeSubsystem: EngineSubsystem = {
	id: "codemode",
	name: "Codemode",
	version: "1.0.0",
	register(ctx: SubsystemContext): void {
		if (!ctx.registry) return;
		activeSandbox = new CodemodeSandbox();
		const ext = createCodemodeExtension({
			sandbox: activeSandbox,
			get namespaces() {
				return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
			},
		});
		ctx.registry.install(ext);
	},
	async teardown(): Promise<void> {
		if (activeSandbox) {
			const sb = activeSandbox as { close?: () => Promise<void>; dispose?: () => Promise<void> };
			if (typeof sb.close === "function") {
				await sb.close();
			} else if (typeof sb.dispose === "function") {
				await sb.dispose();
			}
			activeSandbox = undefined;
		}
	},
};

export default codemodeSubsystem;
