
import fs = require("node:fs");
export function readData() {
  return fs.readFileSync("foo");
}
