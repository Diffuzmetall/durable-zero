# Cycle 7 Task 1 Consumer Test Migration — Checkpoint Report (Batches 1, 2, 3 & 4)

**Date:** November 5, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Base Commit:** `11a7fe4d`  
**Role:** Bounded implementer for REQUIRED residual Task 1 consumer/test migration  
**Status:** **BATCH 4 MIGRATED & GREEN — QUIESCED FOR IMMEDIATE PARENT CHECKPOINT & BACKUP**

---

## 1. Executive Summary

Following parent instruction and the Cycle 7 sovereign core decoupling plan, atomic relocation of native runtime closures from `@durable-zero/core` to `@durable-zero/adapter-pi-durable` required migrating test consumers broken by missing modules (`ERR_MODULE_NOT_FOUND`). Leaving broken imports in Core was rejected as unacceptable.

- **Batch 1 (Committed & Pushed at `0d1195b`):** 11 test suites migrated (Storage, Locking, Event Projection, Envelopes).
- **Batch 2 (Committed & Pushed at `81526c6`):** 10 test suites migrated (Runtime Graph & Ownership, Receipts, Compaction Hooks & Settings, Conversation IDs, Task Labels, Runtime Cleanup, Watcher Compat).
- **Batch 3 (Committed & Pushed at `11a7fe4d`):** 10 test suites migrated (Subagents Lifecycle, Courier, Background Lookup, Cascading Abort, Watcher Lifecycle, Durable 1.4 Courier, ACK Restore).
- **Batch 4 (Delivered in this Checkpoint):** 10 test suites migrated (Builtin Extension Registry, Codemode Namespaces Contract, Codemode Nested Env, Extension UI Context, Extension User Message, MCP Prompt Sync, Model Ref Normalization, Tool Context Preservation, Durable Subagent, Execution Envs Strategy).

A total of **41 native test suites** have now been cleanly relocated from `packages/core/test/` to `packages/adapter-pi-durable/test/`. All cross-package private imports have been eliminated, Core purity is maintained (AP-010, AP-025), and 100% of existing assertions and test semantics are preserved without skips, stubs, or altered expectations.

All 44 test files in `packages/adapter-pi-durable/test/` (**113 tests total**) pass cleanly in ~3.7–5.8 seconds with zero failures and zero skipped tests.

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

### Batch 3 (Preserved in `11a7fe4d`)
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

