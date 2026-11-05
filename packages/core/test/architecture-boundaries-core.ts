import fs from "node:fs";
import path from "node:path";
import {
  extractAstDependencies,
  type BoundaryViolation,
  FORBIDDEN_NODE_IO_MODULES,
  ALLOWED_CORE_EXTERNAL_PACKAGES,
} from "./architecture-boundaries-ast.ts";

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
