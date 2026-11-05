import fs from "node:fs";
import path from "node:path";
import {
  collectAllSourceFiles,
  extractAstDependencies,
  type BoundaryViolation,
  type EdgeProvenance,
  type ImportKind,
} from "./architecture-boundaries-ast.ts";

export function buildFullWorkspaceGraph(workspaceRoot: string): {
  graph: Map<string, string[]>;
  edges: EdgeProvenance[];
  packageNames: string[];
} {
  const packagesDir = path.resolve(workspaceRoot, "packages");
  const pkgDirs = fs.existsSync(packagesDir) ? fs.readdirSync(packagesDir) : [];

  const packageMap = new Map<string, { dir: string; name: string }>();
  const dirToPkgMap = new Map<string, string>();
  const graph = new Map<string, Set<string>>();
  const edges: EdgeProvenance[] = [];

  for (const d of pkgDirs) {
    const pkgJsonPath = path.join(packagesDir, d, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        const name = pkgJson.name;
        const dir = path.join(packagesDir, d);
        packageMap.set(name, { dir, name });
        dirToPkgMap.set(dir, name);
        graph.set(name, new Set());

        const allDeps = {
          ...(pkgJson.dependencies || {}),
          ...(pkgJson.peerDependencies || {}),
        };
        for (const dep of Object.keys(allDeps)) {
          if (dep.startsWith("@durable-zero/") || dep === "durable-zero") {
            graph.get(name)!.add(dep);
            edges.push({
              fromPackage: name,
              toPackage: dep,
              kind: "manifest",
              sourceFile: path.relative(workspaceRoot, pkgJsonPath),
              specifier: dep,
            });
          }
        }
      } catch {
        // Skip malformed packages
      }
    }
  }

  for (const [pkgName, pkgInfo] of packageMap.entries()) {
    const srcDir = path.join(pkgInfo.dir, "src");
    const binDir = path.join(pkgInfo.dir, "bin");
    const allFiles = [
      ...collectAllSourceFiles(srcDir),
      ...collectAllSourceFiles(binDir),
    ];

    for (const file of allFiles) {
      const relFile = path.relative(workspaceRoot, file);
      const deps = extractAstDependencies(file);

      for (const dep of deps) {
        const spec = dep.specifier;

        if (spec.startsWith("@durable-zero/") || spec === "durable-zero") {
          const basePkg = spec.startsWith("@durable-zero/")
            ? spec.split("/").slice(0, 2).join("/")
            : spec;

          if (basePkg !== pkgName && packageMap.has(basePkg)) {
            graph.get(pkgName)!.add(basePkg);
            edges.push({
              fromPackage: pkgName,
              toPackage: basePkg,
              kind:
                dep.kind === "export-reexport"
                  ? "export-reexport"
                  : dep.kind === "dynamic-import"
                    ? "dynamic-import"
                    : "source-import",
              sourceFile: relFile,
              line: dep.line,
              specifier: spec,
            });
          }
        } else if (spec.startsWith("./") || spec.startsWith("../")) {
          const resolved = path.resolve(path.dirname(file), spec);
          for (const [otherDir, otherPkgName] of dirToPkgMap.entries()) {
            if (otherPkgName !== pkgName && resolved.startsWith(otherDir)) {
              graph.get(pkgName)!.add(otherPkgName);
              edges.push({
                fromPackage: pkgName,
                toPackage: otherPkgName,
                kind: "relative-cross-package",
                sourceFile: relFile,
                line: dep.line,
                specifier: spec,
              });
              break;
            }
          }
        }
      }
    }
  }

  const finalGraph = new Map<string, string[]>();
  for (const [pkg, depSet] of graph.entries()) {
    finalGraph.set(pkg, Array.from(depSet).sort());
  }

  return {
    graph: finalGraph,
    edges,
    packageNames: Array.from(packageMap.keys()).sort(),
  };
}

export function detectDependencyCycles(
  graph: Map<string, string[]>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(current: string, currentPath: string[]) {
    visited.add(current);
    recStack.add(current);

    const neighbors = graph.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...currentPath, neighbor]);
      } else if (recStack.has(neighbor)) {
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          cycles.push([...currentPath.slice(cycleStartIndex), neighbor]);
        } else {
          cycles.push([current, neighbor]);
        }
      }
    }

    recStack.delete(current);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

export function verifyPackageLayering(
  graph: Map<string, string[]>,
  edges: EdgeProvenance[] = []
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  const packageTiers: Record<string, number> = {
    "@durable-zero/contracts": 0,
    "@durable-zero/core": 1,
    "@durable-zero/execution": 1,
    "@durable-zero/protocol": 1,
    "@durable-zero/adapter-pi-durable": 2,
    "@durable-zero/adapter-pi-ai": 2,
    "@durable-zero/adapter-codemode": 3,
    "@durable-zero/extension-pi-resource": 3,
    "@durable-zero/runner": 4,
    "durable-zero": 5,
  };

  for (const [pkg, deps] of graph.entries()) {
    const pkgTier = packageTiers[pkg];
    if (pkgTier === undefined) continue;

    for (const dep of deps) {
      const depTier = packageTiers[dep];
      if (depTier === undefined) continue;

      if (pkg === "@durable-zero/core" && depTier > 0) {
        const edge = edges.find(
          (e) => e.fromPackage === pkg && e.toPackage === dep
        );
        violations.push({
          file: edge?.sourceFile ?? pkg,
          line: edge?.line ?? 1,
          character: 1,
          specifier: dep,
          kind: (edge?.kind as ImportKind) ?? "static-import",
          rule: "AP-020",
          severity: "P0",
          message: `Clean Architecture violation: Core (tier ${pkgTier}) must only depend on Contracts (tier 0), but depends on "${dep}" (tier ${depTier}).`,
        });
      } else if (pkg.startsWith("@durable-zero/adapter-") && depTier >= 4) {
        const edge = edges.find(
          (e) => e.fromPackage === pkg && e.toPackage === dep
        );
        violations.push({
          file: edge?.sourceFile ?? pkg,
          line: edge?.line ?? 1,
          character: 1,
          specifier: dep,
          kind: (edge?.kind as ImportKind) ?? "static-import",
          rule: "AP-020",
          severity: "P0",
          message: `Inverted dependency: Adapter "${pkg}" must not depend on Composition Root "${dep}".`,
        });
      } else if (pkg === "@durable-zero/contracts" && depTier > 0) {
        const edge = edges.find(
          (e) => e.fromPackage === pkg && e.toPackage === dep
        );
        violations.push({
          file: edge?.sourceFile ?? pkg,
          line: edge?.line ?? 1,
          character: 1,
          specifier: dep,
          kind: (edge?.kind as ImportKind) ?? "static-import",
          rule: "AP-020",
          severity: "P0",
          message: `Contracts package (tier 0) must never depend on higher tier package "${dep}".`,
        });
      }
    }
  }

  return violations;
}
