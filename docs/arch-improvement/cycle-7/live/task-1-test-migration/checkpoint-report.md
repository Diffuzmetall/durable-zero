# Cycle 7 Task 1 Consumer Test Migration — Checkpoint Report (Batches 1, 2 & 3)

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Base Commit:** `81526c64cf5c0b5fcc9f2a12de72f3ab65177161`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **BATCH 3 MIGRATED & GREEN — QUIESCED FOR IMMEDIATE PARENT CHECKPOINT & BACKUP**

---

## 1. Executive Summary

Following parent instruction and the Cycle 7 sovereign core decoupling plan, atomic relocation of native runtime closures from `@durable-zero/core` to `@durable-zero/adapter-pi-durable` required migrating test consumers that were broken by missing modules (`ERR_MODULE_NOT_FOUND`). Leaving broken imports in Core was rejected as unacceptable.

- **Batch 1 (Committed & Pushed at `0d1195b`):** 11 test suites migrated (Storage, Locking, Event Projection, Envelopes).
- **Batch 2 (Committed & Pushed at `81526c6`):** 10 test suites migrated (Runtime Graph & Ownership, Receipts, Compaction Hooks & Settings, Conversation IDs, Task Labels, Runtime Cleanup, Watcher Compat).
- **Batch 3 (Delivered in this Checkpoint):** 10 test suites migrated (Subagents Lifecycle, Courier, Background Lookup, Cascading Abort, Watcher Lifecycle, Durable 1.4 Courier, ACK Restore).

A total of **31 native test suites** have now been cleanly relocated from `packages/core/test/` to `packages/adapter-pi-durable/test/`. All cross-package private imports have been eliminated, Core purity is maintained (AP-010, AP-025), and 100% of existing assertions and test semantics are preserved without skips, stubs, or altered expectations.

All 34 test files in `packages/adapter-pi-durable/test/` (**91 tests total**) pass cleanly in ~2.6–4.2 seconds with zero failures and zero skipped tests.

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

---

## 3. Migration Inventory & From $\to$ To Mapping

### Batch 1 (Preserved in `0d1195b`)
| # | Original Location (`packages/core/test/`) | Target Location (`packages/adapter-pi-durable/test/`) | Migrated Modules Imported | Collisions / Special Handling | Tests Count |
|---|---|---|---|---|---|
| 1 | `session-fork.test.ts` | `session-fork.test.ts` | `../src/index.ts` (`forkSessionDatabase`) | None | 1 |
| 2 | `session-lock-eviction.test.ts` | `session-lock-eviction.test.ts` | `../src/index.ts` (`selectSession`, `isProcessAlive`, `SessionOwnerInfo`) | None | 5 |
| 3 | `session-storage-errors.test.ts` | `session-storage-errors.test.ts` | `../src/index.ts` (`isProcessAlive`) | None | 1 |
| 4 | `session-storage-pid-safety.test.ts` | `session-storage-pid-safety.test.ts` | `../src/index.ts` (`isVerifiedRunnerProcess`) | None | 4 |
| 5 | `view-stream-projector.test.ts` | `view-stream-projector.test.ts` | `../src/engine/bridge/view-stream-projector.ts`, `../src/engine/bridge/contracts.ts` | None | 2 |
| 6 | `child-native-batch-outcome.test.ts` | `child-native-batch-outcome.test.ts` | `../src/engine/bridge/durable-child-event-adapter.ts`, `../src/engine/bridge/contracts.ts` | None | 4 |
| 7 | `tool-result-routing.test.ts` | `tool-result-routing.test.ts` | `../src/engine/bridge/durable-event-adapter.ts`, `../src/engine/bridge/durable-child-event-adapter.ts`, `../src/engine/bridge/native-tool-result.ts` | None | 5 |
| 8 | `watch-events-compat.test.ts` | `watch-events-tools-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts`, `../src/engine/bridge/durable-contracts.ts` | Renamed to avoid colliding with author's new test | 2 |
| 9 | `subagent-envelope.test.ts` | `subagent-envelope.test.ts` | `../src/engine/shared/subagent-envelope.ts` | None | 8 |
| 10 | `subagent-envelope-generic.test.ts` | `subagent-envelope-generic.test.ts` | `../src/engine/shared/subagent-envelope.ts` | None | 2 |
| 11 | `subagent-async-envelope.test.ts` | `subagent-async-envelope.test.ts` | `../src/engine/subagent-role.ts`, `../src/engine/subagent.ts` | None | 5 |

