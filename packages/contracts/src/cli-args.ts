export interface CliArgs {
	readonly session?: string;
	readonly sessionDir?: string;
	readonly cwd?: string;
	readonly provider?: string;
	readonly model?: string;
	readonly thinking?: string;
	readonly noSession?: boolean;
	readonly continueSession?: boolean;
	readonly extension?: string;
	readonly extensions?: readonly string[];
	readonly skills?: readonly string[];
	readonly noGlobalExtensions?: boolean;
}
