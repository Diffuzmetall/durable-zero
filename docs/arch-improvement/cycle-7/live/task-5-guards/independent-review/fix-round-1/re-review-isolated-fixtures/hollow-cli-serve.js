#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("../../../../../../../../packages/runner/dist/main.js");
  console.log("Runner imported but main() never called");
}
