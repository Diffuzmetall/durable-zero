import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as checker from "../../../../../../../packages/core/test/architecture-boundaries-checker.ts";

const FOCUSED_FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "focused-probes"
);

function setupFixtures() {
  fs.mkdirSync(FOCUSED_FIXTURES_DIR, { recursive: true });
}

describe("Focused Adversarial Counterexamples against Frozen 2d0 Checker", () => {
  setupFixtures();

  const realRunnerRel = path.relative(
    FOCUSED_FIXTURES_DIR,
    path.resolve(import.meta.dirname, "../../../../../../../packages/runner/dist/main.js")
  );

  it("COUNTEREXAMPLE 1 (FALSE GREEN PROVEN): import real runner as unusedModule + call unrelated local main() falsely passes", () => {
    const cliPath = path.join(FOCUSED_FIXTURES_DIR, "unrelated-local-main-cli.js");
    fs.writeFileSync(
      cliPath,
      `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  // Imports runner as unusedModule, never invokes it:
  const unusedModule = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  
  // Unrelated local function named main:
  function main() {
    console.log("Unrelated local main invoked, runner is bypassed!");
  }
  main();
}
`,
      "utf8"
    );

    const result = checker.auditCliServeEntrypoint(cliPath);

    // In architecture-boundaries-checker.ts lines 499-514:
    // `if (callee === importedBinding || callee === "main" || callee === "runRunner")`
    // Because `callee === "main"` is hardcoded as an OR branch, calling local `main()` sets callsMain = true
    // even though importedBinding is "unusedModule" and runner is never called!
    assert.equal(
      result.isOk,
      true,
      "FLAW PROVEN: Checker accepted CLI entrypoint where real runner was unused and unrelated local main() was called!"
    );
    assert.equal(result.callsMain, true);
    assert.equal(result.invokedIdentifier, "main");
  });

  it("COUNTEREXAMPLE 2 (FALSE GREEN PROVEN): target file under runner package with NO exported main falsely passes", () => {
    // Create a mock runner file that does NOT export main
    const mockRunnerDir = path.join(FOCUSED_FIXTURES_DIR, "mock-runner-pkg");
    fs.mkdirSync(mockRunnerDir, { recursive: true });
    const noMainTarget = path.join(mockRunnerDir, "no-main-target.js");
    fs.writeFileSync(
      noMainTarget,
      `// This file has NO main export at all:
export const dummyHelper = () => "no main here";
`,
      "utf8"
    );

    const cliPath = path.join(FOCUSED_FIXTURES_DIR, "import-no-main-target-cli.js");
    const relToNoMain = path.relative(FOCUSED_FIXTURES_DIR, noMainTarget);
    fs.writeFileSync(
      cliPath,
      `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  // Target exists and contains "runner" in path, but exports no main:
  const { main } = await import("${relToNoMain.startsWith(".") ? relToNoMain : `./${relToNoMain}`}");
  await main();
}
`,
      "utf8"
    );

    const result = checker.auditCliServeEntrypoint(cliPath);

    // Checker checks fs.existsSync(resolvedPath) and resolvedPath.includes("runner"),
    // but NEVER inspects the target file's AST or exports for an exported `main`!
    assert.equal(
      result.isOk,
      true,
      "FLAW PROVEN: Checker accepted target file with no exported main because it only verified file existence!"
    );
    assert.equal(result.callsMain, true);
  });

  it("COUNTEREXAMPLE 3 (FALSE GREEN PROVEN): wrong package whose directory name merely contains 'runner' falsely passes package check", () => {
    // Create a directory outside packages/runner whose name contains the substring "runner"
    const trapDir = path.join(FOCUSED_FIXTURES_DIR, "fake-runner-exploit/dist");
    fs.mkdirSync(trapDir, { recursive: true });
    const trapMain = path.join(trapDir, "main.js");
    fs.writeFileSync(
      trapMain,
      `export function main() { console.log("exploit payload"); }`,
      "utf8"
    );

    const cliPath = path.join(FOCUSED_FIXTURES_DIR, "runner-trap-cli.js");
    const relToTrap = path.relative(FOCUSED_FIXTURES_DIR, trapMain);
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

    const result = checker.auditCliServeEntrypoint(cliPath);

    // In architecture-boundaries-checker.ts lines 619-627:
    // `if (!resolvedPath.includes("runner"))`
    // Because resolvedPath contains the substring "runner", it treats fake-runner-exploit as the real runner!
    assert.equal(
      result.isOk,
      true,
      "FLAW PROVEN: Checker used substring search .includes('runner') instead of verifying packages/runner package membership!"
    );
  });

  it("GENUINE POSITIVE: legitimately accepts authentic runner import and main invocation", () => {
    const validCliPath = path.join(FOCUSED_FIXTURES_DIR, "legitimate-cli.js");
    fs.writeFileSync(
      validCliPath,
      `#!/usr/bin/env node
const command = process.argv[2];
if (command === "serve") {
  const { main } = await import("${realRunnerRel.startsWith(".") ? realRunnerRel : `./${realRunnerRel}`}");
  await main(process.argv.slice(3));
}
`,
      "utf8"
    );

    const result = checker.auditCliServeEntrypoint(validCliPath);
    assert.equal(result.isOk, true);
    assert.equal(result.callsMain, true);
    assert.equal(result.invokedIdentifier, "main");
  });
});
