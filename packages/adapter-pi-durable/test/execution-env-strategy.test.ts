import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionEnvs } from "../src/engine/harness-setup.ts";
import { openDurable } from "../src/engine/runtime.ts";
import type { IExecutionEnvironment, ExecutionEnvFactory } from "@durable-zero/core";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

describe("ExecutionEnvs Strategy Pattern in Core (AP-012, AP-072)", () => {
  it("delegates environment instantiation to injected ExecutionEnvFactory without depending on concrete adapters", async () => {
    let calledWithCwd: string | undefined;
    const mockEnv: IExecutionEnvironment = {
      id: "mock-env",
      cwd: "/sandbox/dir",
      readFile: async () => "data",
      writeFile: async () => {},
      exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
      cleanup: async () => {},
    };

    const factory: ExecutionEnvFactory = (target) => {
      calledWithCwd = target.cwd;
      return mockEnv;
    };

    const envs = new ExecutionEnvs("/default", factory);
    try {
      const env = await envs.env({ cwd: "/sandbox/dir" }, BACKGROUND_CONTEXT);
      assert.equal(calledWithCwd, "/sandbox/dir");
      assert.equal((env as any)?.id, "mock-env");
    } finally {
      await envs.cleanup(BACKGROUND_CONTEXT);
    }
  });

  it("fails fast when ExecutionEnvFactory is not provided (AP-012, AP-072, AP-073)", () => {
    assert.throws(
      () => new ExecutionEnvs("/default", undefined as unknown as ExecutionEnvFactory),
      /ExecutionEnvFactory is required/,
    );
  });

  it("fails fast in openDurable when executionEnvFactory is not provided (AP-012, AP-072, AP-073)", async () => {
    await assert.rejects(
      async () => await openDurable({ sessionDir: "/tmp/non-existent" }),
      /ExecutionEnvFactory is required in openDurable/,
    );
  });
});
