import { readFile } from "node:fs/promises";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";

export interface SkillResource {
  readonly name: string;
  readonly filePath: string;
  readonly baseDir: string;
}

/** Translate a terminal command using the assembly's already-loaded resource catalogue. */
export async function expandSkillCommand(content: string, skills: readonly SkillResource[]): Promise<string> {
  if (!content.trimStart().startsWith("/skill:")) return content;
  const match = /^\s*\/skill:([^\s]+)(?:\s+([\s\S]*))?$/.exec(content);
  if (!match) throw new Error("/skill: requires a skill name");
  const skill = skills.find(item => item.name === match[1]);
  if (!skill) throw new Error(`Unknown skill: ${match[1]}`);
  const body = stripFrontmatter(await readFile(skill.filePath, "utf8")).trim();
  const attribute = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const block = `<skill name="${attribute(skill.name)}" location="${attribute(skill.filePath)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
  const args = match[2]?.trim();
  return args ? `${block}\n\n${args}` : block;
}
