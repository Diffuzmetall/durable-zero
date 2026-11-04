#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("../../../../../../../../packages/runner/dist/main.js");
  function unusedBackgroundHelper() {
    main(); // Inside an uninvoked function!
  }
  // The serve branch exits without invoking anything!
}
