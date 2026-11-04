# Cycle 7 Task 1 Consumer Test Migration — Checkpoint Report (Batch 1)

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **BATCH 1 MIGRATED & GREEN — QUIESCED FOR IMMEDIATE PARENT CHECKPOINT & BACKUP**

---

## 1. Executive Summary

Following parent instruction and the Cycle 7 sovereign core decoupling plan, atomic relocation of native runtime closures from `@durable-zero/core` to `@durable-zero/adapter-pi-durable` required migrating test consumers that were broken by missing modules (`ERR_MODULE_NOT_FOUND`). Leaving broken imports in Core was rejected as unacceptable.

This checkpoint delivers **Batch 1**: 11 native test suites relocated from `packages/core/test/` to `packages/adapter-pi-durable/test/`, eliminating cross-package private imports, maintaining Core purity (AP-010, AP-025), preserving 100% of existing assertions and test semantics without skips, stubs, or altered expectations, and keeping full discoverability by `packages/*/test/*.test.ts`.

All 13 test files in `packages/adapter-pi-durable/test/` (41 tests total) pass cleanly in ~2.3 seconds with zero failures and zero skipped tests. The native walking skeleton (`e2e-walking-skeleton.test.ts`, 12 tests) remains 100% green and verified.

---

## 2. Representative `ERR_MODULE_NOT_FOUND` Baseline Proof

Prior to repair, attempting to run native tests left in `packages/core/test/` produced fatal module resolution errors because the implementation modules were relocated to `@durable-zero/adapter-pi-durable/src/engine/`.

