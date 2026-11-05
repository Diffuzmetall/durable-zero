#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("../../../../runner/dist/main.js");
  await runRunner();
}
