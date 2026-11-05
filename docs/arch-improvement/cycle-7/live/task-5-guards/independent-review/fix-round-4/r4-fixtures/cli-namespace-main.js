#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("../../../../../../../../packages/runner/dist/main.js");
  await runner.main(process.argv.slice(3));
}
