export interface ISandbox {
	close?(): Promise<void>;
	dispose?(): Promise<void>;
}

export interface ISandboxExtension {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	teardown?(): Promise<void>;
}
