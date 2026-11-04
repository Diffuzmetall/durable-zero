#!/usr/bin/env node
import { parseCliArgs } from "./cli-args.ts";
import { assembleDurableZero } from "./composition.ts";

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const instance = await assembleDurableZero({
    cwd: args.cwd,
    session: args.session,
    provider: args.provider,
    model: args.model,
    thinking: args.thinking,
  });

  const cleanup = async (): Promise<void> => {
    try {
      await instance.close();
    } catch (err) {
      console.warn("[Runner] Cleanup error on exit:", err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  };

  process.on("SIGINT", () => { void cleanup(); });
  process.on("SIGTERM", () => { void cleanup(); });
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
