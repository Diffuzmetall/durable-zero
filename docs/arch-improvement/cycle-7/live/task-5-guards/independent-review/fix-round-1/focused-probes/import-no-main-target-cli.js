#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  // Target exists and contains "runner" in path, but exports no main:
  const { main } = await import("./mock-runner-pkg/no-main-target.js");
  await main();
}
