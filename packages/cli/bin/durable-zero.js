#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const argv = process.argv.slice(2);

function printHelp() {
	console.log(`
durable-zero — The Sovereign ACID-Persisted Agent Runtime

Usage:
  durable-zero run "<prompt>"        Execute an agent task in current directory
  durable-zero serve [--session id]  Start multi-client socket daemon & stdio server
  durable-zero doctor                Check system health, SQLite, and QuickJS Wasm
  durable-zero --version             Print runtime version
  durable-zero --help                Print this help message
`);
}

async function main() {
	if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
		printHelp();
		process.exit(0);
	}

	if (argv.includes("--version") || argv.includes("-v")) {
		console.log("durable-zero v0.27.0-alpha.1");
		process.exit(0);
	}

	const command = argv[0];

	if (command === "doctor") {
		console.error("durable-zero: 'doctor' command is not implemented in this release. Use 'serve' for JSON-RPC agent execution.");
		process.exit(1);
	}

	if (command === "run") {
		console.error("durable-zero: standalone 'run' command is not supported. Use 'durable-zero serve' for JSON-RPC agent execution.");
		process.exit(1);
	}

	if (command === "serve") {
		const { main: runRunner } = await import("../../runner/dist/main.js");
		await runRunner(argv.slice(1));
		return;
	}

	console.error(`Unknown command: ${command}`);
	printHelp();
	process.exit(1);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
