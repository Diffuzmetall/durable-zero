# Cycle 7 Task 1 Consumer Test Migration — Checkpoint Report (Batches 1 & 2)

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Base Commit:** `0d1195bbedb338db9b8e980d12940d2ddf3076b0`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **BATCH 2 MIGRATED & GREEN — QUIESCED FOR IMMEDIATE PARENT CHECKPOINT & BACKUP**

---

## 1. Executive Summary

Following parent instruction and the Cycle 7 sovereign core decoupling plan, atomic relocation of native runtime closures from `@durable-zero/core` to `@durable-zero/adapter-pi-durable` required migrating test consumers that were broken by missing modules (`ERR_MODULE_NOT_FOUND`). Leaving broken imports in Core was rejected as unacceptable.

- **Batch 1 (Committed & Pushed at `0d1195b`):** 11 test suites migrated (Storage, Locking, Event Projection, Envelopes).
- **Batch 2 (Delivered in this Checkpoint):** 10 test suites migrated (Runtime Graph & Ownership, Receipts, Compaction Hooks & Settings, Conversation IDs, Task Labels, Runtime Cleanup, Watcher Compat).

A total of **21 native test suites** have now been cleanly relocated from `packages/core/test/` to `packages/adapter-pi-durable/test/`. All cross-package private imports have been eliminated, Core purity is maintained (AP-010, AP-025), and 100% of existing assertions and test semantics are preserved without skips, stubs, or altered expectations.

All 23 test files in `packages/adapter-pi-durable/test/` (**71 tests total**) pass cleanly in ~2.6 seconds with zero failures and zero skipped tests. The native walking skeleton (`e2e-walking-skeleton.test.ts`, 12 tests) remains 100% green and verified.

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

