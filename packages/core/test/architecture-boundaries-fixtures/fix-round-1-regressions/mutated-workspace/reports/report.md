# Task 5A: Architecture Boundary & Regression Guards Report (Fix Round 2)

**Date:** 2026-11-04T22:35:14.937Z  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Target Package:** `@durable-zero/core`  
**Audit Status:** **FAIL** (2 violations detected)

---

## 1. Executive Summary

| Verification Target | Result | Evidence |
| :--- | :---: | :--- |
| **Core Source AST Boundaries** | **FAIL** | 1 files scanned. 1 violations. |
| **Core Manifest Purity** | **PASS** | `packages/core/package.json` dependencies strictly contracts and zod. |
| **Workspace DAG Acyclicity** | **PASS** | Full AST source + manifest scan found 0 circular dependencies. |
| **Package Layering Rules** | **PASS** | Clean architecture tier enforcement found 0 layering violations. |
| **CLI Serve Resolution** | **FAIL** | AST confirms dynamic import to `none` with active `callsMain` binding (`none`) and verified target exports. |
| **Legacy Files Purge** | **PASS** | 0 legacy runtime files in core/src/ |

---

## 2. Dynamic Evidence & Audit Findings

### Detected Violations (2)
- **[P0] AP-010:** `/Users/vanya/Projects/durable-zero/packages/core/test/architecture-boundaries-fixtures/fix-round-1-regressions/mutated-workspace/packages/core/src/violation.ts:1` — Forbidden vendor dependency in Core: "@earendil-works/pi-durable". All vendor packages must live strictly in adapters.

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :---: |
| `packages/core/src/violation.ts` | 3 | `bc7e89bed9df2bc7...` | **CLEAN** |
