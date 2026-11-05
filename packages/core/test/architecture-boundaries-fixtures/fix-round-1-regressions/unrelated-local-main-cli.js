#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const unusedModule = await import("../../../../runner/dist/main.js");
  function main() { console.log("unrelated local main"); }
  main();
}