### Verified Raw Baseline Receipt
- **File:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/baseline-err-module-not-found.log`
- **Command:** `node --test packages/core/test/view-stream-projector.test.ts`
- **Exit Code:** `1`
- **Error Excerpt:**
  ```text
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/Users/vanya/Projects/durable-zero/packages/core/src/bridge/view-stream-projector.ts' imported from /Users/vanya/Projects/durable-zero/packages/core/test/view-stream-projector.test.ts
    code: 'ERR_MODULE_NOT_FOUND',
    url: 'file:///Users/vanya/Projects/durable-zero/packages/core/src/bridge/view-stream-projector.ts'
  ```

Similarly, storage tests (`session-fork.test.ts`, `session-lock-eviction.test.ts`, `session-storage-errors.test.ts`, `session-storage-pid-safety.test.ts`) failed with `ERR_MODULE_NOT_FOUND` when importing `@durable-zero/adapter-pi-durable` from `packages/core/test/` because Core does not and must not declare adapter dependencies.

---

## 3. Migration Inventory & From $\to$ To Mapping (Batch 1)

All 11 test suites were relocated to `packages/adapter-pi-durable/test/`. Name collisions were handled explicitly without overwriting existing tests.

| # | Original Location (`packages/core/test/`) | Target Location (`packages/adapter-pi-durable/test/`) | Migrated Modules Imported | Collisions / Special Handling | Tests Count |
|---|---|---|---|---|---|
| 1 | `session-fork.test.ts` | `session-fork.test.ts` | `../src/index.ts` (`forkSessionDatabase`) | None | 1 |
| 2 | `session-lock-eviction.test.ts` | `session-lock-eviction.test.ts` | `../src/index.ts` (`selectSession`, `isProcessAlive`, `SessionOwnerInfo`) | None | 5 |
| 3 | `session-storage-errors.test.ts` | `session-storage-errors.test.ts` | `../src/index.ts` (`isProcessAlive`) | None | 1 |
| 4 | `session-storage-pid-safety.test.ts` | `session-storage-pid-safety.test.ts` | `../src/index.ts` (`isVerifiedRunnerProcess`) | None | 4 |
| 5 | `view-stream-projector.test.ts` | `view-stream-projector.test.ts` | `../src/engine/bridge/view-stream-projector.ts`, `../src/engine/bridge/contracts.ts` | None | 2 |
| 6 | `child-native-batch-outcome.test.ts` | `child-native-batch-outcome.test.ts` | `../src/engine/bridge/durable-child-event-adapter.ts`, `../src/engine/bridge/contracts.ts` | None | 4 |
| 7 | `tool-result-routing.test.ts` | `tool-result-routing.test.ts` | `../src/engine/bridge/durable-event-adapter.ts`, `../src/engine/bridge/durable-child-event-adapter.ts`, `../src/engine/bridge/native-tool-result.ts` | None | 5 |
| 8 | `watch-events-compat.test.ts` | `watch-events-tools-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts`, `../src/engine/bridge/durable-contracts.ts` | **Name Collision Handled**: Renamed to `watch-events-tools-compat.test.ts` to preserve author's streaming test `watch-events-compat.test.ts` | 2 |
| 9 | `subagent-envelope.test.ts` | `subagent-envelope.test.ts` | `../src/engine/shared/subagent-envelope.ts` | None | 8 |
| 10 | `subagent-envelope-generic.test.ts` | `subagent-envelope-generic.test.ts` | `../src/engine/shared/subagent-envelope.ts` | None | 2 |
| 11 | `subagent-async-envelope.test.ts` | `subagent-async-envelope.test.ts` | `../src/engine/subagent-role.ts`, `../src/engine/subagent.ts` | None | 5 |
| | **Pre-existing in Adapter** | `watch-events-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts` | Preserved untouched (author's streaming regression) | 1 |
| | **Pre-existing in Adapter** | `sqlite-storage.test.ts` | `../src/index.ts` | Preserved untouched | 1 |
| | **TOTAL IN ADAPTER TEST** | | | | **41 tests** |

---

## 4. Verification Receipts

### 4.1. Adapter Test Suite Run (All 13 files, 41 tests)
- **Command:** `node --test packages/adapter-pi-durable/test/*.test.ts`
- **Exit Code:** `0`
- **Duration:** 2298ms (~2.3s)
- **Raw Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-1.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-1.junit.xml`
- **Summary:** `41 tests, 3 suites, 41 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`

### 4.2. Native Walking Skeleton Protection (Non-Regression Receipt)
- **Command:**
  ```bash
  node --test \
    packages/adapter-pi-durable/test/watch-events-compat.test.ts \
    packages/core/test/pure-domain-coordinator.test.ts \
    packages/runner/test/composition-root.test.ts \
    packages/cli/test/cli.test.ts \
    packages/runner/test/e2e-walking-skeleton.test.ts
  ```
- **Exit Code:** `0`
- **Duration:** 3870ms (~3.8s)
- **Summary:** `12 tests, 2 suites, 12 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`
- **Proof:** CLI JSON-RPC prompt streaming, persistence, and restart work end-to-end against real compiled binaries.

---

## 5. Source Hash Verification (SHA256)

```text
f386a52b76b23098c3dd161b2cf4be63dd6ace99ecb47e77a65da8c7fdd62722  packages/adapter-pi-durable/test/session-fork.test.ts
a722bd9a8a8f5b2de586925cdcc5a233db303bfa1fa318976be4d090f341fc70  packages/adapter-pi-durable/test/session-lock-eviction.test.ts
b884a237b324ce79b8cbf6a159eb20ca7008df19586381514c2f30a45cd37ec2  packages/adapter-pi-durable/test/session-storage-errors.test.ts
fc609bf48cc9f21bd8cdf515ffe27b3d5660e0b86fadff2c1015d37e2b3aa00a  packages/adapter-pi-durable/test/session-storage-pid-safety.test.ts
a8258630ea7eddf3b17a58bab715cc128a19e3ecce08d44ca6cc790772840ed8  packages/adapter-pi-durable/test/view-stream-projector.test.ts
4ab7aaf31f91967eebf96bfc4d9ee9c502e5d71e63299e7bac3f0955b8f0958d  packages/adapter-pi-durable/test/child-native-batch-outcome.test.ts
bab74e2c8e500edfafa8c0eeddbf108690563924bc6bbc58329817b75d5be50d  packages/adapter-pi-durable/test/tool-result-routing.test.ts
2d9d099bc5c5df0b0d7701d1772dd829d4d3af4b65528f7add02a41c0c0d84dc  packages/adapter-pi-durable/test/watch-events-tools-compat.test.ts
5fe714507a6c8cc874696cf27f5a2625befc69e3b8a1440c3329a965b8d4c429  packages/adapter-pi-durable/test/watch-events-compat.test.ts
dce4ee6ce8f3396542cdb948b70a3ccb1629eaf463e5a477599739a91fbfbe2a  packages/adapter-pi-durable/test/sqlite-storage.test.ts
7a9b46c3d9e3a9cc9f108b8e9fc79f7715f1e550285bc40774894e017ce4fb2a  packages/adapter-pi-durable/test/subagent-envelope.test.ts
d7168ebb2be2f57ab596779b6151d8f434552b72dd44ae8231039a0083e0ca13  packages/adapter-pi-durable/test/subagent-envelope-generic.test.ts
e327057a311771dc692e1e418b8d3925fc02208a3be77b918f0bee9c52026e49  packages/adapter-pi-durable/test/subagent-async-envelope.test.ts
```

---

## 6. Findings and Architectural Review

[P2] Evidence: 44 remaining test files in `packages/core/test/` still carry broken imports referencing relocated modules (`../src/subagent.ts`, `../src/runtime-controller.ts`, `../src/harness-setup.ts`, etc.). Impact: Full workspace `npm test` fails fast on module resolution before reaching test execution. Rule: AP-010 (Hexagonal Boundaries), AP-025 (Import Discipline), AP-028 (Testing Strategy). Fix decision: Batch remaining test migrations systematically by subsystem (Graph/Receipts, Subagent Lifecycle, Codemode/Extensions, Runtime Bindings/Compaction, Session Commands) into `packages/adapter-pi-durable/test/` across subsequent slices.

### Architecture Verification Scoped
- **Passed:**
  - AP-010 (Modular Monolith / Ports & Adapters): Relocated native bridge, storage, and subagent tests into `@durable-zero/adapter-pi-durable` without introducing private cross-package coupling.
  - AP-020 (Clean Architecture & Boundaries): Eliminated illegal `@durable-zero/adapter-pi-durable` imports from `packages/core/test/`.
  - AP-025 (Import Discipline): All migrated test files resolve imports strictly from local relative paths (`../src/index.ts`, `../src/engine/...`).
  - AP-028 (Deterministic Testing): Tests execute within 2.3s total (<30s per test limit), using local temporary directories and SQLite WAL databases with clean teardown.
- **Residual Risk:**
  - 44 test files in `packages/core/test/` remain to be migrated in subsequent batches.
  - Task 4B and 5A parallel changes are in progress by their respective owners; this worker did NOT touch their files.

---

## 7. Remaining Inventory for Subsequent Batches

The remaining 44 files in `packages/core/test/` break down into the following logical migration batches:

1. **Subagents Lifecycle & Courier (9 files):**
   - `subagent-auto-spawn.test.ts`
   - `subagent-background-lookup.test.ts`
   - `subagent-cascading-abort.test.ts`
   - `subagent-courier-lifecycle.test.ts`
   - `subagent-error-handling.test.ts`
   - `subagent-foreground-record.test.ts`
   - `subagent-policy-error-handling.test.ts`
   - `subagent-watcher-lifecycle.test.ts`
   - `durable-1.4-courier.test.ts`
2. **Runtime Graph & Receipts (4 files):**
   - `runtime-graph-ownership.test.ts`
   - `runtime-graph-receipts.test.ts`
   - `runtime-graph-source.scenarios-2.test.ts`
   - `runtime-graph-source.test.ts`
3. **Codemode & Extensions (8 files):**
   - `builtin-extension-registry.test.ts`
   - `codemode-canonical-routines.test.ts`
   - `codemode-namespaces-contract.test.ts`
   - `codemode-nested-env.test.ts`
   - `codemode-sandbox-isolation.test.ts`
   - `extension-ui-context.test.ts`
   - `extension-user-message.test.ts`
   - `mcp-prompt-sync.test.ts`
4. **Runtime Bindings, Compaction, Daemon (8 files):**
   - `compaction-hooks.test.ts`
   - `compaction-settings.test.ts`
   - `conversation-id-types.test.ts`
   - `diagnostics-init-order.test.ts`
   - `durable-1.4-migration.test.ts`
   - `runtime-bindings.test.ts`
   - `runtime-cleanup.test.ts`
   - `watcher-compat.test.ts`
5. **Session Daemon & Commands (15 files):**
   - `admission-receipt.test.ts`
   - `before-resume.test.ts`
   - `canonical-command.test.ts`
   - `control-channel.test.ts`
   - `durable-engine-facade.test.ts`
   - `durable-subagent.test.ts`
   - `execution-env-strategy.test.ts`
   - `extension-cli-multi.test.ts`
   - `model-ref-normalization.test.ts`
   - `plugin-strategy-wiring.test.ts`
   - `runner-subagent-ack-restore.test.ts`
   - `runner-subagent-policy.test.ts`
   - `session-socket-daemon.test.ts`
   - `stdio-host-tool-call.test.ts`
   - `tool-context-preservation.test.ts`

---

## 8. Quiescence & Scope Statement

- **No git commits or pushes executed** (reserved for parent thread).
- **No shared ledger changes made** (`docs/arch-improvement/ledger.md` untouched).
- **No production code modified** (zero changes to `src/`).
- **No collision with parallel WIP:** Untouched 4B (`packages/protocol/*`, `packages/runner/src/dispatch/*`) and 5A (`packages/core/test/architecture-boundaries*`).
- **All Batch 1 artifacts committed to permanent project path:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/`.
- **System is in stable, testable state; worker is QUIESCED awaiting parent checkpoint.**
