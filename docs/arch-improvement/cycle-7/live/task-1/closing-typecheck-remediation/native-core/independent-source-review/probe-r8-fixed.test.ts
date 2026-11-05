import test from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT, withCancel } from "@earendil-works/chord/context";
import type { IExecutionEnvironment } from "@durable-zero/core";
import { CoreExecutionEnvAdapter } from "./frozen-08c6-source/core-execution-env-adapter.ts";
import { ExecutionEnvs } from "./frozen-08c6-source/harness-setup.ts";

function createMockCoreEnv(overrides: Partial<IExecutionEnvironment> = {}): IExecutionEnvironment {
	return {
		id: "core-env-canonical-101",
		cwd: "/workspace/mock",
		readFile: async (p: string) => `content-of-${p}`,
		writeFile: async () => {},
		exec: async () => ({ stdout: "ok\n", stderr: "", exitCode: 0 }),
		cleanup: async () => {},
		...overrides,
	};
}

// ----------------------------------------------------------------------------
// Baseline / Negative Control: Genuine supported read returns ok
// ----------------------------------------------------------------------------
test("NEGATIVE CONTROL: Baseline readTextFile on supported Core env returns ok", async () => {
	const core = createMockCoreEnv();
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.readTextFile("hello.txt", BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, true);
	if (res.ok) {
		assert.strictEqual(res.value, "content-of-hello.txt");
	}
});

// ----------------------------------------------------------------------------
// GROUP 1 (R8-01): Unsupported operations and metadata reported as success
// ----------------------------------------------------------------------------
test("GROUP 1.1 (R8-01): flushFile must return err(FileError('not_supported'))", async () => {
	const core = createMockCoreEnv();
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.flushFile("hello.txt", BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false, "flushFile must not return ok on pure Core environment");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "not_supported");
	}
});

test("GROUP 1.2 (R8-01): listFiles must not invent metadata or truncated=false", async () => {
	const core = createMockCoreEnv({
		listFiles: async () => ["subfolder", "data.json"],
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.listFiles(".", undefined, BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false, "listFiles without full FileListing metadata must return not_supported");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "not_supported");
	}
});

test("GROUP 1.3 (R8-01): Constructor must preserve underlying coreEnv.id", async () => {
	const core = createMockCoreEnv({ id: "core-env-canonical-101" });
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	assert.strictEqual(adapter.id, "core-env-canonical-101", "adapter.id must match coreEnv.id, not a random hash");
});

test("GROUP 1.4 (R8-01): fileInfo must return not_supported if neither isFile nor isDirectory is true", async () => {
	const core = createMockCoreEnv({
		statFile: async () => ({
			isFile: false,
			isDirectory: false,
			sizeBytes: 0,
			mtimeMs: 1000,
		}),
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.fileInfo("/dev/special", BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false, "fileInfo must not force kind='file' when neither isFile nor isDirectory is true");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "not_supported");
	}
});

