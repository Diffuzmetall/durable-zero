#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  // Imports runner as unusedModule, never invokes it:
  const unusedModule = await import("../../../../../../../../packages/runner/dist/main.js");
  
  // Unrelated local function named main:
  function main() {
    console.log("Unrelated local main invoked, runner is bypassed!");
  }
  main();
}
