export interface RunnerCliArgs {
	session?: string;
	sessionDir?: string;
	cwd?: string;
	provider?: string;
	model?: string;
	thinking?: string;
	noSession?: boolean;
	continueSession?: boolean;
}

export function parseCliArgs(argv: string[]): RunnerCliArgs {
	const args: RunnerCliArgs = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--session" && i + 1 < argv.length) args.session = argv[++i];
		else if (arg === "--session-dir" && i + 1 < argv.length) args.sessionDir = argv[++i];
		else if (arg === "--cwd" && i + 1 < argv.length) args.cwd = argv[++i];
		else if (arg === "--provider" && i + 1 < argv.length) args.provider = argv[++i];
		else if (arg === "--model" && i + 1 < argv.length) args.model = argv[++i];
		else if (arg === "--thinking" && i + 1 < argv.length) args.thinking = argv[++i];
		else if (arg === "--no-session") args.noSession = true;
		else if (arg === "--continue") args.continueSession = true;
		else if (arg.startsWith("-")) {
			if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) i++;
		} else if (!args.cwd) {
			args.cwd = arg;
		}
	}
	return args;
}
