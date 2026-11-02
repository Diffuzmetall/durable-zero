#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import fs from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const projectRoot = resolve(packageRoot, "../..");

console.log("Building durable-zero standalone runner bundle...");

await build({
	entryPoints: [resolve(packageRoot, "src/runner-server.ts")],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: resolve(packageRoot, "dist/runner.js"),
	external: [
		...builtinModules,
		...builtinModules.map((m) => `node:${m}`),
		"@earendil-works/pi-durable",
		"@earendil-works/pi-durable/*",
		"@earendil-works/pi-coding-agent",
		"@earendil-works/pi-coding-agent/*",
		"@earendil-works/pi-codemode",
		"@earendil-works/pi-codemode/*",
		"@earendil-works/pi-ai",
		"@earendil-works/pi-ai/*",
		"@earendil-works/chord",
		"@earendil-works/chord/*",
		"@earendil-works/pi-schema",
		"@earendil-works/pi-schema/*",
		"@sinclair/typebox",
		"@sinclair/typebox/*",
		"proper-lockfile",
		"zod",
		"zod/*",
	],
	banner: {
		js: `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);`,
	},
	sourcemap: true,
});

console.log("Built packages/core/dist/runner.js successfully!");

try {
	const wasmSource = resolve(projectRoot, "node_modules/quickjs-wasi/quickjs.wasm");
	const wasmDest = resolve(packageRoot, "dist/quickjs.wasm");
	await fs.copyFile(wasmSource, wasmDest);
	console.log("Copied quickjs.wasm successfully!");
} catch (err) {
	console.warn("quickjs.wasm copy warning:", err.message);
}
