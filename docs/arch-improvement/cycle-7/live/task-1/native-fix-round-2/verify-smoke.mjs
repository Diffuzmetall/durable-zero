#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliBin = path.resolve(__dirname, "packages/cli/bin/durable-zero.js");
const extensionFixture = path.resolve(__dirname, "fixtures/scripted-provider-extension.mjs");

async function testBootstrapAndEof() {
	const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "dz-fix2-verify-eof-"));
	const homeDir = path.join(tmpBase, "home");
	const configDir = path.join(tmpBase, "config");
	const agentDir = path.join(tmpBase, "agent");
	const sessionDir = path.join(tmpBase, "session");
	const workDir = path.join(tmpBase, "work");

	await fs.mkdir(homeDir, { recursive: true });
	await fs.mkdir(configDir, { recursive: true });
	await fs.mkdir(agentDir, { recursive: true });
	await fs.mkdir(sessionDir, { recursive: true });
	await fs.mkdir(workDir, { recursive: true });

	let child;
	try {
		child = spawn(
			process.execPath,
			[
				cliBin,
				"serve",
				"--session-dir",
				sessionDir,
				"--cwd",
				workDir,
				"--extension",
				extensionFixture,
				"--provider",
				"scripted-e2e",
				"--model",
				"echo",
				"--no-global-extensions",
			],
			{
				cwd: workDir,
				env: {
					...process.env,
					HOME: homeDir,
					XDG_CONFIG_HOME: configDir,
					PI_AGENT_DIR: agentDir,
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		let childStderr = "";
		child.stderr.on("data", (chunk) => {
			childStderr += chunk.toString();
		});

		const rl = readline.createInterface({ input: child.stdout });
		const statePromise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Timeout waiting for getState")), 10000);
			rl.on("line", (line) => {
				try {
					const msg = JSON.parse(line.trim());
					if (msg.id === 1) {
						clearTimeout(timer);
						resolve(msg);
					}
				} catch {}
			});
		});

		await new Promise((r) => setTimeout(r, 400));
		child.stdin.write(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "session/getState",
				params: {},
			}) + "\n",
		);

		const stateResponse = await statePromise;
		if (stateResponse.result?.activeModel?.provider !== "scripted-e2e") {
			throw new Error(`Unexpected active provider: ${JSON.stringify(stateResponse)}`);
		}
		if (stateResponse.result?.activeModel?.modelId !== "echo") {
			throw new Error(`Unexpected active model: ${JSON.stringify(stateResponse)}`);
		}
		if (stateResponse.result?.entryCount !== 0) {
			throw new Error(`Expected initial entryCount 0, got ${stateResponse.result?.entryCount}`);
		}

		// Trigger stdin EOF shutdown
		const exitPromise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error("Child did not exit within 5s after stdin EOF"));
			}, 5000);
			child.once("exit", (code, signal) => {
				clearTimeout(timer);
				resolve({ code, signal });
			});
		});

		child.stdin.end();
		const exitResult = await exitPromise;
		if (exitResult.code !== 0) {
			throw new Error(`Child exited with non-zero code on stdin EOF: ${exitResult.code}`);
		}
	} finally {
		if (child && child.exitCode === null) {
			try {
				child.kill("SIGKILL");
			} catch {}
		}
		await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
	}
}

