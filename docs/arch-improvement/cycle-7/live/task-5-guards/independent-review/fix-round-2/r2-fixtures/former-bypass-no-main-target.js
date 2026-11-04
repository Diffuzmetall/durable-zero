#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./no-main-module.js");
  await main();
}
