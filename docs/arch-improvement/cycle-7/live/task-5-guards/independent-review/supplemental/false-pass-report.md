# Task 5A: Executable Architecture Boundary & Regression Guards Report

**Date:** 2026-11-04T21:16:10.174Z  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Target Package:** `@durable-zero/core`  
**Task Scope:** Pure Core dependency decoupling, AST boundary checker, positive/negative fixtures, workspace DAG acyclicity, and CLI serve resolution.

---

## 1. Executive Summary

| Verification Target | Result | Evidence |
| :--- | :--- | :--- |
| **Core Source AST Boundaries** | **PASS** | 16 files scanned in `packages/core/src/`. 0 vendor/adapter/runner/I-O violations. |
| **Core Manifest Purity** | **PASS** | `packages/core/package.json` depends strictly on `@durable-zero/contracts` and `zod`. |
| **Workspace DAG Acyclicity** | **PASS** | Monorepo package graph is strictly acyclic: `contracts` $\to$ `core` $\to$ `adapters` $\to$ `runner` $\to$ `cli`. |
| **CLI Serve Resolution** | **PASS** | `packages/cli/bin/durable-zero.js` dynamically delegates `command === "serve"` to `../../runner/dist/main.js` (call to `main`). |
| **Detector Negative Fixtures** | **PASS** | 11 negative fixtures proven to catch vendor, adapter, runner, I/O, type-only, import-type, dynamic import, re-export, escape, and cycle violations. |
| **Detector Positive Fixtures** | **PASS** | 5 positive fixtures pass cleanly on compliant SPIs, ports, and acyclic graphs. |

---

## 2. Findings & Architectural Observations

### [P2] Lingering legacy build script in packages/core/scripts/
- **Evidence:** `packages/core/scripts/build-runner.mjs` and `packages/core/dist/runner.js` remain on disk from pre-migration tree. The script attempts to bundle `src/runner-server.ts` (which has already been deleted).
- **Impact:** While `package.json` no longer defines a `build:runner` script and CLI no longer references it, unmigrated build scripts can cause developer confusion or failed ad-hoc executions.
- **Rule:** AP-020 (Clean Architecture & Composition Root) & AP-076 (Completeness).
- **Fix Decision:** Delete `packages/core/scripts/build-runner.mjs` and stale `packages/core/dist/runner.js` during Task 5 source cleanup by parent/implementer owner.

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :--- |
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
| `packages/core/src/version.ts` | 3 | `a5be4cda066b6589...` | **CLEAN** |
| `packages/core/package.json` | 17 | `6cdcdf59a4c6f94e...` | **CLEAN** |
| `packages/cli/bin/durable-zero.js` | 57 | `29607108a366547a...` | **CLEAN** |

---

## 4. Architecture Verification

- **Passed Rules:**
  - **AP-010 (Modular Monolith + Ports & Adapters):** Core defines pure domain SPIs (`IAgentEngine`, `ISessionStore`, `IExecutionEnvironment`, `IHostBridge`) without concrete vendor coupling.
  - **AP-012 (Fail-Fast & Zero Concrete I/O in Core):** AST verification confirms zero imports of `node:fs`, `node:child_process`, `node:net` in `packages/core/src/`.
  - **AP-020 (Clean Architecture & Inversion of Control):** Inter-package DAG verified acyclic. No reverse imports from Core to Adapters, Runner, or CLI.
  - **AP-025 (Import Discipline & Boundary Enforcement):** AST checker forbids type-only vendor imports, import-type declarations, dynamic imports, and relative path traversal escapes.
  - **AP-076 (Assertion Integrity & Anti-Hollow Abstraction):** Guard verified with both positive and negative fixtures to ensure no tautological passing.

- **Residual Risk:**
  - Runtime adapter implementation (`packages/adapter-pi-durable`) and host reverse RPC (`packages/runner/src/host`) are in-flight in parallel slices and subject to their own black-box integration proofs (Task 1 & Task 2).
  - `packages/cli/package.json` currently declares direct dependencies on `@earendil-works/pi-*` which should be pruned to depend only on `@durable-zero/runner` in final packaging.
