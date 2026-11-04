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

export function isCallableNode(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  if (ts.isCallExpression(node)) return true;
  if (ts.isIdentifier(node)) return true;
  return false;
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

  let hasCallableMainExport = false;
  const localFunctions = new Set<string>();

  // Pass 1: gather local function declarations for re-export checking
  function scanLocalDecls(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      localFunctions.add(node.name.text);
    }
    ts.forEachChild(node, scanLocalDecls);
  }
  scanLocalDecls(sf);

  // Pass 2: check for callable exported main
  function visit(node: ts.Node) {
    // 1. export function main() / export async function main()
    if (ts.isFunctionDeclaration(node) && node.name?.text === "main") {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) hasCallableMainExport = true;
    }
    // 2. export const main = () => ... / export const main = function() ...
    else if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === "main") {
            if (decl.initializer && isCallableNode(decl.initializer)) {
              hasCallableMainExport = true;
            }
          }
        }
      }
    }
    // 3. export { main, runRunner as main }
    else if (ts.isExportDeclaration(node) && node.exportClause) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const elem of node.exportClause.elements) {
          if (elem.name.text === "main") {
            const localName = elem.propertyName
              ? elem.propertyName.text
              : elem.name.text;
            if (localFunctions.has(localName) || !sf.isDeclarationFile) {
              hasCallableMainExport = true;
            }
          }
        }
      }
    }
    // 4. CommonJS bundle fallback: exports.main = fn / module.exports = { main: fn }
    else if (ts.isBinaryExpression(node)) {
      const left = node.left.getText(sf);
      if (left === "exports.main" || left === "module.exports.main") {
        if (isCallableNode(node.right)) {
          hasCallableMainExport = true;
        }
      }
    }

    if (!hasCallableMainExport) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sf);
  return hasCallableMainExport;
}
