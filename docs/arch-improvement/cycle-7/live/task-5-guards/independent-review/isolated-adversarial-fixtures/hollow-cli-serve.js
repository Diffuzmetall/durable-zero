#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runnerModule = await import("../../runner/dist/main.js");
  // Never calls main! Hollow implementation.
  console.log("Serving disabled or bypassed");
}
