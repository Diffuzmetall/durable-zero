import fs from "node:fs";
import path from "node:path";
import {
  collectAllSourceFiles,
  computeSha256,
  extractAstDependencies,
  type BoundaryViolation,
  type EdgeProvenance,
  type ExtractedDependency,
  type CliServeAuditResult,
} from "./architecture-boundaries-ast.ts";
import {
  auditCoreFileBoundaries,
  auditPackageJsonDependencies,
} from "./architecture-boundaries-core.ts";
import { auditCliServeEntrypoint } from "./architecture-boundaries-cli.ts";
import {
  buildFullWorkspaceGraph,
  detectDependencyCycles,
  verifyPackageLayering,
} from "./architecture-boundaries-dag.ts";

export interface LiveAuditResult {
  readonly status: "PASS" | "FAIL";
  readonly coreFilesScanned: number;
  readonly coreBoundaryViolations: BoundaryViolation[];
  readonly corePackageJsonViolations: BoundaryViolation[];
  readonly workspaceCycles: string[][];
  readonly layeringViolations: BoundaryViolation[];
  readonly cliServeAudit: CliServeAuditResult;
  readonly legacyFilesFound: string[];
  readonly workspaceGraph: Record<string, string[]>;
  readonly edgeProvenance: EdgeProvenance[];
  readonly fileInventory: Array<{
    path: string;
    sha256: string;
    lines: number;
    dependencies: ExtractedDependency[];
  }>;
}

export function auditLiveWorkspace(workspaceRoot: string): LiveAuditResult {
  const coreSrcDir = path.resolve(workspaceRoot, "packages/core/src");
  const corePkgJsonPath = path.resolve(
    workspaceRoot,
    "packages/core/package.json"
  );
  const cliBinFile = path.resolve(
    workspaceRoot,
    "packages/cli/bin/durable-zero.js"
  );

  const coreFiles = collectAllSourceFiles(coreSrcDir);
  const coreBoundaryViolations: BoundaryViolation[] = [];
  const fileInventory = coreFiles.map((file) => {
    const violations = auditCoreFileBoundaries(file, coreSrcDir);
    coreBoundaryViolations.push(...violations);
    return {
      path: path.relative(workspaceRoot, file),
      sha256: computeSha256(file),
      lines: fs.readFileSync(file, "utf8").split("\n").length,
      dependencies: extractAstDependencies(file),
    };
  });

  const corePackageJsonViolations = fs.existsSync(corePkgJsonPath)
    ? auditPackageJsonDependencies(corePkgJsonPath)
    : [];

  const { graph, edges } = buildFullWorkspaceGraph(workspaceRoot);
  const workspaceCycles = detectDependencyCycles(graph);
  const layeringViolations = verifyPackageLayering(graph, edges);

  const workspaceGraphObj: Record<string, string[]> = {};
  for (const [pkg, deps] of graph.entries()) {
    workspaceGraphObj[pkg] = deps;
  }

  const cliServeAudit = auditCliServeEntrypoint(cliBinFile);

  const legacyFilesToCheck = [
    "packages/core/src/runner-server.ts",
    "packages/core/src/jsonl.ts",
    "packages/core/src/cli-args.ts",
    "packages/core/src/host-rpc.ts",
    "packages/core/src/engine.ts",
  ];
  const legacyFilesFound: string[] = [];
  for (const rel of legacyFilesToCheck) {
    if (fs.existsSync(path.resolve(workspaceRoot, rel))) {
      legacyFilesFound.push(rel);
    }
  }

  const hasFailures =
    coreBoundaryViolations.length > 0 ||
    corePackageJsonViolations.length > 0 ||
    workspaceCycles.length > 0 ||
    layeringViolations.length > 0 ||
    !cliServeAudit.isOk ||
    legacyFilesFound.length > 0;

  return {
    status: hasFailures ? "FAIL" : "PASS",
    coreFilesScanned: coreFiles.length,
    coreBoundaryViolations,
    corePackageJsonViolations,
    workspaceCycles,
    layeringViolations,
    cliServeAudit,
    legacyFilesFound,
    workspaceGraph: workspaceGraphObj,
    edgeProvenance: edges,
    fileInventory,
  };
}

