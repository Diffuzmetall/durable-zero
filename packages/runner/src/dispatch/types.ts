import type { SessionCoordinator, IAgentEngine } from "@durable-zero/core";

export interface SessionDispatcherOptions {
	readonly coordinator: SessionCoordinator;
	readonly engine: IAgentEngine;
}

export class UnsupportedCapabilityError extends Error {
	public readonly capability: string;
	public readonly missingSeam: string;

	constructor(capability: string, missingSeam: string) {
		super(
			`Capability '${capability}' is unsupported by the current SessionCoordinator / IAgentEngine SPI. Missing seam: ${missingSeam}`,
		);
		this.name = "UnsupportedCapabilityError";
		this.capability = capability;
		this.missingSeam = missingSeam;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}
