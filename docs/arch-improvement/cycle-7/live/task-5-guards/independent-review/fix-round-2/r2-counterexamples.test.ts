import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as checker from "../../../../../../../packages/core/test/architecture-boundaries-checker.ts";
import { auditCliServeEntrypoint } from "../../../../../../../packages/core/test/architecture-boundaries-cli.ts";
import { verifyFileExportsMain } from "../../../../../../../packages/core/test/architecture-boundaries-runner-verify.ts";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "r2-fixtures"
);

function setupFixtures() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

describe("Task 5A Fix Round 2: Independent Adversarial Probes & Invariant Verification", () => {
  setupFixtures();

  const realRunnerRel = path.relative(
    FIXTURES_DIR,
    path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
  );

  describe("Section 1: Verification of Former Round 1 Blockers (Now Properly Rejected)", () => {
    it("FORMER BYPASS 1 REJECTED: unrelated local main() function declaration is rejected", () => {
      const cliPath = path.join(FIXTURES_DIR, "former-bypass-local-main.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const unusedRunner = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  function main() { console.log("unrelated local main"); }
  main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject unrelated local main");
      assert.equal(result.callsMain, false);
      assert.match(result.error ?? "", /Hollow implementation/);
    });

    it("FORMER BYPASS 2 REJECTED: target file with NO exported main is rejected", () => {
      const noMainTarget = path.join(FIXTURES_DIR, "no-main-module.js");
      fs.writeFileSync(
        noMainTarget,
        `export const notMain = () => {};`,
        "utf8"
      );
      const cliPath = path.join(FIXTURES_DIR, "former-bypass-no-main-target.js");
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("./no-main-module.js");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject target with no exported main");
      assert.match(result.error ?? "", /not in @durable-zero\/runner package|exports no main/);
    });

    it("FORMER BYPASS 3 REJECTED: directory merely containing 'runner' in name is rejected via package.json check", () => {
      const trapDir = path.join(FIXTURES_DIR, "fake-runner-pkg");
      fs.mkdirSync(trapDir, { recursive: true });
      fs.writeFileSync(
        path.join(trapDir, "package.json"),
        JSON.stringify({ name: "fake-runner-pkg" }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(trapDir, "main.js"),
        `export function main() {}`,
        "utf8"
      );

      const cliPath = path.join(FIXTURES_DIR, "former-bypass-trap-dir.js");
      const relToTrap = path.relative(FIXTURES_DIR, path.join(trapDir, "main.js"));
      fs.writeFileSync(
        cliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${relToTrap.startsWith(".") ? relToTrap : `./${relToTrap}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(cliPath);
      assert.equal(result.isOk, false, "Must reject foreign package even if path contains 'runner'");
      assert.match(result.error ?? "", /not in @durable-zero\/runner package/);
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

    it("LEGITIMATE POSITIVE 2: destructured alias { main: runRunner } and invocation", () => {
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
  });

  describe("Section 3: Probing Suspicious Paths & Edge Cases from Critical Review", () => {
    it("PROBE 1 (CONFIRMED FLAW): export const main = 17 (non-callable constant) passes verifyFileExportsMain", () => {
      const nonCallableFile = path.join(FIXTURES_DIR, "non-callable-main.js");
      fs.writeFileSync(
        nonCallableFile,
        `export const main = 17;\n`,
        "utf8"
      );

      const exportsMain = verifyFileExportsMain(nonCallableFile);
      // In architecture-boundaries-runner-verify.ts lines 48-56:
      // It checks only if an exported variable is named "main", without verifying it is a function or function expression!
      assert.equal(
        exportsMain,
        true,
        "FLAW CONFIRMED: verifyFileExportsMain returns true for non-callable export const main = 17"
      );
    });

    it("PROBE 2 (CONFIRMED FLAW): inverted condition if (command !== 'serve') is recognized as serve branch", () => {
      const invertedCondCliPath = path.join(FIXTURES_DIR, "inverted-condition-cli.js");
      fs.writeFileSync(
        invertedCondCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command !== "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(invertedCondCliPath);
      // In architecture-boundaries-cli.ts lines 170-176:
      // `condText.includes("command") && condText.includes('"serve"')`
      // Matches even when operator is !== !
      assert.equal(
        result.isOk,
        true,
        "FLAW CONFIRMED: condText string search matched if (command !== 'serve')"
      );
    });

    it("PROBE 3 (CONFIRMED FLAW): bare specifier '@durable-zero/runner-fake' substitutes real sibling main.js", () => {
      // Create a mock CLI package structure where scriptDir is packages/mock-cli/bin
      const mockCliBinDir = path.join(FIXTURES_DIR, "packages/mock-cli/bin");
      const mockRunnerDistDir = path.join(FIXTURES_DIR, "packages/runner/dist");
      fs.mkdirSync(mockCliBinDir, { recursive: true });
      fs.mkdirSync(mockRunnerDistDir, { recursive: true });

      // Create a real main.js in sibling runner package so it exists:
      fs.writeFileSync(
        path.join(FIXTURES_DIR, "packages/runner/package.json"),
        JSON.stringify({ name: "@durable-zero/runner" }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(mockRunnerDistDir, "main.js"),
        `export function main() {}`,
        "utf8"
      );

      const fakeSubpathCliPath = path.join(mockCliBinDir, "cli.js");
      fs.writeFileSync(
        fakeSubpathCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("@durable-zero/runner-fake-package");
  await main();
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(fakeSubpathCliPath);
      // In architecture-boundaries-cli.ts lines 201-207:
      // `if (targetImport.startsWith("@durable-zero/runner"))` matches `@durable-zero/runner-fake-package`
      // and substitutes `../../runner/dist/main.js`!
      assert.equal(
        result.isOk,
        true,
        "FLAW CONFIRMED: startsWith('@durable-zero/runner') substitutes real runner for fake package!"
      );
      assert.equal(result.targetImport, "@durable-zero/runner-fake-package");
      assert.ok(result.resolvedPath?.endsWith("packages/runner/dist/main.js"));
    });

    it("PROBE 4 (CONFIRMED FLAW): main() call hidden inside never-invoked nested function satisfies callsMain", () => {
      const nestedFuncCliPath = path.join(FIXTURES_DIR, "never-invoked-nested-cli.js");
      fs.writeFileSync(
        nestedFuncCliPath,
        `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  function unusedBackgroundHelper() {
    main(); // Inside an uninvoked function!
  }
  // The serve branch exits without invoking anything!
}
`,
        "utf8"
      );

      const result = auditCliServeEntrypoint(nestedFuncCliPath);
      // In architecture-boundaries-cli.ts lines 132-156:
      // scanInvocations walks the entire AST subtree recursively into function bodies!
      assert.equal(
        result.isOk,
        true,
        "FLAW CONFIRMED: main() inside an uninvoked nested function satisfies callsMain"
      );
    });
  });

  describe("Section 4: Helper Module Purity & Side-Effect Free Import", () => {
    it("proves importing modular checker submodules does not write reports or execute tests", () => {
      assert.equal(typeof checker.auditCliServeEntrypoint, "function");
      assert.equal(typeof checker.extractAstDependencies, "function");
      assert.equal(typeof checker.buildFullWorkspaceGraph, "function");
      assert.equal(typeof checker.generateAuditReport, "function");
    });
  });
});