async function testBootstrapAndSigterm() {
	const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "dz-fix2-verify-sigterm-"));
	const homeDir = path.join(tmpBase, "home");
	const configDir = path.join(tmpBase, "config");
	const agentDir = path.join(tmpBase, "agent");
	const sessionDir = path.join(tmpBase, "session");
	const workDir = path.join(tmpBase, "work");

	await fs.mkdir(homeDir, { recursive: true });
	await fs.mkdir(configDir, { recursive: true });
	await fs.mkdir(agentDir, { recursive: true });
	await fs.mkdir(sessionDir, { recursive: true });
	await fs.mkdir(workDir, { recursive: true });

	let child;
	try {
		child = spawn(
			process.execPath,
			[
				cliBin,
				"serve",
				"--session-dir",
				sessionDir,
				"--cwd",
				workDir,
				"--extension",
				extensionFixture,
				"--provider",
				"scripted-e2e",
				"--model",
				"echo",
				"--no-global-extensions",
			],
			{
				cwd: workDir,
				env: {
					...process.env,
					HOME: homeDir,
					XDG_CONFIG_HOME: configDir,
					PI_AGENT_DIR: agentDir,
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		const rl = readline.createInterface({ input: child.stdout });
		const statePromise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Timeout waiting for getState")), 10000);
			rl.on("line", (line) => {
				try {
					const msg = JSON.parse(line.trim());
					if (msg.id === 2) {
						clearTimeout(timer);
						resolve(msg);
					}
				} catch {}
			});
		});

		await new Promise((r) => setTimeout(r, 400));
		child.stdin.write(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "session/getState",
				params: {},
			}) + "\n",
		);

		await statePromise;

		const exitPromise = new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error("Child did not exit within 5s on SIGTERM"));
			}, 5000);
			child.once("exit", (code, signal) => {
				clearTimeout(timer);
				resolve({ code, signal });
			});
		});

		child.kill("SIGTERM");
		const exitResult = await exitPromise;
		if (exitResult.code !== 0) {
			throw new Error(`Child exited with non-zero code on SIGTERM: ${exitResult.code}`);
		}
	} finally {
		if (child && child.exitCode === null) {
			try {
				child.kill("SIGKILL");
			} catch {}
		}
		await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
	}
}

async function testUnsupportedCommands() {
	// 1. Doctor command
	const doctorResult = await new Promise((resolve) => {
		const child = spawn(process.execPath, [cliBin, "doctor"], { stdio: ["pipe", "pipe", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (d) => (stderr += d.toString()));
		child.on("exit", (code) => resolve({ code, stderr }));
	});
	if (doctorResult.code !== 1) {
		throw new Error(`Expected doctor to exit with 1, got ${doctorResult.code}`);
	}
	if (!doctorResult.stderr.includes("not implemented")) {
		throw new Error(`Doctor stderr missing expected message: ${doctorResult.stderr}`);
	}

	// 2. Run command
	const runResult = await new Promise((resolve) => {
		const child = spawn(process.execPath, [cliBin, "run", "test prompt"], {
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (d) => (stderr += d.toString()));
		child.on("exit", (code) => resolve({ code, stderr }));
	});
	if (runResult.code !== 1) {
		throw new Error(`Expected run to exit with 1, got ${runResult.code}`);
	}
	if (!runResult.stderr.includes("not supported")) {
		throw new Error(`Run stderr missing expected message: ${runResult.stderr}`);
	}
}

async function run() {
	const start = Date.now();
	console.log(`[${new Date().toISOString()}] Starting Native Candidate Fix-Round-2 Smoke Verification...`);
	console.log(`CLI Bin: ${cliBin}`);
	console.log(`Extension: ${extensionFixture}`);

	console.log(`[${new Date().toISOString()}] Test 1: Bootstrap readiness and clean stdin EOF termination`);
	const t1Start = Date.now();
	await testBootstrapAndEof();
	const t1Duration = Date.now() - t1Start;
	console.log(`[${new Date().toISOString()}] Test 1 PASSED (${t1Duration}ms)`);

	console.log(`[${new Date().toISOString()}] Test 2: Bootstrap readiness and clean SIGTERM termination`);
	const t2Start = Date.now();
	await testBootstrapAndSigterm();
	const t2Duration = Date.now() - t2Start;
	console.log(`[${new Date().toISOString()}] Test 2 PASSED (${t2Duration}ms)`);

	console.log(`[${new Date().toISOString()}] Test 3: Explicit unsupported doctor and run command fail-fast`);
	const t3Start = Date.now();
	await testUnsupportedCommands();
	const t3Duration = Date.now() - t3Start;
	console.log(`[${new Date().toISOString()}] Test 3 PASSED (${t3Duration}ms)`);

	const total = Date.now() - start;
	console.log(`[${new Date().toISOString()}] ALL 3 SMOKE TESTS PASSED in ${total}ms`);
}

run().catch((err) => {
	console.error("SMOKE VERIFICATION FAILED:", err);
	process.exit(1);
});
