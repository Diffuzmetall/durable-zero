import { BuiltinExtensionError } from "../shared/errors.ts";
import type { BuiltinExtension, BuiltinExtensionContext } from "./types.ts";

export class BuiltinExtensionRegistry {
	readonly #extensions = new Map<string, BuiltinExtension>();

	register(extension: BuiltinExtension): void {
		if (this.#extensions.has(extension.id)) {
			throw new BuiltinExtensionError(
				extension.id,
				`Built-in extension with id '${extension.id}' is already registered`,
			);
		}
		this.#extensions.set(extension.id, extension);
	}

	get(id: string): BuiltinExtension | undefined {
		return this.#extensions.get(id);
	}

	list(): BuiltinExtension[] {
		return Array.from(this.#extensions.values());
	}

	async initAll(ctx: BuiltinExtensionContext): Promise<void> {
		for (const extension of this.#extensions.values()) {
			try {
				await extension.register(ctx);
			} catch (err) {
				if (err instanceof BuiltinExtensionError) throw err;
				throw new BuiltinExtensionError(
					extension.id,
					`Failed to initialize built-in extension '${extension.id}': ${err instanceof Error ? err.message : String(err)}`,
					{ cause: err },
				);
			}
		}
	}

	async teardownAll(): Promise<void> {
		const extensions = Array.from(this.#extensions.values()).reverse();
		for (const extension of extensions) {
			if (typeof extension.teardown === "function") {
				try {
					await extension.teardown();
				} catch {
					// Gracefully proceed with other teardowns
				}
			}
		}
	}
}
