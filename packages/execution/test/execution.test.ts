import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalNodeExecutionEnv, MockExecutionEnv } from "../src/index.ts";

describe("@durable-zero/execution Adapter Package", () => {
  it("MockExecutionEnv provides fast in-memory filesystem for tests", async () => {
    const mock = new MockExecutionEnv();
    await mock.writeFile("test.txt", "hello world");
    assert.equal(await mock.readFile("test.txt"), "hello world");
    const res = await mock.exec(["echo", "ok"]);
    assert.equal(res.exitCode, 0);
  });

  it("LocalNodeExecutionEnv executes against local node filesystem", async () => {
    const local = new LocalNodeExecutionEnv({ cwd: process.cwd() });
    assert.equal(local.cwd, process.cwd());
    assert.equal(typeof local.readFile, "function");
    assert.equal(typeof local.writeFile, "function");
    assert.equal(typeof local.exec, "function");
  });
});
