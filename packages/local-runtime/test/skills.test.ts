import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandSkillCommand } from "../src/skills.ts";

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "zero-skill-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "SKILL.md");
  await writeFile(filePath, "---\nname: example\ndescription: A test skill\n---\nFollow the example instructions.\n");
  return { name: "example", description: "A test skill", baseDir: directory, filePath, source: "test", disableModelInvocation: false };
}

test("skill command uses the existing catalogue and preserves arguments", async t => {
  const skill = await fixture(t);
  const result = await expandSkillCommand("/skill:example explain this\nwith details", [skill]);
  assert.match(result, /^<skill name="example" location="/);
  assert.ok(result.includes(`References are relative to ${skill.baseDir}.`));
  assert.ok(result.includes("Follow the example instructions."));
  assert.ok(!result.includes("description: A test skill"));
  assert.ok(result.endsWith("</skill>\n\nexplain this\nwith details"));
});

test("ordinary input is unchanged and does not load files", async () => {
  assert.equal(await expandSkillCommand("  original input\n", []), "  original input\n");
});

test("unknown, malformed and unreadable skills reject before admission", async t => {
  const skill = await fixture(t);
  await assert.rejects(expandSkillCommand("/skill:unknown", [skill]), /Unknown skill/);
  await assert.rejects(expandSkillCommand("/skill:", [skill]), /requires a skill name/);
  await rm(skill.filePath);
  await assert.rejects(expandSkillCommand("/skill:example", [skill]), /ENOENT/);
});

test("skill commands accept picker whitespace and no arguments", async t => {
  const skill = await fixture(t);
  const result = await expandSkillCommand("  /skill:example \n", [skill]);
  assert.ok(result.endsWith("</skill>"));
});