### Batch 2 (This Checkpoint)
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
| | **Pre-existing in Adapter** | `watch-events-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts` | Preserved untouched (author's streaming regression) | 1 |
| | **Pre-existing in Adapter** | `sqlite-storage.test.ts` | `../src/index.ts` | Preserved untouched | 1 |
| | **TOTAL IN ADAPTER TEST** | | | | **71 tests** |

---

## 4. Verification Receipts

### 4.1. Adapter Test Suite Run (All 23 files, 71 tests)
- **Command:** `node --test packages/adapter-pi-durable/test/*.test.ts`
- **Exit Code:** `0`
- **Duration:** 2651ms (~2.6s)
- **Raw Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-2.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-2.junit.xml`
- **Summary:** `71 tests, 3 suites, 71 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`

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
- **Duration:** 8451ms
- **Summary:** `12 tests, 2 suites, 12 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`
- **Proof:** CLI JSON-RPC prompt streaming, persistence, and restart work end-to-end against real compiled binaries.

---

## 5. Source Hash Verification (SHA256)

### Batch 2 Files
```text
5f10925e5511b5ce656f890e2eef6345ba5490fd9358ba11ff65289ba69d77f6  packages/adapter-pi-durable/test/runtime-graph-ownership.test.ts
367e56af6d49711eff26f77571147cbe6c536b741764f2e44c34fc1a839dfbba  packages/adapter-pi-durable/test/runtime-graph-receipts.test.ts
48d19e974b1060a8ba406df3c376f063283358b8fbeb3f1f55f2c5cc966c35ae  packages/adapter-pi-durable/test/runtime-graph-source.test.ts
15399147308c02aabc2f0687604060d462c86eeaca25a7ba14675ede19a9855c  packages/adapter-pi-durable/test/runtime-graph-source.scenarios-2.test.ts
7c5ffc3535872e3ffe70505feb0316bd188b6c47b67325dd3924dc5a81a60458  packages/adapter-pi-durable/test/compaction-hooks.test.ts
f7ce6d4a058826c89a9ea4c3760af663064c8e11929568e7eabc210abaf83fd0  packages/adapter-pi-durable/test/compaction-settings.test.ts
20bfe16588c248fe9fb7435d37f9913800e35d534117ed28904f9b9995c73527  packages/adapter-pi-durable/test/conversation-id-types.test.ts
1c763fe43cb041fde35dc556f749340d88123318452ff16c49ca153711cfd4d9  packages/adapter-pi-durable/test/diagnostics-init-order.test.ts
f60540960a2ac8763f962e4e7c739bdff2a9c1bdc6382121e4ed7a2719782b78  packages/adapter-pi-durable/test/runtime-cleanup.test.ts
f1a7477adc5cc5cf40e64fc6d6269fe151860e5d3a52b9f0a2f73e6c1081d712  packages/adapter-pi-durable/test/watcher-compat.test.ts
```

---

## 6. Findings and Architectural Review

[P2] Evidence: 34 remaining test files in `packages/core/test/` still carry broken imports referencing relocated modules (`../src/subagent.ts`, `../src/runtime-controller.ts`, `../src/builtin-extensions/*`, etc.). Impact: Full workspace `npm test` fails fast on module resolution before reaching test execution in un-migrated suites. Rule: AP-010 (Hexagonal Boundaries), AP-025 (Import Discipline), AP-028 (Testing Strategy). Fix decision: Continue systematic subsystem migration (Batch 3: Subagent Lifecycle & Courier; Batch 4: Codemode & Extensions; Batch 5: Commands & Session Daemon) into `packages/adapter-pi-durable/test/`.

### Architecture Verification Scoped
- **Passed:**
  - AP-010 (Modular Monolith / Ports & Adapters): Relocated native graph, compaction, and lifecycle tests into `@durable-zero/adapter-pi-durable` without introducing private cross-package coupling.
  - AP-020 (Clean Architecture & Boundaries): Pure domain contracts and SPI ports consumed cleanly; no illegal vendor or adapter imports in Core.
  - AP-025 (Import Discipline): All migrated test files resolve imports strictly from local relative paths (`../src/engine/...`) or declared public workspace packages (`@durable-zero/contracts`).
  - AP-028 (Deterministic Testing): 71 tests execute in 2.65s total (<30s per test limit), using local in-memory or temporary resources with clean teardown.
- **Residual Risk:**
  - 34 test files in `packages/core/test/` remain to be migrated in subsequent batches.
  - Task 4B and 5A parallel changes are in progress by their respective owners; this worker did NOT touch their files.

---

## 7. Remaining Inventory for Subsequent Batches (34 Files)

1. **Subagents Lifecycle & Courier (8 files):**
   - `subagent-auto-spawn.test.ts`
   - `subagent-background-lookup.test.ts`
   - `subagent-cascading-abort.test.ts`
   - `subagent-courier-lifecycle.test.ts`
   - `subagent-error-handling.test.ts`
   - `subagent-foreground-record.test.ts`
   - `subagent-policy-error-handling.test.ts`
   - `subagent-watcher-lifecycle.test.ts`
2. **Durable 1.4 Migration & Courier (2 files):**
   - `durable-1.4-courier.test.ts`
   - `durable-1.4-migration.test.ts`
3. **Codemode & Builtin Extensions (8 files):**
   - `builtin-extension-registry.test.ts`
   - `codemode-canonical-routines.test.ts`
   - `codemode-namespaces-contract.test.ts`
   - `codemode-nested-env.test.ts`
   - `codemode-sandbox-isolation.test.ts`
   - `extension-ui-context.test.ts`
   - `extension-user-message.test.ts`
   - `mcp-prompt-sync.test.ts`
4. **Runtime Bindings & State (1 file):**
   - `runtime-bindings.test.ts`
5. **Session Daemon, Engine Facade & Commands (15 files):**
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
- **All Batch 2 artifacts committed to permanent project path:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/`.
- **System is in stable, testable state; worker is QUIESCED awaiting parent checkpoint.**
