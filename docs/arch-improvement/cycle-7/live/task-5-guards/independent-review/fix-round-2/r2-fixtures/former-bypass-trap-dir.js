#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./fake-runner-pkg/main.js");
  await main();
}
