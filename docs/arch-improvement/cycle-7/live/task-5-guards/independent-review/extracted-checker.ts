import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";

// ============================================================================
// Types & Domain Boundary Contracts
// ============================================================================

export type ImportKind =
  | "static-import"
  | "type-import"
  | "export-reexport"
  | "import-type"
  | "dynamic-import";

export interface ExtractedDependency {
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line: number;
  readonly character: number;
  readonly rawText: string;
}

export interface BoundaryViolation {
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly rule: string;
  readonly severity: "P0" | "P1" | "P2";
  readonly message: string;
}

export const FORBIDDEN_NODE_IO_MODULES = new Set<string>([
  "node:fs",
  "fs",
  "node:fs/promises",
  "fs/promises",
  "node:child_process",
  "child_process",
  "node:net",
  "net",
  "node:http",
  "http",
  "node:https",
  "https",
  "node:http2",
  "http2",
  "node:dgram",
  "dgram",
  "node:cluster",
  "cluster",
  "node:worker_threads",
  "worker_threads",
  "node:v8",
  "v8",
  "node:vm",
  "vm",
]);

export const ALLOWED_CORE_EXTERNAL_PACKAGES = new Set<string>([
  "@durable-zero/contracts",
  "zod",
]);

// ============================================================================
// TypeScript AST Analysis Engine
// ============================================================================

