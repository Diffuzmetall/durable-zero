# Task 5A: Architecture Boundary & Regression Guards Report (Fix Round 3)

**Date:** 2026-11-04T23:05:03.481Z  
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
| **CLI Serve Resolution** | **PASS** | AST confirms dynamic import to `none` with active `callsMain` binding (`none`) and verified target exports. |
| **Legacy Files Purge** | **PASS** | 0 legacy runtime files in core/src/ |

---

## 2. Dynamic Evidence & Audit Findings

### Detected Violations (1)
- **[P0] AP-010:** `packages/core/src/policy/store.ts:10` — Forbidden vendor dependency in Core

---

## 3. Scanned Production Core Files & Cryptographic Hashes

| Relative Path | Lines | SHA-256 Digest | Status |
| :--- | :---: | :--- | :---: |

