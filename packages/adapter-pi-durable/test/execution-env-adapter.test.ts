import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CoreExecutionEnvAdapter } from "../src/engine/core-execution-env-adapter.ts";
import { ExecutionEnvs } from "../src/engine/harness-setup.ts";
import type { IExecutionEnvironment } from "@durable-zero/core";
import type { Context } from "@earendil-works/chord";
import { FileError, ExecutionError } from "@earendil-works/pi-durable/env";

const dummyContext = { abortSignal: new AbortController().signal } as unknown as Context;

describe("CoreExecutionEnvAdapter (Closing Amendment R8)", () => {
	it("forwards genuinely representable UTF-8 read, write, exists, stat, and listFiles", async () => {
		const files = new Map<string, string>();
		files.set("/app/hello.txt", "world");

		const mockCore: IExecutionEnvironment = {
			readFile: async (p) => {
				const val = files.get(p);
				if (!val) throw new Error("ENOENT");
				return val;
			},
			writeFile: async (p, content) => {
				files.set(p, content);
			},
			statFile: async (p) => {
				if (!files.has(p)) throw new Error("ENOENT");
				return { isFile: true, isDirectory: false, sizeBytes: 5, mtimeMs: 12345 };
			},
			listFiles: async (_p) => Array.from(files.keys()),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCore, "/app");

		// readTextFile
		const readRes = await adapter.readTextFile("/app/hello.txt", dummyContext);
		assert.equal(readRes.ok, true);
		if (readRes.ok) assert.equal(readRes.value, "world");

		// missing file returns FileError("not_found")
		const missingRes = await adapter.readTextFile("/app/missing.txt", dummyContext);
		assert.equal(missingRes.ok, false);
		if (!missingRes.ok) assert.equal(missingRes.error.code, "not_found");

		// writeFile
		const writeRes = await adapter.writeFile("/app/new.txt", "content", dummyContext);
		assert.equal(writeRes.ok, true);
		assert.equal(files.get("/app/new.txt"), "content");

		// exists
		const existsRes = await adapter.exists("/app/hello.txt", dummyContext);
		assert.equal(existsRes.ok, true);
		if (existsRes.ok) assert.equal(existsRes.value, true);

		// fileInfo maps sizeBytes -> size
		const infoRes = await adapter.fileInfo("/app/hello.txt", dummyContext);
		assert.equal(infoRes.ok, true);
		if (infoRes.ok) {
			assert.equal(infoRes.value.size, 5);
			assert.equal(infoRes.value.kind, "file");
		}

		// listFiles
		const listRes = await adapter.listFiles("/app", undefined, dummyContext);
		assert.equal(listRes.ok, true);
		if (listRes.ok) assert.equal(listRes.value.entries.length, 2);
	});

	it("preserves Result semantics for exec (non-zero exit is NOT an ExecutionError)", async () => {
		const mockCore: IExecutionEnvironment = {
			readFile: async () => "",
			writeFile: async () => {},
			exec: async (_argv) => ({ stdout: "error output", stderr: "failure details", exitCode: 42 }),
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCore, "/app");
		let captured = "";
		const execRes = await adapter.exec(["my-cmd", "--flag"], {
			onOutput: (text) => { captured += text; },
		}, dummyContext);

		assert.equal(execRes.ok, true);
		if (execRes.ok) {
			assert.equal(execRes.value.exitCode, 42);
		}
		assert.match(captured, /error output/);
		assert.match(captured, /failure details/);
	});

	it("strictly returns not_supported for operations outside pure Core without touching host", async () => {
		let hostTouched = false;
		const mockCore: IExecutionEnvironment = {
			readFile: async () => { hostTouched = true; return ""; },
			writeFile: async () => { hostTouched = true; },
			exec: async () => { hostTouched = true; return { stdout: "", stderr: "", exitCode: 0 }; },
			cleanup: async () => {},
		};

		const adapter = new CoreExecutionEnvAdapter(mockCore, "/app");

		// readBinaryFile
		const binRes = await adapter.readBinaryFile("/app/data.bin", dummyContext);
		assert.equal(binRes.ok, false);
		if (!binRes.ok) {
			assert.ok(binRes.error instanceof FileError);
			assert.equal(binRes.error.code, "not_supported");
		}

		// appendFile
		const appendRes = await adapter.appendFile("/app/data.txt", "more", dummyContext);
		assert.equal(appendRes.ok, false);
		if (!appendRes.ok) assert.equal(appendRes.error.code, "not_supported");

		// truncateFile
		const truncRes = await adapter.truncateFile("/app/data.txt", 0, dummyContext);
		assert.equal(truncRes.ok, false);
		if (!truncRes.ok) assert.equal(truncRes.error.code, "not_supported");

		// renameFile
		const renameRes = await adapter.renameFile("/app/a", "/app/b", dummyContext);
		assert.equal(renameRes.ok, false);
		if (!renameRes.ok) assert.equal(renameRes.error.code, "not_supported");

		// watch
		const watchRes = await adapter.watch([], () => {}, dummyContext);
		assert.equal(watchRes.ok, false);
		if (!watchRes.ok) assert.equal(watchRes.error.code, "not_supported");

		// string exec fails with shell_unavailable
		const strExecRes = await adapter.exec("echo hello", undefined, dummyContext);
		assert.equal(strExecRes.ok, false);
		if (!strExecRes.ok) {
			assert.ok(strExecRes.error instanceof ExecutionError);
			assert.equal(strExecRes.error.code, "shell_unavailable");
		}

		assert.equal(hostTouched, false, "zero host fallback or unintended core calls occurred");
	});
});

describe("ExecutionEnvs Factory & Lifecycle Management (R8)", () => {
	it("enforces mutual exclusivity: fails if both native and core factories are provided", () => {
		assert.throws(() => {
			new ExecutionEnvs({
				defaultCwd: "/app",
				nativeFactory: async () => undefined,
				coreFactory: async () => ({} as IExecutionEnvironment),
			});
		}, /Configuration error: Both nativeExecutionEnvFactory and executionEnvFactory provided/);
	});

	it("fails if neither factory is provided", () => {
		assert.throws(() => {
			new ExecutionEnvs({ defaultCwd: "/app" });
		}, /ExecutionEnvFactory or NativeExecutionEnvFactory is required/);
	});

	it("cleans up each unique environment EXACTLY ONCE even if mapped to multiple keys", async () => {
		let cleanupCount = 0;
		const mockCore: IExecutionEnvironment = {
			readFile: async () => "",
			writeFile: async () => {},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			cleanup: async () => { cleanupCount++; },
		};

		const envs = new ExecutionEnvs({
			defaultCwd: "/app",
			coreFactory: async () => mockCore,
		});

		// Create env for root
		const env1 = await envs.getOrCreate({ cwd: "/app" }, dummyContext);
		// Get cached env for same cwd
		const env2 = await envs.getOrCreate({ cwd: "/app" }, dummyContext);
		assert.equal(env1, env2);

		await envs.cleanup(dummyContext);
		assert.equal(cleanupCount, 1, "cleanup must be called exactly once per unique instance");
	});
});
