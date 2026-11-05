// Negative fixture: Forbidden Node I/O in pure core
import fs from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";

export function doIO(): void {
  fs.readFileSync("foo");
  spawn("bar");
  net.connect(80);
}
