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
  | "dynamic-import"
  | "import-equals";

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
  readonly severity: "P0" | "P1" | "P2" | "P3";
  readonly message: string;
}

export interface EdgeProvenance {
  readonly fromPackage: string;
  readonly toPackage: string;
  readonly kind:
    | "manifest"
    | "source-import"
    | "export-reexport"
    | "dynamic-import"
    | "relative-cross-package";
  readonly sourceFile: string;
  readonly line?: number;
  readonly specifier?: string;
}

export interface CliServeAuditResult {
  readonly isOk: boolean;
  readonly targetImport?: string;
  readonly resolvedPath?: string;
  readonly callsMain: boolean;
  readonly invokedIdentifier?: string;
  readonly error?: string;
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

export const SUPPORTED_SOURCE_EXTENSIONS = new Set<string>([
  ".ts",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".tsx",
  ".jsx",
]);

// ============================================================================
// File Discovery & Cryptography
// ============================================================================

export function collectAllSourceFiles(
  dir: string,
  allowedExtensions: Set<string> = SUPPORTED_SOURCE_EXTENSIONS
): string[] {
  let list: string[] = [];
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(collectAllSourceFiles(full, allowedExtensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(ext)) {
        list.push(full);
      }
    }
  }
  return list.sort();
}

export function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ============================================================================
// TypeScript AST Analysis Engine
// ============================================================================

export function extractAstDependencies(
  filePath: string,
  sourceText?: string
): ExtractedDependency[] {
  const content = sourceText ?? fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const scriptKind =
    ext === ".tsx"
      ? ts.ScriptKind.TSX
      : ext === ".jsx"
        ? ts.ScriptKind.JSX
        : ext === ".js" || ext === ".mjs" || ext === ".cjs"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;

  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
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
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const isType = Boolean(node.importClause?.isTypeOnly);
        record(
          node.moduleSpecifier.text,
          isType ? "type-import" : "static-import",
          node
        );
      } else if (ts.isNoSubstitutionTemplateLiteral(node.moduleSpecifier)) {
        record(node.moduleSpecifier.text, "static-import", node);
      }
    }
    // 2. Static re-exports: `export * from "mod"`, `export { x } from "mod"`
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        record(node.moduleSpecifier.text, "export-reexport", node);
      } else if (ts.isNoSubstitutionTemplateLiteral(node.moduleSpecifier)) {
        record(node.moduleSpecifier.text, "export-reexport", node);
      }
    }
    // 3. TypeScript type import: `type T = import("mod").Type`
    else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg)) {
        if (ts.isStringLiteral(arg.literal)) {
          record(arg.literal.text, "import-type", node);
        } else if (ts.isNoSubstitutionTemplateLiteral(arg.literal)) {
          record(arg.literal.text, "import-type", node);
        }
      }
    }
    // 4. Dynamic import call: `import("mod")` or `import(`mod`)`
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      if (node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          record(firstArg.text, "dynamic-import", node);
        } else if (ts.isNoSubstitutionTemplateLiteral(firstArg)) {
          record(firstArg.text, "dynamic-import", node);
        }
      }
    }
    // 5. TypeScript import = require("mod") syntax
    else if (ts.isImportEqualsDeclaration(node)) {
      if (
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression
      ) {
        const expr = node.moduleReference.expression;
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
          record(expr.text, "import-equals", node);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return results;
}
