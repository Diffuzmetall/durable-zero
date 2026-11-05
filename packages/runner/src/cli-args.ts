export interface RunnerCliArgs {
	session?: string;
	sessionDir?: string;
	cwd?: string;
	provider?: string;
	model?: string;
	thinking?: string;
	noSession?: boolean;
	continueSession?: boolean;
	extension?: string;
	extensions?: string[];
	skills?: string[];
	noGlobalExtensions?: boolean;
}

export function parseCliArgs(argv: string[]): RunnerCliArgs {
	const args: RunnerCliArgs = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) {
			continue;
		}

		if (arg === "--session") {
			const val = argv[++i];
			if (val !== undefined) args.session = val;
		} else if (arg === "--session-dir") {
			const val = argv[++i];
			if (val !== undefined) args.sessionDir = val;
		} else if (arg === "--cwd") {
			const val = argv[++i];
			if (val !== undefined) args.cwd = val;
		} else if (arg === "--provider") {
			const val = argv[++i];
			if (val !== undefined) args.provider = val;
		} else if (arg === "--model") {
			const val = argv[++i];
			if (val !== undefined) args.model = val;
		} else if (arg === "--thinking") {
			const val = argv[++i];
			if (val !== undefined) args.thinking = val;
		} else if (arg === "--no-session") {
			args.noSession = true;
		} else if (arg === "--continue") {
			args.continueSession = true;
		} else if (arg === "--no-global-extensions") {
			args.noGlobalExtensions = true;
		} else if (arg === "--extension") {
			const ext = argv[++i];
			if (ext !== undefined) {
				args.extension = ext;
				args.extensions = args.extensions ? [...args.extensions, ext] : [ext];
			}
		} else if (arg === "--skills") {
			const s = argv[++i];
			if (s !== undefined) {
				args.skills = args.skills ? [...args.skills, s] : [s];
			}
		} else if (arg.startsWith("-")) {
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("-")) {
				i++;
			}
		} else if (!args.cwd) {
			args.cwd = arg;
		}
	}
	return args;
}
