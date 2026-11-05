#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./fake-runner-exploit/dist/main.js");
  await main();
}
