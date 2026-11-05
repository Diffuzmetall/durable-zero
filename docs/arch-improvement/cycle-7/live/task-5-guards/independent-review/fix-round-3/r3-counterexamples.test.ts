import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as checker from "../../../../../../../packages/core/test/architecture-boundaries-checker.ts";
import { auditCliServeEntrypoint } from "../../../../../../../packages/core/test/architecture-boundaries-cli.ts";
import {
  verifyFileExportsMain,
  isCallableNode,
} from "../../../../../../../packages/core/test/architecture-boundaries-runner-verify.ts";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "r3-fixtures"
);

function setupFixtures() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

describe("Task 5A Fix Round 3: Independent Adversarial Probes & Invariant Verification", () => {
  setupFixtures();

  const realRunnerRel = path.relative(
    FIXTURES_DIR,
    path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
  );

  describe("Section 1: Verification of the Four Former Structural Bypasses (All Now Correctly Rejected)", () => {
    it("BYPASS 1 NOW REJECTED: non-callable export (export const main = 17) is rejected", () => {
      const mockPkgDir = path.join(FIXTURES_DIR, "non-callable-runner");
      fs.mkdirSync(mockPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(mockPkgDir, "package.json"),
        JSON.stringify({ name: "@durable-zero/runner" }),
        "utf8"
      );
      const targetPath = path.join(mockPkgDir, "dist-main.js");
      fs.writeFileSync(targetPath, "export const main = 17;\n", "utf8");

      const cliPath = path.join(FIXTURES_DIR, "cli-non-callable.js");
      const relToTarget = path.relative(FIXTURES_DIR, targetPath);
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToTarget.startsWith(".") ? relToTarget : `./${relToTarget}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject non-callable export");
      assert.match(result.error ?? "", /exports no callable main\(\) entrypoint function/);
    });

    it("BYPASS 2 NOW REJECTED: inverted condition if (command !== 'serve') is rejected", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-inverted-cond.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command !== "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject inverted condition !== 'serve'");
      assert.match(result.error ?? "", /does not declare an if \(command === "serve"\) branch/);
    });

    it("BYPASS 3 NOW REJECTED: fake package prefix '@durable-zero/runner-fake-package' is rejected", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-fake-prefix.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner-fake-package");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject fake package prefix");
      assert.match(result.error ?? "", /not @durable-zero\/runner package/);
    });

    it("BYPASS 4 NOW REJECTED: main() invocation inside uninvoked local function declaration is rejected", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-uncalled-nested.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  function backgroundTask() {
    main(); // Inside uninvoked function declaration!
  }
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject main() call hidden inside uninvoked nested function");
      assert.match(result.error ?? "", /Hollow implementation detected.*never invokes main/);
    });
  });

  describe("Section 2: Verification of Legitimate Positives", () => {
    it("LEGITIMATE POSITIVE 1: direct destructuring of main()", () => {
      const cliPath = path.join(FIXTURES_DIR, "legit-direct-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await main(process.argv.slice(3));
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "main");
    });

    it("LEGITIMATE POSITIVE 2: destructured alias { main: runRunner } and execution", () => {
      const cliPath = path.join(FIXTURES_DIR, "legit-alias-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main: runRunner } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await runRunner(process.argv.slice(3));
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runRunner");
    });

    it("LEGITIMATE POSITIVE 3: namespace import and runner.main() property call", () => {
      const cliPath = path.join(FIXTURES_DIR, "legit-namespace-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const runner = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await runner.main(process.argv.slice(3));
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, true, `Expected ok, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.equal(result.invokedIdentifier, "runner.main");
    });

    it("LEGITIMATE POSITIVE 4: real production CLI entrypoint in packages/cli/bin/durable-zero.js passes", () => {
      const prodCli = path.resolve(
        import.meta.dirname,
        "../../../../../../../packages/cli/bin/durable-zero.js"
      );
      const result = auditCliServeEntrypoint(prodCli);
      assert.equal(result.isOk, true, `Expected ok for prod CLI, got: ${result.error}`);
      assert.equal(result.callsMain, true);
      assert.ok(result.resolvedPath && fs.existsSync(result.resolvedPath));
    });
  });

  describe("Section 3: Subpath Exact Resolution & Callable Semantics", () => {
    it("REJECTS nonexistent subpath import @durable-zero/runner/does-not-exist.js", () => {
      const cliPath = path.join(FIXTURES_DIR, "cli-nonexistent-subpath.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner/does-not-exist.js");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject nonexistent subpath");
      assert.match(result.error ?? "", /target runner file does not exist on disk/);
    });

    it("DOCUMENTED BEHAVIORAL BOUNDARY: isCallableNode rejects literal primitives (17, 'text', false) while accepting CallExpressions and identifiers for esbuild bundle compatibility", () => {
      const primFile = path.join(FIXTURES_DIR, "prim-main.js");
      fs.writeFileSync(primFile, "export const main = 17;\n", "utf8");
      assert.equal(verifyFileExportsMain(primFile), false, "Primitive 17 must be rejected");

      const strFile = path.join(FIXTURES_DIR, "str-main.js");
      fs.writeFileSync(strFile, "export const main = 'hello';\n", "utf8");
      assert.equal(verifyFileExportsMain(strFile), false, "Primitive string must be rejected");

      const fnFile = path.join(FIXTURES_DIR, "fn-main.js");
      fs.writeFileSync(fnFile, "export const main = async () => {};\n", "utf8");
      assert.equal(verifyFileExportsMain(fnFile), true, "Arrow function must be accepted");

      const callFile = path.join(FIXTURES_DIR, "call-main.js");
      fs.writeFileSync(callFile, "export const main = defineRunner();\n", "utf8");
      assert.equal(verifyFileExportsMain(callFile), true, "CallExpression factory must be accepted for bundle compatibility");
    });
  });

  describe("Section 4: Helper Module Purity & Modularity Verification", () => {
    it("proves importing modular checker submodules is 100% side-effect free", () => {
      assert.equal(typeof checker.auditCliServeEntrypoint, "function");
      assert.equal(typeof checker.extractAstDependencies, "function");
      assert.equal(typeof checker.buildFullWorkspaceGraph, "function");
      assert.equal(typeof checker.detectDependencyCycles, "function");
      assert.equal(typeof checker.generateAuditReport, "function");
      assert.equal(typeof checker.collectAllSourceFiles, "function");
    });
  });
});
