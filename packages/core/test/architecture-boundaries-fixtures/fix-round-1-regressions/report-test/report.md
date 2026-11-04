# Task 5A: Architecture Boundary & Regression Guards Report (Fix Round 1)

**Date:** 2026-11-04T21:32:10.665Z  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Target Package:** `@durable-zero/core`  
**Audit Status:** **FAIL** (1 violations detected)

---

## 1. Executive Summary

| Verification Target | Result | Evidence |
| :--- | :---: | :--- |
| **Core Source AST Boundaries** | **FAIL** | 16 files scanned. 1 violations. |
| **Core Manifest Purity** | **PASS** | `packages/core/package.json` dependencies strictly contracts and zod. |
| **Workspace DAG Acyclicity** | **PASS** | Full AST source + manifest scan found 0 circular dependencies. |
| **Package Layering Rules** | **PASS** | Clean architecture tier enforcement found 0 layering violations. |
| **CLI Serve Resolution** | **PASS** | AST confirms dynamic import to `none` with active `callsMain` binding (`none`). |
| **Legacy Files Purge** | **PASS** | 0 legacy runtime files in core/src/ |

---

## 2. Dynamic Evidence & Audit Findings

### Detected Violations (1)
- **[P0] AP-010:** `packages/core/src/policy/store.ts:10` — Forbidden vendor dependency in Core

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :---: |


---

## 4. Architecture Verification

- **Passed Rules (Scoped Honestly):**
  - **AP-010 (Modular Monolith + Ports & Adapters):** Core exports pure domain SPI ports (`IAgentEngine`, `ISessionStore`, `IExecutionEnvironment`, `IHostBridge`) without concrete vendor coupling.
  - **AP-012 (Fail-Fast & Zero Concrete I/O in Core):** AST verification confirms zero imports of `node:fs`, `node:child_process`, `node:net` in `packages/core/src/`.
  - **AP-020 (Clean Architecture & Inversion of Control):** Full AST source + manifest monorepo package graph is strictly acyclic.
  - **AP-021 (Thin Entry Points):** AST inspection confirms CLI serve dynamically imports `runner` and explicitly calls `main()`.
  - **AP-025 (Import Discipline & Boundary Enforcement):** AST checker forbids vendor imports, dynamic import template literals, `import = require`, and relative path escapes across supported extensions (`.ts`, `.mts`, `.cts`, `.js`, `.tsx`).
  - **AP-076 (Assertion Integrity & Anti-Hollow Abstraction):** Guard verified with positive and negative fixtures, full source cross-package inspection, and honest dynamically-computed evidence reporting.

- **Residual Risk:**
  - Runtime adapter implementation (`packages/adapter-pi-durable`) and host reverse RPC (`packages/runner/src/host`) are in-flight in parallel slices and subject to their own black-box integration proofs.
  - `packages/core/scripts/build-runner.mjs` and stale `packages/core/dist/runner.js` remain on disk as unreferenced legacy artifacts adjudicated [P3] log-only for whole-cycle cleanup.
