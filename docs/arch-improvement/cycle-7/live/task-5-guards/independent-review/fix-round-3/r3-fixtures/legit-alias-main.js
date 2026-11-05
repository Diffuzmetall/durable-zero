#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("../../../../../../../../packages/runner/dist/main.js");
  await runRunner(process.argv.slice(3));
}
