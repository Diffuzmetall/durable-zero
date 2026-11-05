import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import type { ISandboxExtension } from "@durable-zero/core";
import type { BuiltinExtension, BuiltinExtensionContext } from "@durable-zero/adapter-pi-durable";

export class CodemodeExtension implements BuiltinExtension, ISandboxExtension {
	readonly id = "codemode";
	readonly name = "Codemode";
	readonly version = "1.0.0";
	#activeSandbox: CodemodeSandbox | undefined;
	readonly #sandboxes = new Set<CodemodeSandbox>();
	readonly #contextSandboxes = new WeakMap<BuiltinExtensionContext, CodemodeSandbox>();

	get sandbox(): CodemodeSandbox | undefined {
		return this.#activeSandbox;
	}

	getSandboxFor(ctx: BuiltinExtensionContext): CodemodeSandbox | undefined {
		return this.#contextSandboxes.get(ctx);
	}

	register(ctx: BuiltinExtensionContext): void {
		if (!ctx.registry) return;
		const sandbox = new CodemodeSandbox();
		this.#activeSandbox = sandbox;
		this.#sandboxes.add(sandbox);
		this.#contextSandboxes.set(ctx, sandbox);

		const ext = createCodemodeExtension({
			sandbox,
			get namespaces() {
				return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
			},
		});
		ctx.registry.install(ext);
	}

	async teardown(): Promise<void> {
		const sandboxes = Array.from(this.#sandboxes);
		this.#sandboxes.clear();
		this.#activeSandbox = undefined;

		for (const sb of sandboxes) {
			const target = sb as { close?: () => Promise<void>; dispose?: () => Promise<void> };
			if (typeof target.close === "function") {
				await target.close();
			} else if (typeof target.dispose === "function") {
				await target.dispose();
			}
		}
	}
}

export function createCodemodeBuiltinExtension(): CodemodeExtension {
	return new CodemodeExtension();
}
