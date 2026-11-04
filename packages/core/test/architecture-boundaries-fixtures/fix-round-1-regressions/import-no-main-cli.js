#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./mock-runner-pkg/dist/no-main-target.js");
  await main();
}
