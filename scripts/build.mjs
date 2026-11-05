#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import fs from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const externals = [
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
	"@earendil-works/chord",
	"@earendil-works/chord/*",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-ai/*",
	"@earendil-works/pi-codemode",
	"@earendil-works/pi-codemode/*",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-coding-agent/*",
	"@earendil-works/pi-durable",
	"@earendil-works/pi-durable/*",
	"@earendil-works/pi-schema",
	"@earendil-works/pi-schema/*",
	"@sinclair/typebox",
	"@sinclair/typebox/*",
	"proper-lockfile",
	"quickjs-wasi",
	"zod",
	"zod/*",
];

console.log("Building durable-zero packages...");

const packages = ["contracts", "protocol", "core", "execution", "adapter-pi-durable", "adapter-pi-ai", "adapter-codemode", "extension-pi-resource", "runner"];

for (const pkg of packages) {
	await build({
		entryPoints: [resolve(root, `packages/${pkg}/src/index.ts`)],
		bundle: true,
		platform: "node",
		target: "node22",
		format: "esm",
		outfile: resolve(root, `packages/${pkg}/dist/index.js`),
		external: externals,
		sourcemap: true,
	});
	console.log(`- Built packages/${pkg}/dist/index.js`);
}

// Build @durable-zero/runner executable CLI
await build({
	entryPoints: [resolve(root, "packages/runner/src/main.ts")],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: resolve(root, "packages/runner/dist/main.js"),
	external: externals,
	banner: {
		js: `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);`,
	},
	sourcemap: true,
});
console.log("- Built packages/runner/dist/main.js");

// QuickJS WASM asset copy

try {
	const wasmSource = resolve(root, "node_modules/.pnpm/quickjs-wasi@3.6.2/node_modules/quickjs-wasi/quickjs.wasm");
	const coreWasmDest = resolve(root, "packages/core/dist/quickjs.wasm");
	const runnerWasmDest = resolve(root, "packages/runner/dist/quickjs.wasm");
	await fs.copyFile(wasmSource, coreWasmDest);
	await fs.copyFile(wasmSource, runnerWasmDest);
	console.log("- Copied quickjs.wasm to packages/core/dist/ and packages/runner/dist/");
} catch (err) {
	console.warn("- Warning: quickjs.wasm copy skipped:", err.message);
}

console.log("durable-zero build complete!");
