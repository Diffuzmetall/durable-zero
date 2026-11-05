// Negative fixture: TypeScript import = require syntax
import fs = require("node:fs");
export function read() {
  return fs.readFileSync("foo");
}
