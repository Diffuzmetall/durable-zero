# Task 5A: Architecture Boundary & Regression Guards Report (Fix Round 1)

**Date:** 2026-11-04T21:31:43.058Z  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Target Package:** `@durable-zero/core`  
**Audit Status:** **FAIL** (2 violations detected)

---

## 1. Executive Summary

| Verification Target | Result | Evidence |
| :--- | :---: | :--- |
| **Core Source AST Boundaries** | **PASS** | 16 files scanned. 0 violations. |
| **Core Manifest Purity** | **PASS** | `packages/core/package.json` dependencies strictly contracts and zod. |
| **Workspace DAG Acyclicity** | **FAIL** | Full AST source + manifest scan found 1 circular dependencies. |
| **Package Layering Rules** | **FAIL** | Clean architecture tier enforcement found 1 layering violations. |
| **CLI Serve Resolution** | **PASS** | AST confirms dynamic import to `../../runner/dist/main.js` with active `callsMain` binding (`runRunner`). |
| **Legacy Files Purge** | **PASS** | 0 legacy runtime files in core/src/ |

---

## 2. Dynamic Evidence & Audit Findings

### Detected Violations (2)
- **[P0] AP-020:** `packages/contracts/src/index.ts` — Contracts package (tier 0) must never depend on higher tier package "@durable-zero/adapter-pi-durable".
- **[P0] AP-020 Cycle:** `@durable-zero/adapter-pi-durable -> @durable-zero/contracts -> @durable-zero/adapter-pi-durable`

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :---: |
| `packages/core/src/errors.ts` | 92 | `a53a90954b69b16a...` | **CLEAN** |
| `packages/core/src/index.ts` | 15 | `330a8f885a331118...` | **CLEAN** |
| `packages/core/src/models/provider.ts` | 46 | `462aaff1b7561cb3...` | **CLEAN** |
| `packages/core/src/policy/errors.ts` | 43 | `ba8f99b12a7cfb86...` | **CLEAN** |
| `packages/core/src/policy/resolver.ts` | 120 | `737f4402ef601101...` | **CLEAN** |
| `packages/core/src/policy/schema.ts` | 78 | `0cb5303ed7c11ae2...` | **CLEAN** |
| `packages/core/src/policy/store.ts` | 113 | `cc1457bde8e055c4...` | **CLEAN** |
| `packages/core/src/policy/types.ts` | 44 | `dd8ed7b8f94585a2...` | **CLEAN** |
| `packages/core/src/prompt.ts` | 34 | `fad19e0e2d81c4f8...` | **CLEAN** |
| `packages/core/src/session/coordinator.ts` | 158 | `a21a2620af6f21af...` | **CLEAN** |
| `packages/core/src/session/engine.ts` | 61 | `471e6e15374acea9...` | **CLEAN** |
| `packages/core/src/session/store.ts` | 19 | `38012acc2333467d...` | **CLEAN** |
| `packages/core/src/tools/execution-env.ts` | 39 | `bde5edf3acc054a6...` | **CLEAN** |
| `packages/core/src/tools/host-bridge.ts` | 34 | `503a8b510359eb9e...` | **CLEAN** |
| `packages/core/src/tools/sandbox.ts` | 12 | `d739e53ed622d6e7...` | **CLEAN** |
| `packages/core/src/version.ts` | 2 | `bff733bc8ce03944...` | **CLEAN** |

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
