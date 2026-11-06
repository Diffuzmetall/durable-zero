import { createHash } from "node:crypto";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [candidate, prefix] = process.argv.slice(2).map(p => resolve(p));
if (!candidate || !prefix) throw new Error("Usage: node mcp-reload-package-check.mjs CANDIDATE PREFIX");
let symlinks = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(path);
      await access(target);
      if (target !== prefix && !target.startsWith(prefix + sep)) throw new Error(`External link: ${path}`);
      ++symlinks;
    } else if (entry.isDirectory()) await walk(path);
  }
}
await walk(prefix);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const files = [
  ["packages/local-terminal/bin/pi-durable-zero.mjs", "bin/pi-durable-zero.mjs"],
  ["packages/local-terminal/dist/launch.js", "dist/launch.js"],
  ["packages/local-terminal/bin/terminal.mjs", "bin/terminal.mjs"],
  ["packages/local-terminal/dist/main.js", "dist/main.js"],
  ["packages/local-terminal/dist/client.js", "dist/client.js"],
  ["packages/local-runtime/dist/index.js", "node_modules/@local-durable/runtime/dist/index.js"],
  ["packages/local-runtime/dist/main.js", "node_modules/@local-durable/runtime/dist/main.js"],
  ["packages/local-runtime/dist/client.js", "node_modules/@local-durable/runtime/dist/client.js"],
  ["packages/runner/dist/index.js", "node_modules/.pnpm/node_modules/@durable-zero/runner/dist/index.js"],
  ["packages/adapter-pi-durable/dist/index.js", "node_modules/@durable-zero/adapter-pi-durable/dist/index.js"],
];
const hashes = [];
for (const [source, installed] of files) {
  const hash = sha256(await readFile(join(prefix, installed)));
  if (sha256(await readFile(join(candidate, source))) !== hash) throw new Error(`Artifact differs: ${installed}`);
  hashes.push({ path: installed, sha256: hash });
}
const uiRoot = join(prefix, "node_modules/@local-durable/terminal-ui");
const provenance = JSON.parse(await readFile(join(uiRoot, "PROVENANCE.json"), "utf8"));
for (const record of [...provenance.files, ...provenance.replacements]) {
  const hash = sha256(await readFile(join(uiRoot, "vendor", record.path)));
  if (hash !== (record.candidateSha256 ?? record.sha256)) throw new Error(`UI provenance differs: ${record.path}`);
}
const uiPackage = JSON.parse(await readFile(join(uiRoot, "package.json"), "utf8"));
const ui = await import(pathToFileURL(join(uiRoot, uiPackage.exports["."].import)).href);
if (typeof ui.runDurableTui !== "function") throw new Error("Installed UI entry is unavailable");
await access(join(prefix, "LICENSE.Zero"));
console.log(JSON.stringify({ candidate, prefix, symlinks, externalLinks: 0, brokenLinks: 0,
  hashes, presentationRecords: provenance.files.length, replacements: provenance.replacements.length,
  publicUiImport: "pass", zeroLicense: "present" }, null, 2));
