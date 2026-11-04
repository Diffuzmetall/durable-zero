#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("../../../../../../../../packages/runner/dist/main.js");
  await main(process.argv.slice(3));
}
