import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionEnvs } from "../src/harness-setup.ts";
import type { IExecutionEnvironment, ExecutionEnvFactory } from "../src/tools/execution-env.ts";

describe("ExecutionEnvs Strategy Pattern in Core (AP-012, AP-072)", () => {
  it("delegates environment instantiation to injected ExecutionEnvFactory without depending on concrete adapters", () => {
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
    const env = envs.env({ cwd: "/sandbox/dir" });
    assert.equal(calledWithCwd, "/sandbox/dir");
    assert.equal((env as any).id, "mock-env");
  });
});
