#!/usr/bin/env node
const argv = process.argv.slice(2);
const command = argv[0];
if (command === "serve") {
  const { runServer } = await import("../../core/dist/runner.js");
  await runServer(argv.slice(1));
}
