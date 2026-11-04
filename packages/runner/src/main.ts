#!/usr/bin/env node
import { parseCliArgs } from "./cli-args.ts";
import { assembleDurableZero } from "./composition.ts";

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
	const args = parseCliArgs(argv);
	const instance = await assembleDurableZero({
		cwd: args.cwd,
		session: args.session,
		sessionDir: args.sessionDir,
		continueSession: args.continueSession,
		provider: args.provider,
		model: args.model,
		thinking: args.thinking,
		extension: args.extension,
		extensions: args.extensions,
		skills: args.skills,
		noGlobalExtensions: args.noGlobalExtensions,
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
