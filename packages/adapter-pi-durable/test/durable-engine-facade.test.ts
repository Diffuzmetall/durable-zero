import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import type { IAgentEngine } from "@durable-zero/core";

test("PiDurableEngine: provides a cohesive in-process facade implementing IAgentEngine", { timeout: 30000 }, async () => {
	const tempBase = mkdtempSync(join(tmpdir(), "pi-engine-facade-"));
	const sessionDir = join(tempBase, "session");
	const fakeHome = join(tempBase, "home");
	const isolatedCwd = join(tempBase, "cwd");
	mkdirSync(sessionDir, { recursive: true });
	mkdirSync(fakeHome, { recursive: true });
	mkdirSync(isolatedCwd, { recursive: true });

	const envKeys = ["HOME", "XDG_CONFIG_HOME", "PI_AGENT_DIR", "PI_ADDITIONAL_EXTENSIONS"] as const;
	const prevEnv: Record<string, string | undefined> = {};
	for (const key of envKeys) {
		prevEnv[key] = process.env[key];
	}

	process.env.HOME = fakeHome;
	process.env.XDG_CONFIG_HOME = fakeHome;
	process.env.PI_AGENT_DIR = fakeHome;
	delete process.env.PI_ADDITIONAL_EXTENSIONS;

	let engine: IAgentEngine | undefined;

	try {
		// Dynamic import AFTER isolation to prevent module-level caching of global/repo configs
		const { PiDurableEngine } = await import("../src/index.ts");

		const mockEnv = {
			id: "mock-env",
			cwd: isolatedCwd,
			readFile: async () => "",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => {},
		};

		engine = new PiDurableEngine({
			cwd: isolatedCwd,
			sessionDir,
			cli: { noGlobalExtensions: true },
			dependencies: {
				executionEnvFactory: () => mockEnv,
			},
		});

		await engine.start(sessionDir);
		assert.ok(engine);
		assert.equal(typeof engine.submit, "function");
		assert.equal(typeof engine.getState, "function");
		assert.equal(typeof engine.getTranscript, "function");
		assert.equal(typeof engine.getStats, "function");
		assert.equal(typeof engine.abort, "function");
		assert.equal(typeof engine.close, "function");

		// Verify raw SDK instance is encapsulated and not leaked on the public facade
		const instanceLeaked = (engine as any).instance !== undefined;
		assert.equal(instanceLeaked, false, "raw SDK instance must be encapsulated and not leaked on facade");
	} finally {
		try {
			if (engine) {
				await engine.close();
			}
		} finally {
			// Restore exact previous environment, deleting keys that were previously absent
			for (const key of envKeys) {
				if (prevEnv[key] === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = prevEnv[key];
				}
			}
			rmSync(tempBase, { recursive: true, force: true });
		}
	}
});