### Batch 2 (Preserved in `81526c6`)
| # | Original Location (`packages/core/test/`) | Target Location (`packages/adapter-pi-durable/test/`) | Migrated Modules Imported | Collisions / Special Handling | Tests Count |
|---|---|---|---|---|---|
| 12 | `runtime-graph-ownership.test.ts` | `runtime-graph-ownership.test.ts` | `../src/engine/runtime-graph-scope.ts`, `@durable-zero/contracts` | None | 5 |
| 13 | `runtime-graph-receipts.test.ts` | `runtime-graph-receipts.test.ts` | `../src/engine/runtime-graph-receipts.ts`, `@earendil-works/pi-durable` | None | 6 |
| 14 | `runtime-graph-source.test.ts` | `runtime-graph-source.test.ts` | `../src/engine/runtime-graph-source.ts`, `@durable-zero/contracts` | None | 4 |
| 15 | `runtime-graph-source.scenarios-2.test.ts` | `runtime-graph-source.scenarios-2.test.ts` | `../src/engine/runtime-graph-source.ts`, `@durable-zero/contracts` | None | 3 |
| 16 | `compaction-hooks.test.ts` | `compaction-hooks.test.ts` | `../src/engine/compaction-hooks.ts`, `../src/engine/runtime-controller.ts` | Source file inspection path updated to `engine/` | 3 |
| 17 | `compaction-settings.test.ts` | `compaction-settings.test.ts` | `../src/engine/harness-setup.ts`, `@earendil-works/pi-coding-agent` | None | 3 |
| 18 | `conversation-id-types.test.ts` | `conversation-id-types.test.ts` | `../src/engine/conversation-id.ts`, `@earendil-works/pi-durable` | None | 2 |
| 19 | `diagnostics-init-order.test.ts` | `diagnostics-init-order.test.ts` | `../src/engine/task-labels.ts` | None | 1 |
| 20 | `runtime-cleanup.test.ts` | `runtime-cleanup.test.ts` | `../src/engine/runtime-cleanup.ts` | None | 1 |
| 21 | `watcher-compat.test.ts` | `watcher-compat.test.ts` | `../src/engine/watcher-compat.ts` | None | 2 |

