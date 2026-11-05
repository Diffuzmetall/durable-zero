#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner-fake-exploit");
  await main();
}
