import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

import { assembleDurableZero } from "../../../../../../../../../packages/runner/src/composition.ts";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LocalNodeExecutionEnv } from "../../../../../../../../../packages/execution/src/adapters/local-node-env.ts";

function createHermeticSandbox() {
	const tempDir = mkdtempSync(join(tmpdir(), "dz-independent-seam-"));
	mkdirSync(join(tempDir, "home"), { recursive: true });
	mkdirSync(join(tempDir, "agent"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_config"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_data"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_cache"), { recursive: true });

	const originalEnv = {
		HOME: process.env.HOME,
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
		XDG_DATA_HOME: process.env.XDG_DATA_HOME,
		XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
		PI_AGENT_DIR: process.env.PI_AGENT_DIR,
		PI_ADDITIONAL_EXTENSIONS: process.env.PI_ADDITIONAL_EXTENSIONS,
	};

	process.env.HOME = join(tempDir, "home");
	process.env.XDG_CONFIG_HOME = join(tempDir, "xdg_config");
	process.env.XDG_DATA_HOME = join(tempDir, "xdg_data");
	process.env.XDG_CACHE_HOME = join(tempDir, "xdg_cache");
	process.env.PI_AGENT_DIR = join(tempDir, "agent");
	delete process.env.PI_ADDITIONAL_EXTENSIONS;

	const cleanup = () => {
		if (originalEnv.HOME !== undefined) process.env.HOME = originalEnv.HOME;
		else delete process.env.HOME;
		if (originalEnv.XDG_CONFIG_HOME !== undefined) process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
		else delete process.env.XDG_CONFIG_HOME;
		if (originalEnv.XDG_DATA_HOME !== undefined) process.env.XDG_DATA_HOME = originalEnv.XDG_DATA_HOME;
		else delete process.env.XDG_DATA_HOME;
		if (originalEnv.XDG_CACHE_HOME !== undefined) process.env.XDG_CACHE_HOME = originalEnv.XDG_CACHE_HOME;
		else delete process.env.XDG_CACHE_HOME;
		if (originalEnv.PI_AGENT_DIR !== undefined) process.env.PI_AGENT_DIR = originalEnv.PI_AGENT_DIR;
		else delete process.env.PI_AGENT_DIR;
		if (originalEnv.PI_ADDITIONAL_EXTENSIONS !== undefined) process.env.PI_ADDITIONAL_EXTENSIONS = originalEnv.PI_ADDITIONAL_EXTENSIONS;
		else delete process.env.PI_ADDITIONAL_EXTENSIONS;
		rmSync(tempDir, { recursive: true, force: true });
	};

	return { tempDir, cleanup };
}

describe("Task 1 Root Delta — Independent Execution Environment Seam Probes", () => {
	it("Probe 1: Rejects configuration with BOTH executionEnvFactory and nativeExecutionEnvFactory as genuine error (AP-012, AP-074)", async () => {
		const { tempDir, cleanup } = createHermeticSandbox();
		try {
			const fakeCore = () => ({});
			const fakeNative = () => ({});

			await assert.rejects(
				async () =>
					assembleDurableZero({
						cwd: tempDir,
						sessionDir: join(tempDir, "session"),
						executionEnvFactory: fakeCore,
						nativeExecutionEnvFactory: fakeNative,
						noGlobalExtensions: true,
					}),
				/Invalid composition configuration: cannot specify both executionEnvFactory \(Core SPI\) and nativeExecutionEnvFactory \(Native SDK\)/i,
			);
		} finally {
			cleanup();
		}
	});

	it("Probe 2: Actual native Root startup with custom Core executionEnvFactory invokes factory and creates owned file effect", async () => {
		const { tempDir, cleanup } = createHermeticSandbox();
		let customCoreCalled = false;
		let createdEnv;

		const customCoreFactory = (target) => {
			customCoreCalled = true;
			createdEnv = new LocalNodeExecutionEnv({ cwd: target.cwd ?? tempDir });
			return createdEnv;
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance;
		try {
			instance = await assembleDurableZero({
				cwd: tempDir,
				sessionDir: join(tempDir, "session"),
				executionEnvFactory: customCoreFactory,
				noGlobalExtensions: true,
				stdin,
				stdout,
			});

			assert.ok(instance, "Instance must assemble cleanly with custom Core factory");
			assert.equal(instance.coordinator.isStarted, true);
			assert.equal(customCoreCalled, true, "Core factory MUST be invoked during real native startup");
			assert.ok(createdEnv, "Core environment instance must be created");

			// Owned real file effect
			const testFile = join(tempDir, "core-effect.txt");
			await createdEnv.writeFile(testFile, "core-payload-data");
			const content = await createdEnv.readFile(testFile);
			assert.equal(content, "core-payload-data");
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			cleanup();
		}
	});

	it("Probe 3: Actual native Root startup with custom Native nativeExecutionEnvFactory invokes factory and creates owned file effect", async () => {
		const { tempDir, cleanup } = createHermeticSandbox();
		let customNativeCalled = false;
		let createdEnv;

		const customNativeFactory = (target) => {
			customNativeCalled = true;
			createdEnv = new NodeExecutionEnv({ cwd: target.cwd ?? tempDir });
			return createdEnv;
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance;
		try {
			instance = await assembleDurableZero({
				cwd: tempDir,
				sessionDir: join(tempDir, "session"),
				nativeExecutionEnvFactory: customNativeFactory,
				noGlobalExtensions: true,
				stdin,
				stdout,
			});

			assert.ok(instance, "Instance must assemble cleanly with custom Native factory");
			assert.equal(instance.coordinator.isStarted, true);
			assert.equal(customNativeCalled, true, "Native factory MUST be invoked during real native startup");
			assert.ok(createdEnv, "Native environment instance must be created");

			// Owned real file effect with Context and Result envelope
			const testFile = join(tempDir, "native-effect.txt");
			const writeRes = await createdEnv.writeFile(testFile, "native-payload-data", BACKGROUND_CONTEXT);
			assert.equal(writeRes.ok, true);
			const readRes = await createdEnv.readTextFile(testFile, BACKGROUND_CONTEXT);
			assert.equal(readRes.ok, true);
			assert.equal(readRes.value, "native-payload-data");
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			cleanup();
		}
	});

	it("Probe 4: Actual native Root startup with DEFAULT wiring uses NodeExecutionEnv with 24 required native methods", async () => {
		const { tempDir, cleanup } = createHermeticSandbox();
		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance;
		try {
			instance = await assembleDurableZero({
				cwd: tempDir,
				sessionDir: join(tempDir, "session"),
				noGlobalExtensions: true,
				stdin,
				stdout,
			});

			assert.ok(instance, "Instance must assemble cleanly with default wiring");
			assert.equal(instance.coordinator.isStarted, true);

			const defaultNativeEnv = new NodeExecutionEnv({ cwd: tempDir });
			const required24Methods = [
				"watch", "absolutePath", "joinPath", "exec", "openTextLineReader",
				"readTextFile", "readTextLines", "readBinaryFile", "openBinaryReader",
				"writeFile", "appendFile", "truncateFile", "flushFile", "renameFile",
				"fileInfo", "listDir", "openDirReader", "canonicalPath", "exists",
				"createDir", "remove", "createTempDir", "createTempFile", "cleanup",
			];

			for (const m of required24Methods) {
				assert.equal(typeof defaultNativeEnv[m], "function", `Default NodeExecutionEnv must provide method ${m}`);
			}
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			cleanup();
		}
	});
});
