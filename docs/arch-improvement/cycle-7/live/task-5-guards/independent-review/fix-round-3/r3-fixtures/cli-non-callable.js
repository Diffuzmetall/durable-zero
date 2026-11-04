#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./non-callable-runner/dist-main.js");
  await main();
}
