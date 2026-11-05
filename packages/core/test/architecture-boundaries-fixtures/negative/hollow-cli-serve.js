#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("../../../../runner/dist/main.js");
  // Hollow: never invokes main()
  console.log("Runner imported but not invoked");
}
