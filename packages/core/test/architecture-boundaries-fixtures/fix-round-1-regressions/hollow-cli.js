#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("../../../../runner/dist/main.js");
  console.log("Runner loaded but main() was never called");
}
