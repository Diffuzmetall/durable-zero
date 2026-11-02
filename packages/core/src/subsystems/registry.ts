import { EngineSubsystemError } from "../shared/errors.ts";
import type { EngineSubsystem, SubsystemContext } from "./types.ts";

export class SubsystemRegistry {
	readonly #subsystems = new Map<string, EngineSubsystem>();

	register(subsystem: EngineSubsystem): void {
		if (this.#subsystems.has(subsystem.id)) {
			throw new EngineSubsystemError(
				subsystem.id,
				`Subsystem with id '${subsystem.id}' is already registered`,
			);
		}
		this.#subsystems.set(subsystem.id, subsystem);
	}

	get(id: string): EngineSubsystem | undefined {
		return this.#subsystems.get(id);
	}

	list(): EngineSubsystem[] {
		return Array.from(this.#subsystems.values());
	}

	async initAll(ctx: SubsystemContext): Promise<void> {
		for (const subsystem of this.#subsystems.values()) {
			try {
				await subsystem.register(ctx);
			} catch (err) {
				if (err instanceof EngineSubsystemError) throw err;
				throw new EngineSubsystemError(
					subsystem.id,
					`Failed to initialize subsystem '${subsystem.id}': ${err instanceof Error ? err.message : String(err)}`,
					{ cause: err },
				);
			}
		}
	}

	async teardownAll(): Promise<void> {
		const subsystems = Array.from(this.#subsystems.values()).reverse();
		for (const subsystem of subsystems) {
			if (typeof subsystem.teardown === "function") {
				try {
					await subsystem.teardown();
				} catch {
					// Gracefully proceed with other teardowns
				}
			}
		}
	}
}