### Batch 3 (This Checkpoint)
| # | Original Location (`packages/core/test/`) | Target Location (`packages/adapter-pi-durable/test/`) | Migrated Modules Imported | Collisions / Special Handling | Tests Count |
|---|---|---|---|---|---|
| 22 | `subagent-auto-spawn.test.ts` | `subagent-auto-spawn.test.ts` | `../src/engine/subagent.ts` | None | 2 |
| 23 | `subagent-background-lookup.test.ts` | `subagent-background-lookup.test.ts` | `../src/engine/subagent.ts`, `../src/engine/subagent-docs.ts`, `../src/engine/subagent-delivery.ts` | None | 1 |
| 24 | `subagent-cascading-abort.test.ts` | `subagent-cascading-abort.test.ts` | `../src/engine/runtime-controller.ts`, `../src/engine/subagent-docs.ts` | None | 2 |
| 25 | `subagent-courier-lifecycle.test.ts` | `subagent-courier-lifecycle.test.ts` | `../src/engine/subagent-courier.ts` | None | 2 |
| 26 | `subagent-error-handling.test.ts` | `subagent-error-handling.test.ts` | `../src/engine/subagent.ts` | None | 1 |
| 27 | `subagent-foreground-record.test.ts` | `subagent-foreground-record.test.ts` | `../src/engine/subagent.ts`, `../src/engine/subagent-docs.ts`, `../src/engine/subagent-delivery.ts`, `@durable-zero/core` | None | 2 |
| 28 | `subagent-policy-error-handling.test.ts` | `subagent-policy-error-handling.test.ts` | `../src/engine/subagent.ts`, `@durable-zero/core` | None | 2 |
| 29 | `subagent-watcher-lifecycle.test.ts` | `subagent-watcher-lifecycle.test.ts` | `../src/engine/subagent-watcher.ts`, `../src/engine/bridge/durable-event-adapter.ts`, `../src/engine/binding-docs.ts`, `../src/engine/subagent-docs.ts` | None | 2 |
| 30 | `durable-1.4-courier.test.ts` | `durable-1.4-courier.test.ts` | `../src/engine/subagent-delivery.ts`, `../src/engine/subagent-docs.ts` | None | 3 |
| 31 | `runner-subagent-ack-restore.test.ts` | `runner-subagent-ack-restore.test.ts` | `../src/engine/subagent-policy-ack.ts`, `@durable-zero/core` | None | 2 |
| | **Pre-existing in Adapter** | `watch-events-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts` | Preserved untouched (author's streaming regression) | 1 |
| | **Pre-existing in Adapter** | `sqlite-storage.test.ts` | `../src/index.ts` | Preserved untouched | 1 |
| | **Pre-existing in Adapter** | `durable-event-adapter-indices.test.ts` | `../src/engine/bridge/durable-event-adapter.ts` | Preserved untouched | 1 |
| | **TOTAL IN ADAPTER TEST** | | | | **91 tests** |

---

## 4. Verification Receipts

### 4.1. Adapter Test Suite Run (All 34 files, 91 tests)
- **Command:** `node --test packages/adapter-pi-durable/test/*.test.ts`
- **Exit Code:** `0`
- **Duration:** 4227ms (~4.2s)
- **Raw Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-3.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-3.junit.xml`
- **Summary:** `91 tests, 4 suites, 91 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`

---

## 5. Source Hash Verification (SHA256)

### Batch 3 Files
```text
368df1e4832ed65e082b377bd7515bb2c3725c54b59b7680c5852ce95a3634c2  packages/adapter-pi-durable/test/subagent-auto-spawn.test.ts
953edfb80d1f3951408d661842e9f16cf7c9c9067cd34eb000d3073a334f4068  packages/adapter-pi-durable/test/subagent-background-lookup.test.ts
6ea0689468786c17a2a0ff69d7cd99e5c2d39d326b4269637253378a10948580  packages/adapter-pi-durable/test/subagent-cascading-abort.test.ts
91f403edbbb29d174b2928e81948730943614a9c1b331f090ef10c315f2f3ef5  packages/adapter-pi-durable/test/subagent-courier-lifecycle.test.ts
fd81288a16175cb656a625a362cd9ce10629eb05776ad59a71622021ec73d294  packages/adapter-pi-durable/test/subagent-error-handling.test.ts
306fee2f25e093666af810cb9cb5584cbbba0432a03005e80b6cf2def8d10d63  packages/adapter-pi-durable/test/subagent-foreground-record.test.ts
2f95e247426fa88a49e233d61868e451d102626e0c74abe829edbb85e6ee00c2  packages/adapter-pi-durable/test/subagent-policy-error-handling.test.ts
1fd09c31299adb177e46ee4026c28d984a6ebe929c9ed11d95713e7c17718b61  packages/adapter-pi-durable/test/subagent-watcher-lifecycle.test.ts
7506dbfd5aff914d6d6bee5527a269466188f7383c649c0c5c71f286bed93550  packages/adapter-pi-durable/test/durable-1.4-courier.test.ts
9ddeea953b312344eb88e8b936a6489004ed983ddc095e36cfc4c6e8ea3d9b16  packages/adapter-pi-durable/test/runner-subagent-ack-restore.test.ts
```

---

## 6. Findings and Architectural Review

[P2] Evidence: 24 remaining test files in `packages/core/test/` still carry broken imports referencing relocated modules (`../src/builtin-extensions/*`, `../src/extension-mount.ts`, `../src/session-daemon.ts`, `../src/session-commands.ts`). Impact: Full workspace `npm test` fails fast on module resolution before reaching test execution in un-migrated suites. Rule: AP-010 (Hexagonal Boundaries), AP-025 (Import Discipline), AP-028 (Testing Strategy). Fix decision: Complete migration in two final finite batches: Batch 4 (Codemode, Extensions, Bindings, 9 files) and Batch 5 (Session Commands, Daemon, Transport, 15 files).

### Architecture Verification Scoped
- **Passed:**
  - AP-010 (Modular Monolith / Ports & Adapters): Relocated native subagent, courier, and watcher lifecycle tests into `@durable-zero/adapter-pi-durable` without introducing private cross-package coupling.
  - AP-020 (Clean Architecture & Boundaries): Pure domain contracts and SPI ports consumed cleanly; no illegal vendor or adapter imports in Core.
  - AP-025 (Import Discipline): All migrated test files resolve imports strictly from local relative paths (`../src/engine/...`) or declared public workspace packages (`@durable-zero/contracts`, `@durable-zero/core`).
  - AP-028 (Deterministic Testing): 91 tests execute in ~4.2s total (<30s per test limit), using local in-memory or temporary resources with clean teardown.
- **Residual Risk:**
  - 24 test files in `packages/core/test/` remain to be migrated in subsequent batches.
  - Task 4B and 5A parallel changes are in progress by their respective owners; this worker did NOT touch their files.

---

## 7. Exact Remaining Inventory for Completion (24 Files)

To make completion finite and predictable, the exact remaining 24 files in `packages/core/test/` break down into:

1. **Codemode & Builtin Extensions (8 files):**
   - `builtin-extension-registry.test.ts`
   - `codemode-canonical-routines.test.ts`
   - `codemode-namespaces-contract.test.ts`
   - `codemode-nested-env.test.ts`
   - `codemode-sandbox-isolation.test.ts`
   - `extension-ui-context.test.ts`
   - `extension-user-message.test.ts`
   - `mcp-prompt-sync.test.ts`
2. **Durable 1.4 Migration & Bindings (2 files):**
   - `durable-1.4-migration.test.ts`
   - `runtime-bindings.test.ts`
3. **Session Daemon, Engine Facade, Strategies & Commands (14 files):**
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
   - `runner-subagent-policy.test.ts`
   - `session-socket-daemon.test.ts`
   - `stdio-host-tool-call.test.ts`
   - `tool-context-preservation.test.ts`

---

## 8. Quiescence & Scope Statement

- **No git commits or pushes executed** (reserved for parent thread).
- **No shared ledger changes made** (`docs/arch-improvement/ledger.md` untouched).
- **No production code modified** (zero changes to `src/`).
- **No collision with parallel WIP:** Untouched 4B (`packages/protocol/*`, `packages/runner/src/dispatch/*`), 5A (`packages/core/test/architecture-boundaries*`), and original native author (`packages/core/src/session/coordinator.ts`, `pure-domain-coordinator.test.ts`).
- **All Batch 3 artifacts committed to permanent project path:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/`.
- **System is in stable, testable state; worker is QUIESCED awaiting parent checkpoint.**