### Batch 4 (This Checkpoint)
| # | Original Location (`packages/core/test/`) | Target Location (`packages/adapter-pi-durable/test/`) | Migrated Modules Imported | Collisions / Special Handling | Tests Count |
|---|---|---|---|---|---|
| 32 | `builtin-extension-registry.test.ts` | `builtin-extension-registry.test.ts` | `../src/engine/builtin-extensions/registry.ts`, `../src/engine/builtin-extensions/types.ts`, `../src/engine/shared/errors.ts` | None | 3 |
| 33 | `codemode-namespaces-contract.test.ts` | `codemode-namespaces-contract.test.ts` | `../src/engine/codemode-namespaces.ts` | None | 2 |
| 34 | `codemode-nested-env.test.ts` | `codemode-nested-env.test.ts` | `../src/engine/extension-mount.ts`, `../src/engine/extension-bridge.ts`, `../src/engine/tool-adapter.ts` | None | 2 |
| 35 | `extension-ui-context.test.ts` | `extension-ui-context.test.ts` | `../src/engine/extension-bridge.ts` | None | 1 |
| 36 | `extension-user-message.test.ts` | `extension-user-message.test.ts` | `../src/engine/extension-bridge.ts` | None | 1 |
| 37 | `mcp-prompt-sync.test.ts` | `mcp-prompt-sync.test.ts` | `../src/engine/prompt.ts`, `../src/engine/extension-mount.ts` | None | 2 |
| 38 | `model-ref-normalization.test.ts` | `model-ref-normalization.test.ts` | `../src/engine/shared/model-ref.ts` | None | 3 |
| 39 | `tool-context-preservation.test.ts` | `tool-context-preservation.test.ts` | `../src/engine/tool-adapter.ts` | None | 1 |
| 40 | `durable-subagent.test.ts` | `durable-subagent.test.ts` | `../src/engine/harness-setup.ts` | None | 1 |
| 41 | `execution-env-strategy.test.ts` | `execution-env-strategy.test.ts` | `../src/engine/harness-setup.ts`, `../src/engine/runtime.ts`, `@durable-zero/core` | None | 3 |
| | **Pre-existing in Adapter** | `watch-events-compat.test.ts` | `../src/engine/bridge/watch-events-compat.ts` | Preserved untouched (author's streaming regression) | 1 |
| | **Pre-existing in Adapter** | `sqlite-storage.test.ts` | `../src/index.ts` | Preserved untouched | 1 |
| | **Pre-existing in Adapter** | `durable-event-adapter-indices.test.ts` | `../src/engine/bridge/durable-event-adapter.ts` | Preserved untouched | 1 |
| | **TOTAL IN ADAPTER TEST** | | | | **113 tests** |

---

## 4. Verification Receipts

### 4.1. Adapter Test Suite Run (All 44 files, 113 tests)
- **Command:** `node --test packages/adapter-pi-durable/test/*.test.ts`
- **Exit Code:** `0`
- **Duration:** 5798ms (~5.8s)
- **Raw Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-4.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/batch-4.junit.xml`
- **Summary:** `113 tests, 7 suites, 113 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo`

---

## 5. Source Hash Verification (SHA256)

### Batch 4 Files
```text
150715bf7f984fa7a7830993f5d3d9b8db8e947ec93c3e2113ed99c1b5c5d3ee  packages/adapter-pi-durable/test/builtin-extension-registry.test.ts
5d1a6efd9379683d426c9c0ed81ac6c7d4d38ad617d301d783dac32a86e9b98c  packages/adapter-pi-durable/test/codemode-namespaces-contract.test.ts
fac98d3120f96785b31dbe7784552211fbb3f8a438010ef362de993250de415e  packages/adapter-pi-durable/test/extension-ui-context.test.ts
cb1c0449693d1cd0048a8c9da146d9ecb5cca7be44a578c77be3d30a67f8e363  packages/adapter-pi-durable/test/extension-user-message.test.ts
266ad6f03de710fb6180ec3173020329f6f0c0a8b0d6217768572958cc623f9e  packages/adapter-pi-durable/test/mcp-prompt-sync.test.ts
70ff6251596ea4291b96ee08b044a07b0d5fb42725f2abfb4f3324083141ab9e  packages/adapter-pi-durable/test/model-ref-normalization.test.ts
54d3364c8f5a6bcdb716c5a4fc72991e21c86d5bd153308fb4cdee90709e574a  packages/adapter-pi-durable/test/tool-context-preservation.test.ts
74fc64037b929e05bfb87236d41cc915da876ee345edde69003232f589ff6a8d  packages/adapter-pi-durable/test/durable-subagent.test.ts
38f352fe86c30e770df783c2f401ec54f79cf8e4ec0bc7b77eeab88ee58a7203  packages/adapter-pi-durable/test/execution-env-strategy.test.ts
f65c18b84ae669e3294a10c35b199e749b333475978880d052a9406eeb0dbed5  packages/adapter-pi-durable/test/codemode-nested-env.test.ts
```

---

## 6. Findings and Architectural Review

[P2] Evidence: In `packages/core/test/codemode-canonical-routines.test.ts:137`, the test expects `createCodingRegistry` to install the `codemode` tool by default. In Cycle 7, `createCodemodeBuiltinExtension` was decoupled into `@durable-zero/adapter-codemode` to prevent `@durable-zero/adapter-pi-durable` from depending on codemode, and builtin extensions are injected via `PiRuntimeDependencies.builtins`. Impact: Running `createCodingRegistry` without `customBuiltins` does not install codemode. Rule: AP-010 (Hexagonal Boundaries), AP-020 (Clean Architecture & Boundaries). Fix decision: Kept `codemode-canonical-routines.test.ts` in `packages/core/test/` pending parent ruling whether it belongs in `packages/runner/test/` (where composition root wires builtins) or should receive a mock builtin extension in adapter test.

### Architecture Verification Scoped
- **Passed:**
  - AP-010 (Modular Monolith / Ports & Adapters): Relocated native codemode/extension integration tests into `@durable-zero/adapter-pi-durable` without introducing illegal reverse coupling to `@durable-zero/adapter-codemode`.
  - AP-020 (Clean Architecture Boundaries): Pure domain contracts and SPI ports consumed cleanly; no illegal vendor or adapter imports in Core.
  - AP-025 (Import Discipline): All migrated test files resolve imports strictly from local relative paths (`../src/engine/...`) or declared public workspace packages (`@durable-zero/core`, `@durable-zero/contracts`).
  - AP-028 (Deterministic Testing): 113 tests execute in ~3.7–5.8s total (<30s per test limit), using local in-memory or temporary resources with clean teardown.
- **Residual Risk:**
  - 14 test files in `packages/core/test/` remain to be migrated in the final batch.
  - Task 4B, Task 5A, and native source author concurrent work are in progress by their respective owners; this worker did NOT touch their files.

---

## 7. Exact Remaining Inventory for Final Closure (14 Files in `packages/core/test/`)

The exact remaining 14 files in `packages/core/test/` with broken imports:

1. `admission-receipt.test.ts` (imports `../src/runtime-types.ts`, `../src/runtime.ts`)
2. `before-resume.test.ts` (imports `../src/runtime.ts`)
3. `canonical-command.test.ts` (imports `../src/session-commands.ts`, `../src/subagent-policy-state.ts`)
4. `codemode-canonical-routines.test.ts` (imports `../src/codemode-namespaces.ts`, `../src/harness-setup.ts`)
5. `codemode-sandbox-isolation.test.ts` (imports `../src/builtin-extensions/types.ts` - note: duplicated by `packages/adapter-codemode/test/codemode.test.ts`)
6. `control-channel.test.ts` (imports `../src/control-channel.ts`, `../src/runtime-types.ts`)
7. `durable-1.4-migration.test.ts` (imports `../src/conversation-id.ts`, uses fixtures in `./fixtures/`)
8. `durable-engine-facade.test.ts` (imports `../src/engine.ts`)
9. `extension-cli-multi.test.ts` (imports `../src/cli-args.ts`)
10. `plugin-strategy-wiring.test.ts` (imports `../src/harness-setup.ts`, `../src/plugins/types.ts`)
11. `runner-subagent-policy.test.ts` (imports `../src/conversation-id.ts`, `../src/session-commands.ts`, `../src/subagent-policy-ack.ts`, `../src/subagent-policy-state.ts`)
12. `runtime-bindings.test.ts` (imports `../src/runtime-bindings.ts`, `../src/runtime-types.ts`, uses `./fixtures/runtime-state.ts`)
13. `session-socket-daemon.test.ts` (imports `../src/session-daemon.ts`)
14. `stdio-host-tool-call.test.ts` (imports `../src/host-rpc.ts`)

---

## 8. Quiescence & Scope Statement

- **No git commits or pushes executed** (reserved for parent thread).
- **No shared ledger changes made** (`docs/arch-improvement/ledger.md` untouched).
- **No production code modified** (zero changes to `src/`).
- **No collision with parallel WIP:** Untouched 4B (`packages/protocol/*`, `packages/runner/src/dispatch/*`), 5A (`packages/core/test/architecture-boundaries*`), and native source author concurrent work (`packages/core/src/session/coordinator.ts`, `pure-domain-coordinator.test.ts`, `session-abort-lifecycle.test.ts`).
- **All Batch 4 artifacts committed to permanent project path:** `docs/arch-improvement/cycle-7/live/task-1-test-migration/`.
- **System is in stable, testable state; worker is QUIESCED awaiting parent checkpoint.**
