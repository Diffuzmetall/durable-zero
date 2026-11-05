#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const doc = "Usage: await import('../../runner/dist/main.js')";
  console.log(doc);
}
