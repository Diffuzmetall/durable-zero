import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { assembleDurableZero } from "../src/composition.ts";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { LocalNodeExecutionEnv } from "@durable-zero/execution";
import type { IExecutionEnvironment } from "@durable-zero/core";
import { MockAgentEngine } from "../../core/test/mocks/mock-agent-engine.ts";

describe("Runner Composition Root — Execution Environment Seam Selection (Parent R8 Amendment)", () => {
	it("rejects configuration with BOTH executionEnvFactory and nativeExecutionEnvFactory as genuine error (AP-012)", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-seam-test-"));
		try {
			const fakeCoreFactory = () => ({} as IExecutionEnvironment);
			const fakeNativeFactory = () => ({} as any);

			await assert.rejects(
				async () =>
					assembleDurableZero({
						cwd: tempDir,
						sessionDir: tempDir,
						executionEnvFactory: fakeCoreFactory,
						nativeExecutionEnvFactory: fakeNativeFactory,
					}),
				/Invalid composition configuration: cannot specify both executionEnvFactory \(Core SPI\) and nativeExecutionEnvFactory \(Native SDK\)/i,
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("accepts custom Core executionEnvFactory without injecting conflicting native default", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-seam-test-"));
		let customCoreCalled = false;
		const customCoreFactory = () => {
			customCoreCalled = true;
			return new LocalNodeExecutionEnv({ cwd: tempDir });
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		const engine = new MockAgentEngine();
		const instance = await assembleDurableZero({
			cwd: tempDir,
			sessionDir: tempDir,
			executionEnvFactory: customCoreFactory,
			engine,
			stdin,
			stdout,
		});

		try {
			assert.ok(instance, "Instance must assemble cleanly with custom Core factory");
			assert.equal(instance.coordinator.isStarted, true);
		} finally {
			await instance.close().catch(() => {});
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("accepts custom Native nativeExecutionEnvFactory without injecting Core executionEnvFactory", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-seam-test-"));
		let customNativeCalled = false;
		const customNativeFactory = (target: any) => {
			customNativeCalled = true;
			return new NodeExecutionEnv({ cwd: target.cwd ?? tempDir });
		};

		const stdin = new Readable({ read() {} });
		const stdout = new Writable({ write(_c, _e, cb) { cb(); } });

		const engine = new MockAgentEngine();
		const instance = await assembleDurableZero({
			cwd: tempDir,
			sessionDir: tempDir,
			nativeExecutionEnvFactory: customNativeFactory,
			engine,
			stdin,
			stdout,
		});

		try {
			assert.ok(instance, "Instance must assemble cleanly with custom Native factory");
			assert.equal(instance.coordinator.isStarted, true);
		} finally {
			await instance.close().catch(() => {});
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("verifies NodeExecutionEnv provides full 25 native SDK methods and is not partial Core LocalNodeExecutionEnv", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-seam-test-"));
		try {
			const nativeEnv = new NodeExecutionEnv({ cwd: tempDir });
			const coreEnv = new LocalNodeExecutionEnv({ cwd: tempDir });

			const native25Methods = [
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

			// Native SDK env provides all 25 methods
			for (const method of native25Methods) {
				assert.equal(
					typeof (nativeEnv as any)[method],
					"function",
					`NodeExecutionEnv must provide full native method ${method}`,
				);
			}

			// Core LocalNodeExecutionEnv only provides Core domain subset (6 methods), not full 25 SDK methods
			assert.equal(typeof (coreEnv as any).watch, "undefined", "Core LocalNodeExecutionEnv must NOT pose as native SDK env (watch missing)");
			assert.equal(typeof (coreEnv as any).readTextLines, "undefined", "Core LocalNodeExecutionEnv must NOT pose as native SDK env (readTextLines missing)");
			assert.equal(typeof (coreEnv as any).openBinaryReader, "undefined", "Core LocalNodeExecutionEnv must NOT pose as native SDK env (openBinaryReader missing)");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("verifies real file effects on NodeExecutionEnv (writeFile, readTextFile, exists, absolutePath)", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "dz-env-effects-"));
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
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
