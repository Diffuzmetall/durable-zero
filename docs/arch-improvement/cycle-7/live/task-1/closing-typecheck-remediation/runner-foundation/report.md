# Closing Typecheck Remediation Report — Lease B (Runner Foundation)

**Date:** 2026-11-05  
**Worker:** `thr_4yhrgipwed` (Lease B Scope)  
**Parent:** `@thread:thr_9yjb93iwmn`  
**Status:** REMEDIATION COMPLETE — ALL 29 LEASE B TYPECHECK ERRORS RESOLVED (0 ERRORS REMAINING IN SCOPE)  
**Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/`  

---

## 1. Executive Summary & Audit Baseline

At milestone `ad99873`, clean build passed with exit code 0 (`node scripts/build.mjs`), but strict production typecheck revealed 113 errors across `packages/*/src/**/*.ts` under `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `strict`.

Parent assigned **Lease B** to the original dispatcher author covering 29 errors across:
- `packages/runner/src/**` (18 errors)
- `packages/contracts/src/**` (6 errors)
- `packages/adapter-pi-ai/src/**` (4 errors)
- `packages/protocol/src/**` (1 error)
- Official typecheck configuration (`tsconfig.src.json`) and root `package.json` script.

### Remediation Outcome
- **Errors before:** 29 in Lease B (113 total in production)
- **Errors after:** **0 in Lease B** (73 total in repository, restricted strictly to Author A's `adapter-pi-durable: 72` and `execution: 1`; `core` also dropped to 0).
- **Typecheck Strategy:** Zero type relaxation, zero `any`, zero `@ts-ignore`, zero compiler option weakening. Strict flags (`exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `strict: true`) remain fully enforced.

---

## 2. Official Repository Configuration Added

1. **`tsconfig.src.json` Created at Repository Root:**
   Official production source typecheck configuration scoped to all `packages/*/src/**/*.ts`.
   - Excludes tests, fixtures, build dists, and docs explicitly.
   - Enforces `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `noEmit: true`, and `allowImportingTsExtensions: true`.
   - Declares canonical workspace path mappings for clean package resolution.
2. **Root `package.json` Script Added:**
   ```json
   "typecheck": "tsc -p tsconfig.src.json --pretty false"
   ```

---

## 3. Detailed Fixes by Package

### A. Foundational Contracts (`packages/contracts`) — 6 Errors Resolved
- **Pure `CliArgs` Established:** Declared pure shared config DTO `CliArgs` in `packages/contracts/src/cli-args.ts` and exported from `packages/contracts/src/index.ts`. Coordinates foundational CLI configuration between runner, adapters, and core without circular dependencies or vendor leakages.
- **Runtime Graph Projections (`status.ts`):** Under `exactOptionalPropertyTypes: true`, passing `{ blockedReason: undefined }` to `{ blockedReason?: BlockedTaskReason }` is a type violation. Remediated in `projectTaskState` and `projectTaskReceipt` by conditionally omitting absent optional keys (`blockedReason`, `preview`, `durationMs`) via object spread omission `...(prop !== undefined ? { prop } : {})`.

### B. Protocol (`packages/protocol`) — 1 Error Resolved
- **`JsonRpcMethodNotFoundError` (`errors.ts`):** Updated `public readonly method?: string | undefined` to honestly type the explicit undefined assignment from constructor parameter `method?: string`.

### C. Adapter Pi AI (`packages/adapter-pi-ai`) — 4 Errors Resolved
- **Foundational `CliArgs` Import (`model-setup.ts`):** Migrated from nonexistent `@durable-zero/core` export to foundational `@durable-zero/contracts`.
- **`exactOptionalPropertyTypes` Omission (`model-setup.ts:76`, `model-provider.ts:41`):** `resolveCliModel` and `resolveModel` options conditionally omit `provider` and `thinking` when undefined.
- **`noUncheckedIndexedAccess` Guard (`model-provider.ts:73`):** Guarded `available[0]` lookup with explicit existence check before property access.

### D. Runner Foundation (`packages/runner`) — 18 Errors Resolved
- **CLI Arg Parser Robustness (`cli-args.ts`):** Guarded `argv[i]` reads and `argv[++i]` lookups against `undefined`, eliminating 12 `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` errors without non-null assertions.
- **Composition Root Omission Discipline (`composition.ts`):**
  * `DefaultResourceLoaderOptions`: conditionally omitted `additionalSkillPaths` and `additionalExtensionPaths`.
  * `PiDurableEngine` CLI options: conditionally omitted absent CLI options.
  * `StdioJsonRpcServerOptions`: conditionally omitted `stdin` and `stdout` when undefined.
- **Main Entrypoint (`main.ts`):** Conditionally omitted absent CLI fields when invoking `assembleDurableZero`.
- **Host Bridge (`host-bridge.ts`):** Conditionally omitted `isError` in `forwardToolCall` return payload when undefined.
- **Dispatcher Normalizers (`normalizers.ts`):** Imported `PromptInput` and `PromptContentPart` from true public contract `@durable-zero/contracts` instead of nonexistent Core alias.

---

## 4. Root Test Resolution: Capability Dispatch Root Abort

### Root Cause Analysis
In `packages/runner/test/capability-dispatch.test.ts:364`, the root abort test failed with `AssertionError: Expected undefined to strictly equal true`.
- **Investigation:** Author A migrated `SessionCoordinator` to eliminate the sticky `isAborted` boolean state (which previously caused abort/reuse lockup). Property `coordinator.isAborted` was intentionally removed from Core.
- **Fix:** Updated test assertion to verify genuine behavioral contracts:
  1. Method return envelope equals `{ ok: true }`.
  2. Concrete dependency call: `assert.deepEqual(engine.abortedConversations, ["1"])`.
  3. Event emission: verified that `coordinator.events(...)` receives `{ type: "session/aborted" }`.
- **Zero Fake Success:** Real execution and event propagation strictly verified.

---

## 5. Verification Evidence & Test Receipts

### Official Production Typecheck Run
- **Command:** `npx tsc -p tsconfig.src.json --pretty false`
- **Residual Errors by Package:**
  * `packages/runner`: **0**
  * `packages/contracts`: **0**
  * `packages/adapter-pi-ai`: **0**
  * `packages/protocol`: **0**
  * `packages/core`: **0**
  * `packages/execution`: 1 (Author A scope)
  * `packages/adapter-pi-durable`: 72 (Author A scope)
- **Raw Diagnostic Log:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/tsc-production-diagnostic.log`

### Full Suite Run (Protocol + Runner)
- **Command:** `node --test --test-timeout 30000 packages/protocol/test/protocol.test.ts packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-dispatch.test.ts packages/runner/test/host-bridge.test.ts packages/runner/test/composition-root.test.ts`
- **Result:** **90 tests passed, 0 failed, 0 skipped** across 20 suites in 1.20s.
- **Raw Console Log:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/test-output.txt`
- **JUnit XML Receipt:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/junit.xml` (90 `<testcase>` nodes).

---

## 6. Architecture Rules & Scoped Verdict

- **AP-010 (Modular Monolith & Ports/Adapters):** Foundational `CliArgs` in contracts avoids cyclic dependencies and keeps Core vendor-pure.
- **AP-012 (Fail-Fast & Explicit Errors):** Strict typecheck enforcement without `@ts-ignore` or `any`.
- **AP-019 (Line Budget Reality):** Modular separation between `session-dispatcher.ts` and `normalizers.ts` preserved.
- **AP-020 (Composition Root):** Clean option omission in `composition.ts` and `main.ts`.
- **AP-022 (Typed Errors):** Protocol error identity preserved without prototype splits.
- **AP-026 (API Contracts & DTOs):** Clean DTO definitions in contracts matching canonical plans.
- **AP-028 (Testing Strategy & Determinism):** All 90 tests deterministic in <1.3s.
- **AP-029 (TypeScript Strictness):** Full strictness enforced across all 9 packages.
- **AP-074 (Explicit DI):** Clean dependency passing without hidden singletons.
- **AP-076 (Anti-Hollow):** True event and state assertions; zero fake receipts.

**VERDICT (Lease B Scope): PASS (0 Errors Remaining)**  
Source-write quiescence active. Holding for parent checkpoint and backup.
