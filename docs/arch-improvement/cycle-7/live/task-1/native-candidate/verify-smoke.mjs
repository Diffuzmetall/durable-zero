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

async function runVerification() {
	const startTime = Date.now();
	const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "dz-native-candidate-verify-"));
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

	const logs = [];
	function log(msg) {
		const line = `[${new Date().toISOString()}] ${msg}`;
		logs.push(line);
		console.log(line);
	}

	log("Starting isolated native candidate bootstrap verification...");
	log(`CLI Bin: ${cliBin}`);
	log(`Extension Fixture: ${extensionFixture}`);
	log(`Temp Root: ${tmpBase}`);

	let child;
	let exitCode = null;
	let stateResponse = null;
	let childStderr = "";

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

		child.stderr.on("data", (chunk) => {
			const text = chunk.toString();
			childStderr += text;
			logs.push(`[STDERR] ${text.trim()}`);
		});

		const rl = readline.createInterface({ input: child.stdout });
		const statePromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Timeout (10s) waiting for session/getState response"));
			}, 10000);

			rl.on("line", (line) => {
				const trimmed = line.trim();
				logs.push(`[STDOUT] ${trimmed}`);
				try {
					const msg = JSON.parse(trimmed);
					if (msg.id === 1) {
						clearTimeout(timeout);
						resolve(msg);
					}
				} catch {
					// Ignore non-json output
				}
			});
		});

		// Small delay to ensure process init, then send readiness handshake
		await new Promise((r) => setTimeout(r, 400));
		log("Sending JSON-RPC readiness request: session/getState (id: 1)");
		child.stdin.write(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "session/getState",
				params: {},
			}) + "\n",
		);

		stateResponse = await statePromise;
		log(`Received getState response: ${JSON.stringify(stateResponse)}`);

		if (!stateResponse.result) {
			throw new Error(`getState returned error or no result: ${JSON.stringify(stateResponse)}`);
		}
		if (stateResponse.result.activeModel?.provider !== "scripted-e2e") {
			throw new Error(`Expected provider scripted-e2e, got: ${stateResponse.result.activeModel?.provider}`);
		}
		if (stateResponse.result.activeModel?.modelId !== "echo") {
			throw new Error(`Expected model echo, got: ${stateResponse.result.activeModel?.modelId}`);
		}
		log("Readiness verification PASSED: activeModel is scripted-e2e:echo, session initialized.");

		// Bounded clean shutdown
		log("Initiating bounded clean shutdown via SIGTERM...");
		const exitPromise = new Promise((resolve, reject) => {
			const killTimer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error("Process did not terminate within 5s on SIGTERM, killed with SIGKILL"));
			}, 5000);

			child.once("exit", (code, signal) => {
				clearTimeout(killTimer);
				resolve({ code, signal });
			});
		});

		child.kill("SIGTERM");
		const exitResult = await exitPromise;
		exitCode = exitResult.code;
		log(`Process exited cleanly with code: ${exitResult.code}, signal: ${exitResult.signal}`);

		if (exitCode !== 0) {
			throw new Error(`Process exited with non-zero code: ${exitCode}`);
		}
	} catch (err) {
		log(`ERROR: ${err.message}`);
		throw err;
	} finally {
		if (child && child.exitCode === null) {
			try {
				child.kill("SIGKILL");
			} catch {}
		}
		await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
	}

	const durationMs = Date.now() - startTime;
	log(`Verification completed in ${durationMs}ms`);

	return {
		logs,
		stateResponse,
		exitCode,
		durationMs,
	};
}

runVerification()
	.then((result) => {
		console.log("ALL SMOKE CHECKS PASSED.");
	})
	.catch((err) => {
		console.error("SMOKE CHECKS FAILED:", err);
		process.exit(1);
	});
