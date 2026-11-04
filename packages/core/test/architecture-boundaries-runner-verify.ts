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

/**
 * Verifies that a target file exports a callable main() entrypoint function.
 * Uses the official TypeScript TypeChecker API to resolve symbols and signatures,
 * ensuring primitive constants (e.g. main = 17, main = Number("17")) are strictly rejected.
 */
export function verifyFileExportsMain(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;

  try {
    const program = ts.createProgram([filePath], {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });

    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(filePath);
    if (!sf) return false;

    const modSymbol = checker.getSymbolAtLocation(sf);
    if (modSymbol) {
      const exports = checker.getExportsOfModule(modSymbol);
      const mainExport = exports.find((e) => e.name === "main");
      if (mainExport) {
        // Resolve alias if re-exported (e.g. export { n as main })
        const targetSymbol =
          mainExport.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(mainExport)
            : mainExport;

        const type = checker.getTypeOfSymbolAtLocation(
          targetSymbol,
          targetSymbol.valueDeclaration ?? sf
        );

        const signatures = type.getCallSignatures();
        if (signatures.length > 0) {
          return true;
        }

        // Has an export named main, but 0 call signatures -> non-callable!
        return false;
      }
    }
  } catch {
    // If TypeChecker throws on malformed syntax, fall through to strict AST
  }

  // Fallback: strict AST analysis for standalone bundles (esbuild CJS/ESM)
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const ext = path.extname(filePath).toLowerCase();
    const sf = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === ".ts" || ext === ".mts" ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );

    let hasCallableMain = false;

    function isCallableASTNode(node: ts.Node): boolean {
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
      if (ts.isFunctionDeclaration(node)) return true;
      return false;
    }

    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "main") {
        const isExported = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        );
        if (isExported) hasCallableMain = true;
      } else if (ts.isVariableStatement(node)) {
        const isExported = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword
        );
        if (isExported) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === "main") {
              if (decl.initializer && isCallableASTNode(decl.initializer)) {
                hasCallableMain = true;
              }
            }
          }
        }
      }

      if (!hasCallableMain) {
        ts.forEachChild(node, visit);
      }
    }

    visit(sf);
    return hasCallableMain;
  } catch {
    return false;
  }
}
