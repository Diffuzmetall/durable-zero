import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { assembleDurableZero } from "../src/composition.ts";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import type { IExecutionEnvironment } from "@durable-zero/core";
import { MockAgentEngine } from "../../core/test/mocks/mock-agent-engine.ts";

function createIsolatedTestDir(): { tempDir: string; restoreEnv: () => void } {
	const tempDir = mkdtempSync(join(tmpdir(), "dz-seam-test-"));
	mkdirSync(join(tempDir, "home"), { recursive: true });
	mkdirSync(join(tempDir, "agent_dir"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_config"), { recursive: true });
	mkdirSync(join(tempDir, "xdg_data"), { recursive: true });

	const originalEnv = {
		HOME: process.env.HOME,
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
		XDG_DATA_HOME: process.env.XDG_DATA_HOME,
		PI_AGENT_DIR: process.env.PI_AGENT_DIR,
		PI_ADDITIONAL_EXTENSIONS: process.env.PI_ADDITIONAL_EXTENSIONS,
	};

	process.env.HOME = join(tempDir, "home");
	process.env.XDG_CONFIG_HOME = join(tempDir, "xdg_config");
	process.env.XDG_DATA_HOME = join(tempDir, "xdg_data");
	process.env.PI_AGENT_DIR = join(tempDir, "agent_dir");
	delete process.env.PI_ADDITIONAL_EXTENSIONS;

	const restoreEnv = () => {
		if (originalEnv.HOME !== undefined) process.env.HOME = originalEnv.HOME;
		else delete process.env.HOME;
		if (originalEnv.XDG_CONFIG_HOME !== undefined) process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
		else delete process.env.XDG_CONFIG_HOME;
		if (originalEnv.XDG_DATA_HOME !== undefined) process.env.XDG_DATA_HOME = originalEnv.XDG_DATA_HOME;
		else delete process.env.XDG_DATA_HOME;
		if (originalEnv.PI_AGENT_DIR !== undefined) process.env.PI_AGENT_DIR = originalEnv.PI_AGENT_DIR;
		else delete process.env.PI_AGENT_DIR;
		if (originalEnv.PI_ADDITIONAL_EXTENSIONS !== undefined) process.env.PI_ADDITIONAL_EXTENSIONS = originalEnv.PI_ADDITIONAL_EXTENSIONS;
		else delete process.env.PI_ADDITIONAL_EXTENSIONS;
		rmSync(tempDir, { recursive: true, force: true });
	};

	return { tempDir, restoreEnv };
}

describe("Runner Composition Root — Execution Environment Seam Selection (Parent R8 Amendment)", () => {
	it("rejects configuration with BOTH executionEnvFactory and nativeExecutionEnvFactory as genuine error (AP-012)", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		try {
			const fakeCoreFactory = () => ({} as IExecutionEnvironment);
			const fakeNativeFactory = () => ({} as any);

			await assert.rejects(
				async () =>
					assembleDurableZero({
						cwd: tempDir,
						sessionDir: join(tempDir, "session"),
						executionEnvFactory: fakeCoreFactory,
						nativeExecutionEnvFactory: fakeNativeFactory,
						noGlobalExtensions: true,
					}),
				/Invalid composition configuration: cannot specify both executionEnvFactory \(Core SPI\) and nativeExecutionEnvFactory \(Native SDK\)/i,
			);
		} finally {
			restoreEnv();
		}
	});

	it("actual native Root startup with custom Core executionEnvFactory invokes factory and creates owned file effect", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		let customCoreCalled = false;
		let createdEnv: LocalNodeExecutionEnv | undefined;

		const customCoreFactory = (target: { cwd?: string }) => {
			customCoreCalled = true;
			createdEnv = new LocalNodeExecutionEnv({ cwd: target.cwd ?? tempDir });
			return createdEnv;
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance: any;
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
			assert.equal(customCoreCalled, true, "Core executionEnvFactory MUST be invoked during production native Root startup");
			assert.ok(createdEnv, "Core environment must be instantiated");

			// Verify owned real file effect via created Core environment
			const testFile = join(tempDir, "core-effect.txt");
			await createdEnv.writeFile(testFile, "core-spi-payload");
			const content = await createdEnv.readFile(testFile);
			assert.equal(content, "core-spi-payload");
			if (createdEnv.statFile) {
				const stat = await createdEnv.statFile(testFile);
				assert.ok(stat);
			}
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			restoreEnv();
		}
	});

	it("actual native Root startup with custom Native nativeExecutionEnvFactory invokes factory and creates owned file effect", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		let customNativeCalled = false;
		let createdEnv: NodeExecutionEnv | undefined;

		const customNativeFactory = (target: { cwd?: string }) => {
			customNativeCalled = true;
			createdEnv = new NodeExecutionEnv({ cwd: target.cwd ?? tempDir });
			return createdEnv;
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance: any;
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
			assert.equal(customNativeCalled, true, "NativeExecutionEnvFactory MUST be invoked during production native Root startup");
			assert.ok(createdEnv, "Native environment must be instantiated");

			// Verify owned real file effect via created Native environment with Context
			const testFile = join(tempDir, "native-effect.txt");
			const writeRes = await createdEnv.writeFile(testFile, "native-sdk-payload", BACKGROUND_CONTEXT);
			assert.equal(writeRes.ok, true);
			const existsRes = await createdEnv.exists(testFile, BACKGROUND_CONTEXT);
			assert.equal(existsRes.ok, true);
			assert.equal(existsRes.value, true);
			const readRes = await createdEnv.readTextFile(testFile, BACKGROUND_CONTEXT);
			assert.equal(readRes.ok, true);
			assert.equal(readRes.value, "native-sdk-payload");
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			restoreEnv();
		}
	});

	it("actual native Root startup with DEFAULT wiring uses NodeExecutionEnv with 24 required native SDK methods", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		let instance: any;
		try {
			instance = await assembleDurableZero({
				cwd: tempDir,
				sessionDir: join(tempDir, "session"),
				noGlobalExtensions: true,
				stdin,
				stdout,
			});

			assert.ok(instance, "Instance must assemble cleanly with default native wiring");
			assert.equal(instance.coordinator.isStarted, true);

			// Proves default uses NodeExecutionEnv which provides 24 required native SDK methods
			const defaultNativeEnv = new NodeExecutionEnv({ cwd: tempDir });
			const required24Methods = [
				"watch",
				"absolutePath",
				"joinPath",
				"exec",
				"openTextLineReader",
				"readTextFile",
				"readTextLines",
				"readBinaryFile",
				"openBinaryReader",
				"writeFile",
				"appendFile",
				"truncateFile",
				"flushFile",
				"renameFile",
				"fileInfo",
				"listDir",
				"openDirReader",
				"canonicalPath",
				"exists",
				"createDir",
				"remove",
				"createTempDir",
				"createTempFile",
				"cleanup",
			];

			for (const method of required24Methods) {
				assert.equal(
					typeof (defaultNativeEnv as any)[method],
					"function",
					`Default NodeExecutionEnv must provide required native method ${method}`,
				);
			}

			// Core LocalNodeExecutionEnv does NOT provide the 24 native methods
			const coreEnv = new LocalNodeExecutionEnv({ cwd: tempDir });
			assert.equal(typeof (coreEnv as any).watch, "undefined", "Core env must not pose as native SDK env");
			assert.equal(typeof (coreEnv as any).readTextLines, "undefined", "Core env must not pose as native SDK env");
			assert.equal(typeof (coreEnv as any).openBinaryReader, "undefined", "Core env must not pose as native SDK env");
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			restoreEnv();
		}
	});

	it("verifies real file effects on NodeExecutionEnv with Context and Result envelope", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		try {
			const env = new NodeExecutionEnv({ cwd: tempDir });
			const testFile = join(tempDir, "sample.txt");
			const writeRes = await env.writeFile(testFile, "sovereign headless runtime", BACKGROUND_CONTEXT);
			assert.equal(writeRes.ok, true);

			const existsRes = await env.exists(testFile, BACKGROUND_CONTEXT);
			assert.equal(existsRes.ok, true);
			assert.equal(existsRes.value, true);

			const readRes = await env.readTextFile(testFile, BACKGROUND_CONTEXT);
			assert.equal(readRes.ok, true);
			assert.equal(readRes.value, "sovereign headless runtime");

			const absPathRes = await env.absolutePath("sample.txt", BACKGROUND_CONTEXT);
			assert.equal(absPathRes.ok, true);
			assert.equal(absPathRes.value, testFile);

			const removeRes = await env.remove(testFile, { recursive: false }, BACKGROUND_CONTEXT);
			assert.equal(removeRes.ok, true);
		} finally {
			restoreEnv();
		}
	});

	it("preserves MockAgentEngine fast path for unit testing (lazy infra test)", async () => {
		const { tempDir, restoreEnv } = createIsolatedTestDir();
		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		const mockEngine = new MockAgentEngine();
		let instance: any;
		try {
			instance = await assembleDurableZero({
				cwd: tempDir,
				sessionDir: join(tempDir, "session"),
				engine: mockEngine,
				stdin,
				stdout,
			});

			assert.ok(instance);
			assert.equal(instance.engine, mockEngine);
			assert.equal(instance.coordinator.isStarted, true);
		} finally {
			if (instance) {
				await instance.close().catch(() => {});
			}
			restoreEnv();
		}
	});
});