// ----------------------------------------------------------------------------
// GROUP 2 (R8-02): Permission, cancellation and unknown errors masquerade as not_found
// ----------------------------------------------------------------------------
test("GROUP 2.1 (R8-02): readTextFile must preserve permission_denied error", async () => {
	const permError = new Error("EACCES: permission denied, open '/secret.key'");
	(permError as unknown as { code: string }).code = "EACCES";
	const core = createMockCoreEnv({
		readFile: async () => {
			throw permError;
		},
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.readTextFile("/secret.key", BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.strictEqual(
			res.error.code,
			"permission_denied",
			`Expected permission_denied, got ${res.error.code}`,
		);
	}
});

test("GROUP 2.2 (R8-02): exists must not return ok(false) on permission denied", async () => {
	const permError = new Error("EACCES: permission denied");
	(permError as unknown as { code: string }).code = "EACCES";
	const core = createMockCoreEnv({
		statFile: async () => {
			throw permError;
		},
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.exists("/forbidden", BACKGROUND_CONTEXT);
	assert.strictEqual(
		res.ok,
		false,
		"exists must return err(FileError('permission_denied')) when stat fails with permission error",
	);
	if (!res.ok) {
		assert.strictEqual(res.error.code, "permission_denied");
	}
});

test("GROUP 2.3 (R8-02): readTextFile must return aborted when context is cancelled", async () => {
	let coreCalled = false;
	const core = createMockCoreEnv({
		readFile: async () => {
			coreCalled = true;
			return "data";
		},
	});
	const { context, cancel } = withCancel(BACKGROUND_CONTEXT);
	cancel(new Error("User cancelled"));
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.readTextFile("/file.txt", context);
	assert.strictEqual(coreCalled, false, "Core readFile must not be called when context is already aborted");
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.strictEqual(res.error.code, "aborted");
	}
});

test("GROUP 2.4 (R8-02): toFileError must prioritize structured EACCES code over 'not found' text in message", async () => {
	const mixedError = new Error("Resource not found in private directory; EACCES: access denied");
	(mixedError as unknown as { code: string }).code = "EACCES";
	const core = createMockCoreEnv({
		readFile: async () => {
			throw mixedError;
		},
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.readTextFile("/private/item", BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.strictEqual(
			res.error.code,
			"permission_denied",
			`Structured EACCES code must yield permission_denied, not not_found; got: ${res.error.code}`,
		);
	}
});

// ----------------------------------------------------------------------------
// GROUP 3 (R8-03): Async environment cache and cleanup do not ensure single ownership
// ----------------------------------------------------------------------------
test("GROUP 3.1 (R8-03): Concurrent same-key getOrCreate must return the identical instance", async () => {
	let factoryCallCount = 0;
	const core = createMockCoreEnv();
	const envs = new ExecutionEnvs({
		defaultCwd: "/workspace/mock",
		coreFactory: async () => {
			factoryCallCount++;
			await new Promise((resolve) => setTimeout(resolve, 10));
			return core;
		},
	});

	const [env1, env2] = await Promise.all([
		envs.getOrCreate({ cwd: "/workspace/mock" }, BACKGROUND_CONTEXT),
		envs.getOrCreate({ cwd: "/workspace/mock" }, BACKGROUND_CONTEXT),
	]);

	assert.strictEqual(env1, env2, "Concurrent calls for same key must return the identical environment instance");
	assert.strictEqual(factoryCallCount, 1, "Factory must only be called once for in-flight concurrent key");
});

test("GROUP 3.2 (R8-03): Same Core instance for 2 keys must only have cleanup called once", async () => {
	let cleanupCount = 0;
	const core = createMockCoreEnv({
		cleanup: async () => {
			cleanupCount++;
		},
	});
	const envs = new ExecutionEnvs({
		defaultCwd: "/workspace/mock",
		coreFactory: async () => {
			return core;
		},
	});

	await envs.getOrCreate({ cwd: "/workspace/dirA" }, BACKGROUND_CONTEXT);
	await envs.getOrCreate({ cwd: "/workspace/dirB" }, BACKGROUND_CONTEXT);

	await envs.cleanup(BACKGROUND_CONTEXT);
	assert.strictEqual(cleanupCount, 1, "Core environment cleanup must be called exactly once despite multiple keys");
});

test("GROUP 3.3 (R8-03): Cleanup failure on first env must not prevent cleanup of subsequent envs", async () => {
	let env2Cleaned = false;
	const core1 = createMockCoreEnv({
		id: "core-env-1",
		cleanup: async () => {
			throw new Error("Disk unmount failure");
		},
	});
	const core2 = createMockCoreEnv({
		id: "core-env-2",
		cleanup: async () => {
			env2Cleaned = true;
		},
	});

	const envs = new ExecutionEnvs({
		defaultCwd: "/workspace/mock",
		coreFactory: async (target) => {
			if (target.cwd?.includes("dirA")) return core1;
			return core2;
		},
	});

	await envs.getOrCreate({ cwd: "/workspace/dirA" }, BACKGROUND_CONTEXT);
	await envs.getOrCreate({ cwd: "/workspace/dirB" }, BACKGROUND_CONTEXT);

	await assert.rejects(
		async () => {
			await envs.cleanup(BACKGROUND_CONTEXT);
		},
		"cleanup should reject when an environment fails cleanup",
	);

	assert.strictEqual(env2Cleaned, true, "Subsequent environment cleanup must still run when earlier environment cleanup throws");
});

test("GROUP 3.4 (R8-03): Legacy string ctor without factory must throw configuration error", () => {
	assert.throws(
		() => {
			// @ts-expect-error testing legacy constructor invocation without factory
			new ExecutionEnvs("/workspace/mock");
		},
		/ExecutionEnvFactory is required/,
		"Legacy string constructor without factory must throw fail-fast error",
	);
});

test("GROUP 3.5 (R8-03): In-flight creation during cleanup must be drained and not leak uncleaned env", async () => {
	let coreCleanupCalled = false;
	const core = createMockCoreEnv({
		cleanup: async () => {
			coreCleanupCalled = true;
		},
	});

	let resolveFactory: (val: IExecutionEnvironment) => void;
	const factoryPromise = new Promise<IExecutionEnvironment>((resolve) => {
		resolveFactory = resolve;
	});

	const envs = new ExecutionEnvs({
		defaultCwd: "/workspace/mock",
		coreFactory: () => factoryPromise,
	});

	// Start in-flight creation
	const inFlightGet = envs.getOrCreate({ cwd: "/workspace/mock" }, BACKGROUND_CONTEXT);

	// Concurrently initiate cleanup while factory is still in-flight
	const cleanupPromise = envs.cleanup(BACKGROUND_CONTEXT);

	// Now settle the factory
	resolveFactory!(core);

	await cleanupPromise;
	await inFlightGet.catch(() => {});

	// Post-cleanup getOrCreate must throw or return undefined, never reviving closed cache
	await assert.rejects(
		async () => {
			await envs.getOrCreate({ cwd: "/workspace/mock" }, BACKGROUND_CONTEXT);
		},
		/closed/i,
		"Cannot get or create envs after cleanup has completed",
	);
});

// ----------------------------------------------------------------------------
// GROUP 4 (R8-04): Fake post-hoc stdout/stderr stream + ignored native options/cancellation
// ----------------------------------------------------------------------------
test("GROUP 4.1 (R8-04): exec with onOutput must reject with shell_unavailable", async () => {
	const core = createMockCoreEnv({
		exec: async () => ({ stdout: "hello\n", stderr: "", exitCode: 0 }),
	});
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.exec(["echo", "hello"], { onOutput: () => {} }, BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false, "exec with onOutput streaming must return shell_unavailable on pure Core");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "shell_unavailable");
	}
});

test("GROUP 4.2 (R8-04): exec with spill/window must reject with shell_unavailable", async () => {
	const core = createMockCoreEnv();
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.exec(["echo", "hello"], { spill: { afterBytes: 100, afterLines: 10 } }, BACKGROUND_CONTEXT);
	assert.strictEqual(res.ok, false, "exec with spill must return shell_unavailable on pure Core");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "shell_unavailable");
	}
});

test("GROUP 4.3 (R8-04): exec must abort when context is cancelled", async () => {
	let execCalled = false;
	const core = createMockCoreEnv({
		exec: async () => {
			execCalled = true;
			return { stdout: "", stderr: "", exitCode: 0 };
		},
	});
	const { context, cancel } = withCancel(BACKGROUND_CONTEXT);
	cancel(new Error("Command cancelled"));
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const res = await adapter.exec(["sleep", "10"], undefined, context);
	assert.strictEqual(execCalled, false, "Core exec must not be called when context is already cancelled");
	assert.strictEqual(res.ok, false);
	if (!res.ok) {
		assert.strictEqual(res.error.code, "shell_unavailable");
	}
});

test("GROUP 4.4 (R8-04): exec must refuse cancellable contexts up front (no signal contract in Core)", async () => {
	const core = createMockCoreEnv();
	const adapter = new CoreExecutionEnvAdapter(core, "/workspace/mock");
	const { context } = withCancel(BACKGROUND_CONTEXT);
	// Context is cancellable (has abortSignal)
	const res = await adapter.exec(["echo", "test"], undefined, context);
	assert.strictEqual(res.ok, false, "exec on pure Core must refuse cancellable context as shell_unavailable");
	if (!res.ok) {
		assert.strictEqual(res.error.code, "shell_unavailable");
	}
});
