#!/usr/bin/env node
import { parseCliArgs } from "./cli-args.ts";
import { assembleDurableZero } from "./composition.ts";

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
	const args = parseCliArgs(argv);
	const instance = await assembleDurableZero({
		...(args.cwd !== undefined ? { cwd: args.cwd } : {}),
		...(args.session !== undefined ? { session: args.session } : {}),
		...(args.sessionDir !== undefined ? { sessionDir: args.sessionDir } : {}),
		...(args.continueSession !== undefined ? { continueSession: args.continueSession } : {}),
		...(args.provider !== undefined ? { provider: args.provider } : {}),
		...(args.model !== undefined ? { model: args.model } : {}),
		...(args.thinking !== undefined ? { thinking: args.thinking } : {}),
		...(args.extension !== undefined ? { extension: args.extension } : {}),
		...(args.extensions !== undefined ? { extensions: args.extensions } : {}),
		...(args.skills !== undefined ? { skills: args.skills } : {}),
		...(args.noGlobalExtensions !== undefined ? { noGlobalExtensions: args.noGlobalExtensions } : {}),
	});

	let isExiting = false;
	const cleanup = async (): Promise<void> => {
		if (isExiting) return;
		isExiting = true;
		try {
			await instance.close();
		} catch (err) {
			console.warn("[Runner] Cleanup error on exit:", err instanceof Error ? err.message : String(err));
		}
		process.exit(0);
	};

	process.stdin.once("end", () => {
		void cleanup();
	});
	process.stdin.once("close", () => {
		void cleanup();
	});
	process.once("SIGINT", () => {
		void cleanup();
	});
	process.once("SIGTERM", () => {
		void cleanup();
	});
	process.on("uncaughtException", (err) => {
		console.error("[Runner] Uncaught exception:", err);
		void cleanup().then(() => process.exit(1));
	});
	process.on("unhandledRejection", (reason) => {
		console.error("[Runner] Unhandled rejection:", reason);
		void cleanup().then(() => process.exit(1));
	});
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
	main().catch((err) => {
		console.error("Fatal runner error:", err);
		process.exit(1);
	});
}

export { main };