export function extractAstDependencies(
  filePath: string,
  sourceText?: string
): ExtractedDependency[] {
  const content = sourceText ?? fs.readFileSync(filePath, "utf8");
  const isTs = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  const results: ExtractedDependency[] = [];

  function record(specifier: string, kind: ImportKind, node: ts.Node) {
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    results.push({
      specifier,
      kind,
      line: pos.line + 1,
      character: pos.character + 1,
      rawText: node.getText(sf),
    });
  }

  function visit(node: ts.Node) {
    // 1. Static imports: `import ... from "mod"`
    if (ts.isImportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const isType = Boolean(node.importClause?.isTypeOnly);
        record(
          node.moduleSpecifier.text,
          isType ? "type-import" : "static-import",
          node
        );
      }
    }
    // 2. Static re-exports: `export * from "mod"`, `export { x } from "mod"`
    else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        record(node.moduleSpecifier.text, "export-reexport", node);
      }
    }
    // 3. TypeScript type import: `type T = import("mod").Type`
    else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) {
        record(arg.literal.text, "import-type", node);
      }
    }
    // 4. Dynamic import call: `import("mod")`
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      if (node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        record(node.arguments[0].text, "dynamic-import", node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return results;
}

export function auditCoreFileBoundaries(
  filePath: string,
  coreSrcRoot: string,
  sourceText?: string
): BoundaryViolation[] {
  const deps = extractAstDependencies(filePath, sourceText);
  const violations: BoundaryViolation[] = [];

  for (const dep of deps) {
    const spec = dep.specifier;

    // Rule AP-010 / AP-020: Forbidden vendor imports
    if (spec.startsWith("@earendil-works/")) {
      violations.push({
        file: filePath,
        line: dep.line,
        character: dep.character,
        specifier: spec,
        kind: dep.kind,
        rule: "AP-010",
        severity: "P0",
        message: `Forbidden vendor dependency in Core: "${spec}". All vendor packages must live strictly in adapters.`,
      });
      continue;
    }

    // Rule AP-010 / AP-020: Forbidden adapter imports
    if (spec.startsWith("@durable-zero/adapter-")) {
      violations.push({
        file: filePath,
        line: dep.line,
        character: dep.character,
        specifier: spec,
        kind: dep.kind,
        rule: "AP-020",
        severity: "P0",
        message: `Inverted dependency: Core must never depend on adapter "${spec}". Adapters implement Core SPI ports.`,
      });
      continue;
    }

    // Rule AP-020: Forbidden runner imports
    if (
      spec === "@durable-zero/runner" ||
      spec.startsWith("@durable-zero/runner/")
    ) {
      violations.push({
        file: filePath,
        line: dep.line,
        character: dep.character,
        specifier: spec,
        kind: dep.kind,
        rule: "AP-020",
        severity: "P0",
        message: `Inverted dependency: Core must never depend on composition root "${spec}".`,
      });
      continue;
    }

    // Rule AP-020: Forbidden CLI imports
    if (spec === "@durable-zero/cli" || spec === "durable-zero") {
      violations.push({
        file: filePath,
        line: dep.line,
        character: dep.character,
        specifier: spec,
        kind: dep.kind,
        rule: "AP-020",
        severity: "P0",
        message: `Inverted dependency: Core must never depend on CLI "${spec}".`,
      });
      continue;
    }

    // Rule AP-012 / AP-074: Forbidden concrete Node I/O
    if (FORBIDDEN_NODE_IO_MODULES.has(spec)) {
      violations.push({
        file: filePath,
        line: dep.line,
        character: dep.character,
        specifier: spec,
        kind: dep.kind,
        rule: "AP-012",
        severity: "P1",
        message: `Forbidden concrete Node I/O import in pure domain Core: "${spec}". I/O must be inverted via domain ports.`,
      });
      continue;
    }

    // Relative escape check: if relative, verify it stays within coreSrcRoot
    if (spec.startsWith("./") || spec.startsWith("../")) {
      const resolved = path.resolve(path.dirname(filePath), spec);
      const relToSrc = path.relative(coreSrcRoot, resolved);
      if (relToSrc.startsWith("..") || path.isAbsolute(relToSrc)) {
        violations.push({
          file: filePath,
          line: dep.line,
          character: dep.character,
          specifier: spec,
          kind: dep.kind,
          rule: "AP-025",
          severity: "P0",
          message: `Relative import escapes core source root into foreign path: "${spec}" -> "${resolved}".`,
        });
      }
      continue;
    }

    // Non-relative imports: verify they belong to allowed core external dependencies
    if (!ALLOWED_CORE_EXTERNAL_PACKAGES.has(spec)) {
      const isSubpath = [...ALLOWED_CORE_EXTERNAL_PACKAGES].some((allowed) =>
        spec.startsWith(`${allowed}/`)
      );
      if (!isSubpath) {
        violations.push({
          file: filePath,
          line: dep.line,
          character: dep.character,
          specifier: spec,
          kind: dep.kind,
          rule: "AP-025",
          severity: "P1",
          message: `Disallowed external dependency in pure domain Core: "${spec}". Only contracts and zod are permitted.`,
        });
      }
    }
  }

  return violations;
}

export function auditPackageJsonDependencies(
  packageJsonPath: string
): BoundaryViolation[] {
  const content = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(content);
  const violations: BoundaryViolation[] = [];

  const prodDeps = Object.keys(pkg.dependencies || {});
  for (const dep of prodDeps) {
    if (!ALLOWED_CORE_EXTERNAL_PACKAGES.has(dep)) {
      violations.push({
        file: packageJsonPath,
        line: 1,
        character: 1,
        specifier: dep,
        kind: "static-import",
        rule: "AP-025",
        severity: "P0",
        message: `Core package.json declares forbidden production dependency "${dep}". Core dependencies must contain only contracts and zod.`,
      });
    }
  }

  return violations;
}

export function auditCliServeEntrypoint(
  cliScriptPath: string
): { isOk: boolean; targetImport?: string; error?: string } {
  if (!fs.existsSync(cliScriptPath)) {
    return {
      isOk: false,
      error: `CLI entry script not found: ${cliScriptPath}`,
    };
  }

  const content = fs.readFileSync(cliScriptPath, "utf8");
  const sf = ts.createSourceFile(
    cliScriptPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

  let serveImportTarget: string | undefined;
  let callsMain = false;

  function visit(node: ts.Node) {
    if (ts.isIfStatement(node)) {
      const condText = node.expression.getText(sf);
      if (condText.includes('"serve"') || condText.includes("'serve'")) {
        node.thenStatement.forEachChild((inner) => {
          if (
            ts.isVariableStatement(inner) ||
            ts.isExpressionStatement(inner)
          ) {
            const innerText = inner.getText(sf);
            const match = innerText.match(/import\s*\(\s*["']([^"']+)["']\s*\)/);
            if (match) {
              serveImportTarget = match[1];
            }
            if (innerText.includes("main(") || innerText.includes("runRunner(")) {
              callsMain = true;
            }
          }
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);

  if (!serveImportTarget) {
    return {
      isOk: false,
      error: `CLI script does not handle "serve" command with dynamic import in AST.`,
    };
  }

  if (
    serveImportTarget.includes("runner-server") ||
    serveImportTarget.includes("core/dist/runner") ||
    serveImportTarget.includes("core/src/runner")
  ) {
    return {
      isOk: false,
      targetImport: serveImportTarget,
      error: `Legacy entrypoint detected: CLI "serve" imports deleted core runner "${serveImportTarget}". Must resolve to runner package.`,
    };
  }

  if (
    !serveImportTarget.includes("runner") ||
    (!serveImportTarget.endsWith("main.js") &&
      !serveImportTarget.endsWith("main.ts") &&
      serveImportTarget !== "@durable-zero/runner")
  ) {
    return {
      isOk: false,
      targetImport: serveImportTarget,
      error: `CLI "serve" imports "${serveImportTarget}" which does not resolve to the runner main entry point.`,
    };
  }

  return { isOk: true, targetImport: serveImportTarget };
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
  graph: Map<string, string[]>
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
        violations.push({
          file: pkg,
          line: 1,
          character: 1,
          specifier: dep,
          kind: "static-import",
          rule: "AP-020",
          severity: "P0",
          message: `Clean Architecture violation: Core (tier ${pkgTier}) must only depend on Contracts (tier 0), but depends on "${dep}" (tier ${depTier}).`,
        });
      } else if (pkg.startsWith("@durable-zero/adapter-") && depTier >= 4) {
        violations.push({
          file: pkg,
          line: 1,
          character: 1,
          specifier: dep,
          kind: "static-import",
          rule: "AP-020",
          severity: "P0",
          message: `Inverted dependency: Adapter "${pkg}" must not depend on Composition Root "${dep}".`,
        });
      }
    }
  }

  return violations;
}

export function collectAllSourceFiles(dir: string, ext = ".ts"): string[] {
  let list: string[] = [];
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(collectAllSourceFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      list.push(full);
    }
  }
  return list;
}

export function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ============================================================================
