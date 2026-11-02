import test from "node:test";
import assert from "node:assert/strict";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, "../bin/durable-zero.js");

test("CLI: --version prints version string", async () => {
	const out = cp.execFileSync("node", [CLI_PATH, "--version"], { encoding: "utf8" }).trim();
	assert.ok(out.includes("durable-zero v0.1.0"), `Unexpected output: ${out}`);
});

test("CLI: doctor checks runtime capabilities", async () => {
	const out = cp.execFileSync("node", [CLI_PATH, "doctor"], { encoding: "utf8" }).trim();
	assert.ok(out.includes("HEALTHY"), `Expected HEALTHY in output, got: ${out}`);
	assert.ok(out.includes("SQLite WAL"), `Expected SQLite check, got: ${out}`);
});

test("CLI: serve --no-session starts server and outputs ready JSON", async () => {
	const p = cp.spawn("node", [CLI_PATH, "serve", "--no-session"], {
		stdio: ["pipe", "pipe", "pipe"],
	});

	try {
		const readyData = await new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Timeout waiting for ready")), 4000);
			p.stdout.once("data", (chunk) => {
				clearTimeout(timer);
				resolve(chunk.toString("utf8"));
			});
			p.once("error", reject);
		});

		const parsed = JSON.parse(readyData.trim());
		assert.equal(parsed.kind, "ready");
		assert.ok(parsed.pid > 0);
	} finally {
		p.kill("SIGTERM");
	}
});
