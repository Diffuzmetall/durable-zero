import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function resolveNearestPackageJson(
  startDir: string
): { dir: string; pkgJson: any } | null {
  let curr = path.resolve(startDir);
  const root = path.parse(curr).root;
  while (curr !== root) {
    const pkgPath = path.join(curr, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        return { dir: curr, pkgJson };
      } catch {
        return null;
      }
    }
    curr = path.dirname(curr);
  }
  return null;
}

export function verifyFileExportsMain(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ext === ".ts" || ext === ".mts" ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  let hasMainExport = false;

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "main") {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) hasMainExport = true;
    } else if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === "main") {
            hasMainExport = true;
          }
        }
      }
    } else if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const elem of node.exportClause.elements) {
          if (elem.name.text === "main") {
            hasMainExport = true;
          }
        }
      }
    } else if (ts.isBinaryExpression(node)) {
      const left = node.left.getText(sf);
      if (left === "exports.main" || left === "module.exports.main") {
        hasMainExport = true;
      }
    }

    if (!hasMainExport) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sf);
  return hasMainExport;
}
