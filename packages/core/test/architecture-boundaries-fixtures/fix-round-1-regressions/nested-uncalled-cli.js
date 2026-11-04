#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("../../../../runner/dist/main.js");
  function unusedWorker() {
    main(); // Inside uninvoked function definition!
  }
}
