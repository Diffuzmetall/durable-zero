#!/usr/bin/env node
const argv = process.argv.slice(2);
const command = argv[0];
if (command === "serve") {
  const { main: runRunner } = await import("../../../../runner/dist/main.js");
  await runRunner(argv.slice(1));
}
