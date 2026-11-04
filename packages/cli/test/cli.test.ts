import test from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, "../bin/durable-zero.js");

test("CLI: --version prints version string", async () => {
	const out = cp.execFileSync("node", [CLI_PATH, "--version"], { encoding: "utf8" }).trim();
	assert.ok(out.includes("durable-zero v0.26.31"), `Unexpected output: ${out}`);
});

test("CLI: doctor checks runtime capabilities", async () => {
	const out = cp.execFileSync("node", [CLI_PATH, "doctor"], { encoding: "utf8" }).trim();
	assert.ok(out.includes("HEALTHY"), `Expected HEALTHY in output, got: ${out}`);
	assert.ok(out.includes("SQLite WAL"), `Expected SQLite check, got: ${out}`);
});

import os from "node:os";
import fs from "node:fs/promises";

test("CLI: serve starts JSON-RPC server and responds to requests", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dz-cli-test-"));
	const extensionFixture = path.resolve(__dirname, "../../runner/test/fixtures/scripted-provider-extension.ts");
	const p = cp.spawn(
		"node",
		[
			CLI_PATH,
			"serve",
			"--session",
			tmpDir,
			"--extension",
			extensionFixture,
			"--provider",
			"scripted-e2e",
			"--model",
			"echo",
		],
		{
			cwd: path.resolve(__dirname, "../../.."),
			env: {
				...process.env,
				HOME: path.join(tmpDir, "home"),
				XDG_CONFIG_HOME: path.join(tmpDir, "config"),
				PI_AGENT_DIR: path.join(tmpDir, "agent"),
			},
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	try {
		const response = await new Promise<string>((resolve, reject) => {
			let stderr = "";
			p.stderr.on("data", (chunk) => {
				stderr += chunk.toString("utf8");
			});
			const timer = setTimeout(() => reject(new Error(`Timeout waiting for server response. Stderr: ${stderr}`)), 8000);
			let buffer = "";
			p.stdout.on("data", (chunk) => {
				buffer += chunk.toString("utf8");
				const lines = buffer.split("\n");
				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith("{") && trimmed.includes('"jsonrpc"')) {
						clearTimeout(timer);
						resolve(trimmed);
						return;
					}
				}
			});
			p.once("error", reject);

			p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "session/getState", params: {} }) + "\n");
		});

		const parsed = JSON.parse(response);
		assert.equal(parsed.jsonrpc, "2.0");
		assert.equal(parsed.id, 1);
		assert.ok(parsed.result);
	} finally {
		p.kill("SIGTERM");
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
});
