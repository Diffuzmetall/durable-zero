import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { CliServeAuditResult } from "./architecture-boundaries-ast.ts";
import {
  resolveNearestPackageJson,
  verifyFileExportsMain,
} from "./architecture-boundaries-runner-verify.ts";

export function auditCliServeEntrypoint(
  cliScriptPath: string
): CliServeAuditResult {
  if (!fs.existsSync(cliScriptPath)) {
    return { isOk: false, callsMain: false, error: `CLI entry script not found: ${cliScriptPath}` };
  }

  const content = fs.readFileSync(cliScriptPath, "utf8");
  const sf = ts.createSourceFile(
    cliScriptPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    cliScriptPath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  let serveBranchFound = false;
  let targetImport: string | undefined;
  let importedBinding: string | undefined;
  let importType: "destructured-main" | "namespace" | "other" = "other";
  let callsMain = false;
  let invokedIdentifier: string | undefined;
  const locallyDeclaredNames = new Set<string>();

  function inspectServeBranch(branchStmt: ts.Statement) {
    serveBranchFound = true;

    // Pass 1: gather imports and locally declared variable/function names
    function scanBranchDecls(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name) {
        locallyDeclaredNames.add(node.name.text);
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (decl.initializer) {
            let initCall: ts.CallExpression | undefined;
            if (
              ts.isAwaitExpression(decl.initializer) &&
              ts.isCallExpression(decl.initializer.expression) &&
              decl.initializer.expression.expression.kind === ts.SyntaxKind.ImportKeyword
            ) {
              initCall = decl.initializer.expression;
            } else if (
              ts.isCallExpression(decl.initializer) &&
              decl.initializer.expression.kind === ts.SyntaxKind.ImportKeyword
            ) {
              initCall = decl.initializer;
            }

            if (initCall && initCall.arguments.length > 0) {
              const arg = initCall.arguments[0];
              if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
                targetImport = arg.text;
              }

              if (ts.isObjectBindingPattern(decl.name)) {
                for (const elem of decl.name.elements) {
                  const prop = elem.propertyName
                    ? ts.isIdentifier(elem.propertyName) ? elem.propertyName.text : undefined
                    : ts.isIdentifier(elem.name) ? elem.name.text : undefined;
                  if (prop === "main" && ts.isIdentifier(elem.name)) {
                    importedBinding = elem.name.text;
                    importType = "destructured-main";
                  }
                }
              } else if (ts.isIdentifier(decl.name)) {
                importedBinding = decl.name.text;
                importType = "namespace";
              }
              return;
            }
          }
          if (ts.isIdentifier(decl.name)) {
            locallyDeclaredNames.add(decl.name.text);
          }
        }
      }
      ts.forEachChild(node, scanBranchDecls);
    }

    // Pass 2: check for invocation in executable scope (skipping nested function bodies)
    function scanInvocations(node: ts.Node) {
      // Invariant: do NOT descend into uncalled nested function declarations!
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        return;
      }

      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const callee = node.expression.text;
          if (
            importType === "destructured-main" &&
            importedBinding &&
            callee === importedBinding &&
            !locallyDeclaredNames.has(callee)
          ) {
            callsMain = true;
            invokedIdentifier = callee;
          }
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          const obj = node.expression.expression;
          const prop = node.expression.name.text;
          if (
            importType === "namespace" &&
            importedBinding &&
            ts.isIdentifier(obj) &&
            obj.text === importedBinding &&
            prop === "main" &&
            !locallyDeclaredNames.has(obj.text)
          ) {
            callsMain = true;
            invokedIdentifier = `${obj.text}.${prop}`;
          }
        }
      }
      ts.forEachChild(node, scanInvocations);
    }

    scanBranchDecls(branchStmt);
    scanInvocations(branchStmt);
  }

  function findServeIf(node: ts.Node) {
    if (ts.isIfStatement(node)) {
      const cond = node.expression;
      if (ts.isBinaryExpression(cond)) {
        const isStrictEquality =
          cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          cond.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken;

        if (isStrictEquality) {
          const leftText = cond.left.getText(sf);
          const rightText = cond.right.getText(sf);
          const isServe =
            (rightText === '"serve"' || rightText === "'serve'") &&
            (leftText.includes("command") || leftText.includes("argv"));
          const isServeRev =
            (leftText === '"serve"' || leftText === "'serve'") &&
            (rightText.includes("command") || rightText.includes("argv"));

          if (isServe || isServeRev) {
            inspectServeBranch(node.thenStatement);
            return;
          }
        }
      }
    }
    ts.forEachChild(node, findServeIf);
  }

  findServeIf(sf);

  if (!serveBranchFound) {
    return { isOk: false, callsMain: false, error: `CLI script does not declare an if (command === "serve") branch in AST.` };
  }
  if (!targetImport) {
    return { isOk: false, callsMain: false, error: `CLI "serve" branch does not perform an AST dynamic import(...) of the runner.` };
  }
  if (
    targetImport.includes("runner-server") ||
    targetImport.includes("core/dist/runner") ||
    targetImport.includes("core/src/runner")
  ) {
    return { isOk: false, targetImport, callsMain: false, error: `Legacy entrypoint detected: CLI "serve" imports deleted core runner "${targetImport}". Must resolve to runner package.` };
  }

  const scriptDir = path.dirname(cliScriptPath);
  let resolvedPath: string;

  if (targetImport.startsWith(".")) {
    resolvedPath = path.resolve(scriptDir, targetImport);
  } else if (targetImport === "@durable-zero/runner") {
    const runnerDist = path.resolve(scriptDir, "../../runner/dist/main.js");
    resolvedPath = fs.existsSync(runnerDist) ? runnerDist : path.resolve(scriptDir, "../../runner");
  } else if (targetImport.startsWith("@durable-zero/runner/")) {
    const subpath = targetImport.replace("@durable-zero/runner/", "");
    resolvedPath = path.resolve(scriptDir, "../../runner", subpath);
  } else if (targetImport.startsWith("@durable-zero/")) {
    return { isOk: false, targetImport, callsMain: false, error: `CLI "serve" imports "${targetImport}" which is not @durable-zero/runner package.` };
  } else {
    return { isOk: false, targetImport, callsMain: false, error: `CLI "serve" imports "${targetImport}" which does not resolve to @durable-zero/runner.` };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { isOk: false, targetImport, resolvedPath, callsMain: false, error: `CLI "serve" target runner file does not exist on disk: ${resolvedPath}` };
  }

  const pkgInfo = resolveNearestPackageJson(path.dirname(resolvedPath));
  if (!pkgInfo || pkgInfo.pkgJson?.name !== "@durable-zero/runner") {
    return { isOk: false, targetImport, resolvedPath, callsMain: false, error: `Target import "${targetImport}" resolves to "${resolvedPath}" which is not in @durable-zero/runner package (found: "${pkgInfo?.pkgJson?.name}").` };
  }

  const exportsMain = verifyFileExportsMain(resolvedPath);
  if (!exportsMain) {
    return { isOk: false, targetImport, resolvedPath, callsMain: false, error: `Target runner file "${resolvedPath}" exports no callable main() entrypoint function.` };
  }

  if (!callsMain) {
    return { isOk: false, targetImport, resolvedPath, callsMain: false, error: `Hollow implementation detected: CLI "serve" branch imports runner but never invokes main() or its imported alias.` };
  }

  return { isOk: true, targetImport, resolvedPath, callsMain: true, invokedIdentifier };
}