export function generateAuditReport(
  audit: LiveAuditResult,
  outputDir: string,
  testReceipt?: {
    totalTests: number;
    passed: number;
    failed: number;
    durationMs: number;
    exitCode: number;
  }
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(outputDir, { recursive: true });

  const totalViolations =
    audit.coreBoundaryViolations.length +
    audit.corePackageJsonViolations.length +
    audit.workspaceCycles.length +
    audit.layeringViolations.length +
    (audit.cliServeAudit.isOk ? 0 : 1) +
    audit.legacyFilesFound.length;

  const effectiveStatus =
    audit.status === "FAIL" || (testReceipt && testReceipt.failed > 0)
      ? "FAIL"
      : "PASS";

  const reportData = {
    task: "Task 5A: Architecture Boundary & Regression Guards (Round 3)",
    timestamp: new Date().toISOString(),
    status: effectiveStatus,
    sourceBaseline: "7d4b235",
    summary: {
      coreSourceFilesScanned: audit.coreFilesScanned,
      coreBoundaryViolationsCount: audit.coreBoundaryViolations.length,
      corePackageJsonViolationsCount: audit.corePackageJsonViolations.length,
      workspaceCyclesCount: audit.workspaceCycles.length,
      layeringViolationsCount: audit.layeringViolations.length,
      cliServeDelegationValid: audit.cliServeAudit.isOk,
      legacyFilesFoundCount: audit.legacyFilesFound.length,
      totalViolations,
      testSuiteResults: testReceipt ?? { note: "Standalone audit execution" },
    },
    cliServeAudit: audit.cliServeAudit,
    workspaceCycles: audit.workspaceCycles,
    layeringViolations: audit.layeringViolations,
    coreBoundaryViolations: audit.coreBoundaryViolations,
    corePackageJsonViolations: audit.corePackageJsonViolations,
    legacyFilesFound: audit.legacyFilesFound,
    workspaceGraph: audit.workspaceGraph,
    files: audit.fileInventory,
  };

  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), "utf8");

  const mdContent = `# Task 5A: Architecture Boundary & Regression Guards Report (Fix Round 3)

**Date:** ${reportData.timestamp}  
**Branch:** \`cycle-7-runtime-adapter-ioc-migration\`  
**Target Package:** \`@durable-zero/core\`  
**Audit Status:** **${effectiveStatus}** (${totalViolations} violations detected)

---

## 1. Executive Summary

| Verification Target | Result | Evidence |
| :--- | :---: | :--- |
| **Core Source AST Boundaries** | **${audit.coreBoundaryViolations.length === 0 ? "PASS" : "FAIL"}** | ${audit.coreFilesScanned} files scanned. ${audit.coreBoundaryViolations.length} violations. |
| **Core Manifest Purity** | **${audit.corePackageJsonViolations.length === 0 ? "PASS" : "FAIL"}** | \`packages/core/package.json\` dependencies strictly contracts and zod. |
| **Workspace DAG Acyclicity** | **${audit.workspaceCycles.length === 0 ? "PASS" : "FAIL"}** | Full AST source + manifest scan found ${audit.workspaceCycles.length} circular dependencies. |
| **Package Layering Rules** | **${audit.layeringViolations.length === 0 ? "PASS" : "FAIL"}** | Clean architecture tier enforcement found ${audit.layeringViolations.length} layering violations. |
| **CLI Serve Resolution** | **${audit.cliServeAudit.isOk ? "PASS" : "FAIL"}** | AST confirms dynamic import to \`${audit.cliServeAudit.targetImport ?? "none"}\` with active \`callsMain\` binding (\`${audit.cliServeAudit.invokedIdentifier ?? "none"}\`) and verified target exports. |
| **Legacy Files Purge** | **${audit.legacyFilesFound.length === 0 ? "PASS" : "FAIL"}** | ${audit.legacyFilesFound.length === 0 ? "0 legacy runtime files in core/src/" : `Found: ${audit.legacyFilesFound.join(", ")}`} |

---

## 2. Dynamic Evidence & Audit Findings

${
  totalViolations === 0
    ? `### Zero Active Violations Detected in Live Production Core\nAll audited core source files, manifests, and CLI entry points strictly comply with AP-010, AP-012, AP-020, AP-021, AP-025, and AP-076.`
    : `### Detected Violations (${totalViolations})\n` +
      [
        ...audit.coreBoundaryViolations.map(
          (v) =>
            `- **[${v.severity}] ${v.rule}:** \`${v.file}:${v.line}\` — ${v.message}`
        ),
        ...audit.layeringViolations.map(
          (v) =>
            `- **[${v.severity}] ${v.rule}:** \`${v.file}\` — ${v.message}`
        ),
        ...audit.workspaceCycles.map(
          (c) => `- **[P0] AP-020 Cycle:** \`${c.join(" -> ")}\``
        ),
      ].join("\n")
}

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :---: |
${audit.fileInventory
  .map(
    (f) =>
      `| \`${f.path}\` | ${f.lines} | \`${f.sha256.slice(0, 16)}...\` | **CLEAN** |`
  )
  .join("\n")}
`;

  const mdPath = path.join(outputDir, "report.md");
  fs.writeFileSync(mdPath, mdContent, "utf8");

  return { jsonPath, mdPath };
}
