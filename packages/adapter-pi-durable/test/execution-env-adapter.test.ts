import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoreExecutionEnvAdapter, toFileError } from "../src/engine/core-execution-env-adapter.ts";
import { ExecutionEnvs } from "../src/engine/harness-setup.ts";
import type { IExecutionEnvironment } from "@durable-zero/core";
import type { Context } from "@earendil-works/chord";
import { FileError, ExecutionError } from "@earendil-works/pi-durable/env";

const uncancellableContext = { abortSignal: undefined } as unknown as Context;
const cancellableContext = { abortSignal: new AbortController().signal } as unknown as Context;

describe("CoreExecutionEnvAdapter Semantics (R8-01, R8-02, R8-04)", () => {
	it("R8-01: preserves genuine coreEnv.id, rejects unrepresentable metadata/flush, and validates fileInfo kinds", async () => {
		let statIsFile = true;
		let statIsDir = false;

		const mockCore: IExecutionEnvironment = {
			id: "genuine-core-id-42",
			cwd: "/app",
			readFile: async () => "",
			writeFile: async () => {},
			statFile: async () => ({ isFile: statIsFile, isDirectory: statIsDir, sizeBytes: 10, mtimeMs: 1000 }),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCore, "/app");

		// Genuine identity preserved
		assert.equal(adapter.id, "genuine-core-id-42");

		// flushFile returns not_supported (no fake success)
		const flushRes = await adapter.flushFile("/app/file.txt", uncancellableContext);
		assert.equal(flushRes.ok, false);
		if (!flushRes.ok) {
			assert.ok(flushRes.error instanceof FileError);
			assert.equal(flushRes.error.code, "not_supported");
		}

		// listFiles returns not_supported (no fabricated FileListing kind/truncation)
		const listRes = await adapter.listFiles("/app", undefined, uncancellableContext);
		assert.equal(listRes.ok, false);
		if (!listRes.ok) {
			assert.ok(listRes.error instanceof FileError);
			assert.equal(listRes.error.code, "not_supported");
		}

		// fileInfo with valid isFile -> kind: "file"
		const fileInfoOk = await adapter.fileInfo("/app/file.txt", uncancellableContext);
		assert.equal(fileInfoOk.ok, true);
		if (fileInfoOk.ok) {
			assert.equal(fileInfoOk.value.kind, "file");
		}

		// fileInfo with neither isFile nor isDirectory returns not_supported (no forced kind: file)
		statIsFile = false;
		statIsDir = false;
		const fileInfoUnsupported = await adapter.fileInfo("/app/socket", uncancellableContext);
		assert.equal(fileInfoUnsupported.ok, false);
		if (!fileInfoUnsupported.ok) {
			assert.equal(fileInfoUnsupported.error.code, "not_supported");
		}
	});

	it("R8-02: toFileError maps structured codes without string guessing", () => {
		// Error with code EACCES but message containing "file not found" MUST be permission_denied
		const conflictErr = { code: "EACCES", message: "file not found" };
		const mapped1 = toFileError(conflictErr, "/app/test");
		assert.equal(mapped1.code, "permission_denied");

		// Error with code ENOENT but message containing "permission denied" MUST be not_found
		const conflictErr2 = { code: "ENOENT", message: "permission denied" };
		const mapped2 = toFileError(conflictErr2, "/app/test");
		assert.equal(mapped2.code, "not_found");

		// Unknown code with "not found" in message must NOT guess not_found
		const unknownErr = { code: "SOME_CUSTOM_ERROR", message: "not found" };
		const mapped3 = toFileError(unknownErr, "/app/test");
		assert.equal(mapped3.code, "unknown");
	});

	it("R8-02: exists and fileInfo return not_supported when statFile capability is absent", async () => {
		const mockCoreWithoutStat: IExecutionEnvironment = {
			id: "no-stat",
			cwd: "/app",
			readFile: async () => "ok",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCoreWithoutStat, "/app");

		// exists without stat capability cannot test existence via readFile
		const existsRes = await adapter.exists("/app/file.txt", uncancellableContext);
		assert.equal(existsRes.ok, false);
		if (!existsRes.ok) {
			assert.equal(existsRes.error.code, "not_supported");
		}

		// fileInfo without stat capability returns not_supported
		const infoRes = await adapter.fileInfo("/app/file.txt", uncancellableContext);
		assert.equal(infoRes.ok, false);
		if (!infoRes.ok) {
			assert.equal(infoRes.error.code, "not_supported");
		}
	});

	it("R8-04: refuses cancellable context execution; preserves basic exec only for uncancellable contexts", async () => {
		const mockCore: IExecutionEnvironment = {
			id: "exec-core",
			cwd: "/app",
			readFile: async () => "",
			writeFile: async () => {},
			exec: async (argv) => {
				if (argv[0] === "fail-code") {
					return { stdout: "out", stderr: "err", exitCode: 17 };
				}
				return { stdout: "success", stderr: "", exitCode: 0 };
			},
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCore, "/app");

		// Refuses execution when context has an abortSignal (no cancellation contract in pure Core)
		const cancellableRes = await adapter.exec(["ls"], undefined, cancellableContext);
		assert.equal(cancellableRes.ok, false);
		if (!cancellableRes.ok) {
			assert.ok(cancellableRes.error instanceof ExecutionError);
			assert.equal(cancellableRes.error.code, "shell_unavailable");
			assert.match(cancellableRes.error.message, /Cancellable context execution not supported/);
		}

		// String command rejected with shell_unavailable
		const strRes = await adapter.exec("ls -la", undefined, uncancellableContext);
		assert.equal(strRes.ok, false);
		if (!strRes.ok) {
			assert.equal(strRes.error.code, "shell_unavailable");
		}

		// Streaming onOutput rejected with shell_unavailable
		const streamRes = await adapter.exec(["ls"], { onOutput: () => {} }, uncancellableContext);
		assert.equal(streamRes.ok, false);
		if (!streamRes.ok) {
			assert.equal(streamRes.error.code, "shell_unavailable");
		}

		// Non-zero exit is preserved as ok({ exitCode: 17 }) under uncancellable context
		const codeRes = await adapter.exec(["fail-code"], undefined, uncancellableContext);
		assert.equal(codeRes.ok, true);
		if (codeRes.ok) {
			assert.equal(codeRes.value.exitCode, 17);
		}
	});
});

