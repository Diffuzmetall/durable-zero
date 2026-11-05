# Cycle 7 Task 1: Closing Clean Build & Separate Typecheck Audit

**Date:** 2026-11-04  
**Milestone:** `ad99873e396f7440a6896dabaf516b6393c08a37`  
**Role:** Independent mechanical NATIVE CLI builder  
**Scope:** `docs/arch-improvement/cycle-7/live/task-1/closing-build-typecheck/`  
**Status:** **AUDIT COMPLETE (QUIESCED FOR PARENT RULING)**

---

## 1. Executive Summary: Declared Build vs Typecheck Verification

| Check | Declared Config / Script | Real Exit Code | Verdict | Notes |
|---|---|---|---|---|
| **Clean Build** | `npm run build` (`node scripts/build.mjs`) | `0` | **PASS** | Rebuilt from zero dist outputs across all 9 packages + runner CLI (`main.js`) + WASM assets. |
| **Declared Typecheck Script** | `package.json` `scripts.typecheck` | — | **MISSING** | `package.json` declares ONLY `build`, `test`, `lint`. No `typecheck` script exists. |
| **Root TSC Scope** | `tsc --noEmit --pretty false` | `2` | **DIAGNOSTIC FAIL** | Root `tsconfig.json` has no `include`/`exclude`, scanning docs, negative tests, and fixtures (783 errors). |
| **Production Source Typecheck** | Scoped `diagnostic-tsconfig.json` (`packages/*/src/**/*.ts`) | `2` | **DIAGNOSTIC FAIL** | 113 strict errors remain in production source code (75 due to `exactOptionalPropertyTypes: true`). |

---

## 2. Findings (Finding Format)

### [P1] Evidence: Repository lacks a declared `typecheck` script and scoped `tsconfig`
- **Evidence:** 
  1. `package.json` contains:
     ```json
     "scripts": {
       "build": "node scripts/build.mjs",
       "test": "node --test --test-timeout 30000 packages/*/test/*.test.ts",
       "lint": "pnpm -r run lint"
     }
     ```
  2. Root `tsconfig.json` has `"types": []` and completely omits `"include"` and `"exclude"`. Running bare `tsc` ingests intentional negative review probes, adversarial test fixtures (`r4-fixtures`, `fake-runner-exploit`), and documentation TS files, producing 783 errors.
  3. `tsconfig.json` omits `"allowImportingTsExtensions": true`, causing 330 TS5097 errors on valid Node ESM `.ts` imports.
- **Impact:** Type safety is not mechanically guarded in CI or local scripts; `esbuild` strips types during `npm run build` without validating type soundess, masking latent type mismatches.
- **Rule:** AP-029 (TypeScript strictness), AP-028 (Testing & verification determinism), AP-076 (Anti-Hollow).
- **Fix decision:** Introduce an official `tsconfig.src.json` (or configure root `tsconfig.json` with appropriate `include: ["packages/*/src/**/*.ts"]` and `"allowImportingTsExtensions": true`, `"noEmit": true`) and add `"typecheck": "tsc -p tsconfig.src.json"` to `package.json` scripts.

### [P2] Evidence: Latent type errors in `@durable-zero/adapter-pi-durable` and `@durable-zero/runner`
- **Evidence:** Scoped diagnostic evaluation of all production sources (`packages/*/src/**/*.ts`) under the project's base strict compiler settings revealed 113 errors:
  1. **Exact Optional Property Violations (75 errors, TS2412 / TS2375 / TS2379):** Root compiler specifies `"exactOptionalPropertyTypes": true`. Code frequently assigns `{ prop: undefined }` to `{ prop?: T }` (e.g. `durable-child-event-adapter.ts:20`, `runtime-loader.ts:93`, `main.ts:7`).
  2. **Relocation & Path Typos (6 errors, TS2307):** `packages/adapter-pi-durable/src/engine/bridge/contracts.ts` attempts to import from `../../../contracts/src/index.ts` (3 parent steps instead of 4, resolving to non-existent `packages/adapter-pi-durable/contracts`).
  3. **Missing Re-exports (3 errors, TS2305):** `CliArgs` and `RunnerEvent` imported from `@durable-zero/core` are no longer exported by core after Task 1 relocation.
  4. **Unchecked Index Access (5 errors, TS2532 / TS18048):** `cli-args.ts:36` indexes `argv[++i]` without guard under `noUncheckedIndexedAccess: true`.
- **Impact:** While `esbuild` successfully emits executable JS for `durable-zero serve` and tests pass, strict TypeScript compilation fails.
- **Rule:** AP-029 (TypeScript strictness), AP-022 (Typed contracts).
- **Fix decision:** Scheduled for a remediation round: fix the path typo in `contracts.ts`, align exported interface types in `@durable-zero/core`, and normalize optional properties with strict checks or explicit `| undefined` in contract definitions.

---

## 3. Scoped Architecture Verification

### Passed:
- **Passed: AP-020 (Composition Root & Build Independence):** Declared clean build (`node scripts/build.mjs`) builds from clean zero-dist state in 1.8s with exit code `0`.
- **Passed: AP-025 (Import discipline):** The frozen candidate in an isolated archive does not rely on dirty workspace node_modules symlinks.
- **Passed: AP-027 (Environment & dependency isolation):** Offline build succeeds purely from pinned lockfile dependencies.
- **Passed: AP-076 (Anti-Hollow & Honesty of Gates):** We reject the assumption that clean `esbuild` implies clean `tsc`. Scope gap (783 root vs 113 production errors) is honestly documented with full raw diagnostic logs.

### Residual Risk:
- The 113 production source type errors do not block Node ESM runtime execution (which runs transpiled esbuild code), but represent technical debt under strict `exactOptionalPropertyTypes: true`.
- Parent orchestrator ruling required on whether to add a dedicated `tsconfig.build.json` / `package.json:scripts.typecheck` in a subsequent task.
