#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Build the current Zero and local sources in a new directory; preserve committed workspace dist files.
const root = resolve(import.meta.dirname, "../../..");
if (!process.argv[2]) throw new Error("Usage: node packages/local-runtime/scripts/build-candidate.mjs NEW_DIRECTORY");
const target = resolve(process.argv[2]);
if (target === root || target.startsWith(`${root}/`)) throw new Error("Use a new candidate directory outside the source workspace.");
await mkdir(target, { mode: 0o700 });
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.src.json", "LICENSE"]) {
  await cp(join(root, file), join(target, file));
}
await mkdir(join(target, "scripts"));
await cp(join(root, "scripts/build.mjs"), join(target, "scripts/build.mjs"));
await cp(join(root, "packages"), join(target, "packages"), {
  recursive: true,
  filter: (path) => !["node_modules", "dist"].includes(path.split("/").at(-1)),
});
await mkdir(join(target, "node_modules"));
for (const item of await readdir(join(root, "node_modules"))) {
  if (item === "@durable-zero" || item === "@local-durable") continue;
  await symlink(join(root, "node_modules", item), join(target, "node_modules", item));
}
for (const dir of await readdir(join(target, "packages"))) {
  const pkg = JSON.parse(await readFile(join(target, "packages", dir, "package.json"), "utf8"));
  const link = join(target, "node_modules", pkg.name);
  await mkdir(dirname(link), { recursive: true });
  await symlink(join(target, "packages", dir), link);
  // Keep each package's installed dependency versions (notably the reused UI's Pi TUI 1.4).
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) {
    const dependency = version.startsWith("workspace:")
      ? join(target, "node_modules", name)
      : join(root, "packages", dir, "node_modules", name);
    const localLink = join(target, "packages", dir, "node_modules", name);
    await mkdir(dirname(localLink), { recursive: true });
    await symlink(dependency, localLink);
  }
}
function run(args, cwd = target) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Candidate build failed (exit ${result.status}): ${args.join(" ")}`);
}
run(["scripts/build.mjs"]);
for (const [pkg, entries] of [
  ["local-runtime", ["src/index.ts", "src/client.ts", "src/main.ts", "src/sessions.ts"]],
  ["local-terminal", ["src/main.ts", "src/probe.ts", "src/client.ts", "src/launch.ts"]],
]) {
  run([join(root, "node_modules/esbuild/bin/esbuild"), ...entries, "--bundle", "--packages=external", "--platform=node", "--target=node24", "--format=esm", "--outdir=dist"], join(target, "packages", pkg));
}
run(["scripts/check-artifact.mjs"], join(target, "packages/terminal-ui"));
run([join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.src.json", "--pretty", "false"]);
console.log(`Candidate built: ${target}\nDependencies link to the source workspace. This is an isolated test candidate, not a standalone installation.`);