describe("ExecutionEnvs Factory & Lifecycle Management (R8-03)", () => {
	it("validates legacy string constructor throws on missing factory", () => {
		assert.throws(() => {
			new ExecutionEnvs("/app", undefined);
		}, /ExecutionEnvFactory is required/);
	});

	it("deduplicates concurrent in-flight creations for the same key", async () => {
		let factoryCalls = 0;
		const mockCore: IExecutionEnvironment = {
			id: "concurrent-core",
			cwd: "/app",
			readFile: async () => "",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => {},
		};

		const envs = new ExecutionEnvs({
			defaultCwd: "/app",
			coreFactory: async () => {
				factoryCalls++;
				await new Promise((r) => setTimeout(r, 20));
				return mockCore;
			},
		});

		const [envA, envB] = await Promise.all([
			envs.getOrCreate({ cwd: "/app" }, uncancellableContext),
			envs.getOrCreate({ cwd: "/app" }, uncancellableContext),
		]);

		assert.equal(factoryCalls, 1, "Factory must be called exactly once despite concurrent requests");
		assert.equal(envA, envB, "Both callers must receive the exact same adapter instance");
	});

	it("reuses adapter and cleans up underlying Core instance EXACTLY ONCE across distinct keys", async () => {
		let cleanupCalls = 0;
		const mockCore: IExecutionEnvironment = {
			id: "shared-core",
			cwd: "/base",
			readFile: async () => "",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => { cleanupCalls++; },
		};

		const envs = new ExecutionEnvs({
			defaultCwd: "/base",
			coreFactory: async () => mockCore,
		});

		const env1 = await envs.getOrCreate({ cwd: "/sub1" }, uncancellableContext);
		const env2 = await envs.getOrCreate({ cwd: "/sub2" }, uncancellableContext);

		assert.ok(env1);
		assert.ok(env2);
		assert.equal(env1, env2, "Same underlying core instance must share adapter");

		await envs.cleanup(uncancellableContext);
		assert.equal(cleanupCalls, 1, "Underlying Core instance must be cleaned up exactly once");
	});

	it("barrier: in-flight creation during cleanup is disposed and does not leak", async () => {
		let factoryReleased = false;
		let releaseFactory!: () => void;
		const factoryPromise = new Promise<void>((resolve) => {
			releaseFactory = () => {
				factoryReleased = true;
				resolve();
			};
		});

		let envDisposed = false;
		const delayedCore: IExecutionEnvironment = {
			id: "delayed-core",
			cwd: "/delayed",
			readFile: async () => "",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => { envDisposed = true; },
		};

		const envs = new ExecutionEnvs({
			defaultCwd: "/delayed",
			coreFactory: async () => {
				await factoryPromise;
				return delayedCore;
			},
		});

		// 1. Begin creation (starts factory, which is held)
		const createCall = envs.getOrCreate({ cwd: "/delayed" }, uncancellableContext);

		// 2. Start cleanup while creation is still pending
		const cleanupCall = envs.cleanup(uncancellableContext);

		// 3. Release factory while cleanup is waiting
		releaseFactory();

		// Both should resolve cleanly
		await Promise.all([createCall, cleanupCall]);

		// The late-created environment must be cleaned up immediately
		assert.equal(envDisposed, true, "Late-created environment must be disposed on completion");

		// Subsequent getOrCreate calls must fail
		await assert.rejects(
			async () => envs.getOrCreate({ cwd: "/delayed" }, uncancellableContext),
			/ExecutionEnvs is closed/,
		);
	});
});
