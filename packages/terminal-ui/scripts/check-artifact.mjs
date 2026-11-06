import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const provenance = JSON.parse(await readFile(join(root, "PROVENANCE.json"), "utf8"));
for (const entry of provenance.files) {
  const bytes = await readFile(join(root, "vendor", entry.path));
  if (createHash("sha256").update(bytes).digest("hex") !== (entry.candidateSha256 ?? entry.sha256))
    throw new Error(`Installed presentation changed: ${entry.path}`);
  if (/\.(?:js|mjs)$/.test(entry.path) && /(?:from\s*|import\s*\()["'](?:dpi-sdk|.*remote-controller|.*\/runtime\.js)/.test(bytes.toString()))
    throw new Error(`Forbidden ownership import: ${entry.path}`);
}
for (const entry of provenance.replacements) {
  const bytes = await readFile(join(root, "vendor", entry.path));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.candidateSha256)
    throw new Error(`Replacement changed: ${entry.path}`);
}
const ui = await import("@local-durable/terminal-ui");
if (typeof ui.runDurableTui !== "function" || typeof ui.CustomEditor !== "function" || typeof ui.toolCardRenderer !== "function")
  throw new Error("Incomplete public UI entry");
console.log(`PASS public UI entry and ${provenance.files.length} installed presentation assets. Editor, theme, layout components, and cards retain source hashes except declared presentation changes.`);
