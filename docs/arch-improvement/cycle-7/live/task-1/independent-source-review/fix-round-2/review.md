# Cycle 7 Task 1 (Slice 0): Independent Architecture & Spec Re-Review (Fix Round 2)

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `ad99873e396f7440a6896dabaf516b6393c08a37`  
**Prior Candidates:** `1298b479c5a6cf9087f7e01fc56325feb54a3dbd` (Round 1) / `fc0909602e7969df080259a2e2d4a7114be450b8` (Initial)  
**Remediation Artifact Under Audit:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-2/remediation-report.md`  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076), Cycle 7 Canonical Plan, Binding Rulings R1–R7  
**Artifact Directory:** `docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-2/`  
**Verdict:** **VERDICT: PASS** (All P0, P1, and P2 findings verified FIXED; only P3 maintainability observation FND-T1-09 remains triaged as `log-only`)

---

## 1. Candidate Source Inventory & Checksum Provenance

| Target File | SHA-256 Checksum | Architectural Status |
| :--- | :--- | :--- |
| `packages/core/src/session/coordinator.ts` | `92a8d8f8fb909c9269e7da07eb6c356d227c8e40b8e6a3c3ef35111c2f75d4ee` | Pure domain coordinator (clean constructor DI, abort FSM) |
| `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts` | `5dca4508cf41e02298c09d1da405b1b022db05054db12ddae7d30b5c49d7b230` | Event projector (clean block reconstruction, no stale refs) |
| `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts` | `34f251a5982deca8d5a74a4a145c5dd5abd670feeeeb4a841f24f73962c8cd4c` | Child event projector (per-block suffix catchup & turn isolation) |
| `packages/adapter-pi-durable/src/engine/bridge/assistant-message-builder.ts` | `e2f631be65eda07bdf8a6b15e587dce264e1008b8387f60d63dd628866fbffb0` | Multi-block sorted content builder |
| `packages/adapter-pi-durable/src/engine/bridge/turn-summary.ts` | `d0fa71a921fdd4c219ff166135632dae1c2c1265131e56e5cdee76422138d8e4` | Block-aware turn summary resolver |
| `packages/runner/src/composition.ts` | `dda2fe28f4421642620f355470e13add0c178f044e8030bed40604eda128b7c8` | Lazy native dependencies & safe teardown |
| `packages/runner/src/main.ts` | `0206232cff1f96112db804a620ddfffe6ab72a394431d9ae9b20698997e28411` | Stdin EOF/close bounded shutdown |
| `packages/cli/bin/durable-zero.js` | `dd470565bf3dc889deb7abfcba444b2b1589e5f9152349b339e9de509a0fb190` | Fail-fast run & doctor prototypes |
| `packages/runner/test/e2e-walking-skeleton.test.ts` | `8107f245ed6588aaae3e25215ec39ea50f62440010b44ec1063f3b9433b42013` | Verified transcript & order walking skeleton test |
| `packages/adapter-pi-durable/test/durable-child-event-adapter-catchup.test.ts` | `72a12ca14a9ca697185934da0afd8979fff9dca96fc7928a6ff2f3fea35c6a31` | Suffix catchup and turn isolation test suite |

---

## 2. Complete Finding & Blocker Adjudication Matrix

| Finding ID | Priority | Description | Verification Status | Source & Behavioral Evidence |
|---|---|---|---|---|
| **FND-T1-01** | **P1** | Sticky Abort in `SessionCoordinator` | **CLOSED (PASS)** | `this.isAborted` flag eliminated. `abort(conversationId)` delegates directly to `engine.abort(conversationId)` and emits `{ type: "session/aborted" }`. Subsequent prompts on the session succeed immediately; child conversation abort delegates to target conversation without affecting root. Tested via `session-abort-lifecycle.test.ts` and `probe-re-review.test.ts` (PROBE 1). |
| **FND-T1-02** | **P1** | Hardcoded `contentIndex: 0` in Event Adapter | **CLOSED (PASS)** | `durable-event-adapter.ts:113-128` extracts `change.contentIndex` and emits `assistantMessageEvent.contentIndex = idx`. `contentBlocks` Map preserves distinct text and thinking partials across multi-block generations. Tested via `durable-event-adapter-indices.test.ts`. |
| **FND-T1-03** | **P1** | Decorative Dependencies in `SessionCoordinator` | **CLOSED (PASS)** | `modelProvider`, `executionEnv`, and `resourceLoader` removed from `SessionCoordinatorOptions` and class constructor. Strict required shape `{ engine: IAgentEngine, sessionDir: string }` without unused injection fields. |
| **FND-T1-04** | **P2** | Incomplete Assertion Integrity in Walking Skeleton Test | **CLOSED (PASS)** | In `e2e-walking-skeleton.test.ts:314-368`, step 10 now enforces that streaming `text_delta` notifications arrive strictly before `turn_complete`, and step 11 asserts `session/getTranscript` contains distinct assistant entry with ID `"16"` (distinct from turn 1 ID `"12"`) and exact text `"Echo: Second turn"`. |
| **FND-T1-05** | **P2** | Double Disposal of Built-in Codemode Extension | **CLOSED (PASS)** | `assembleDurableZero` lazily creates native defaults (including `codemodeBuiltin`) only when `options.engine` is omitted. On normal close, `coordinator.close()` delegates to runtime teardown; `composition.ts` no longer calls redundant `codemodeBuiltin.teardown()`. On startup failure in `coordinator.start()`, a dedicated `catch` block invokes `codemodeBuiltin.teardown().catch(() => {})`. |
| **FND-T1-06** | **P2** | Stdio Server Stdin EOF / Close Handling | **CLOSED (PASS)** | `packages/runner/src/main.ts:33-38` attaches `process.stdin.once("end", () => void cleanup())` and `process.stdin.once("close", () => void cleanup())`. Triggers clean lifecycle shutdown (`instance.close()`) and clean process exit without mutating protocol owner files. |
| **FND-T1-07** | **P2** | Hollow CLI Command Prototypes (`run` / `doctor`) | **CLOSED (PASS)** | `packages/cli/bin/durable-zero.js:35-43` replaced fake success outputs with fail-fast `process.exit(1)` and explicit, truthful messages directing users to `serve`. Tested via `cli.test.ts`. |
| **FND-T1-08** | **P2** | Duplicate Store Lock in `SessionCoordinator` | **CLOSED (PASS)** | Removed `store` from `SessionCoordinatorOptions` and deleted `this.store.acquireLock()` / `releaseLock()`. The native engine solely owns the SQLite database and session lock. |
| **FND-T1-09** | **P3** | Split-Brain: Runner Inline Handler vs `SessionDispatcher` | **LOG-ONLY (P3)** | Tracked for runner composition integration once Task 4B is certified. Does not block Slice 0 walking skeleton execution. |
| **FND-T1-10** | **P2** | Child Event Adapter Duplicate Delta on Subsequent Turns | **CLOSED (PASS)** | In `durable-child-event-adapter.ts:125-160`, `message_end` now iterates `message.content` parts, compares each against `this.contentBlocks.get(i)`, and computes the missing suffix. If `suffix.length === 0` (text already streamed), zero duplicate deltas are emitted. If a throttled missing suffix remains, it emits only the delta at `contentIndex: i`. Clears `contentBlocks` on `message_end`, `turn_start`, and `run_end`. Verified via `probe-round-2.test.ts` (PROBE 1 & PROBE 2). |
| **FND-T1-11** | **P3** | Stale `currentText` Fallback in `DurableEventAdapter` | **CLOSED (PASS)** | In `durable-event-adapter.ts:153-183`, stale `this.currentText` fallback replaced with index-sorted block reconstruction from `this.contentBlocks`. All dynamic property assignments eliminated. Verified via `probe-round-2.test.ts` (PROBE 3). |

---

## 3. Mandatory Semantic Probes Status (Round 2)

1. **Dependency Traceability (AP-074, AP-076): PASS.**
   - All injected dependencies in `SessionCoordinator` are actively called across its execution methods.
   - All decorative constructor options (`modelProvider`, `executionEnv`, `resourceLoader`, `store`) are deleted.
   - `assembleDurableZero` does not instantiate unused native dependencies when custom `options.engine` is supplied.
2. **Runtime Completeness & Split-Brain Detection: PASS.**
   - `@durable-zero/core` is 100% free of `@earendil-works/*` packages and `node:fs` calls.
   - AST boundary guards pass 30/30 (`packages/core/test/architecture-boundaries.test.ts`).
   - Production runner handles `stdin` EOF and `close` events, guaranteeing clean shutdown without orphaned processes.
3. **Entry Point Wiring (AP-020, AP-075): PASS.**
   - `durable-zero serve` connects cleanly to the runner composition root and executes the full vertical slice.
   - `durable-zero doctor` and `run` fail fast truthfully with exit code 1.
4. **Anti-Gaming & Implementation Completeness (AP-019, AP-076): PASS.**
   - Synthetic `rec_...` admission receipt path is eliminated; real native SQLite submission and entry IDs are used throughout.
   - E2E walking skeleton test verifies genuine streaming order (deltas strictly before `turn_complete`), restart consistency, and exact distinct second reply text (`"Echo: Second turn"`).
   - Parent and child event adapters accurately project streaming deltas at their real `contentIndex` without index collapse or duplicate replays.

---

## 4. Architecture Verification

- **Passed Rules:**
  - `AP-010` (Modular Monolith & Ports/Adapters: clean pure domain).
  - `AP-011` (Low Coupling & High Cohesion: isolated domain coordinator).
  - `AP-012` (Fail-fast errors and proper turn abort semantics).
  - `AP-019` (File size limits observed).
  - `AP-020` (Composition root in runner).
  - `AP-021` (Thin entrypoints; child abort isolation).
  - `AP-023` (No floating promises; clean process and stream teardown on EOF/close).
  - `AP-025` (Strict import discipline verified by AST guards).
  - `AP-026` (Public DTO and event schema boundaries; real contentIndex preservation).
  - `AP-028` (Rigorous E2E test oracle with transcript readback and delta ordering).
  - `AP-029` (TypeScript strictness).
  - `AP-034` (Single physical lock ownership).
  - `AP-059` (Fail-fast prototype command boundaries).
  - `AP-074` (Explicit DI without decorative constructor injection).
  - `AP-075` (Walking skeleton vertical slice connects CLI, stdio JSON-RPC, coordinator, engine, and SQLite WAL).
  - `AP-076` (Assertion integrity: second turn transcript content verified; child suffix catchup verified).
- **Violated Rules:** None.
- **Not Applicable:**
  - `AP-051–AP-055` (Frontend / React architecture).
  - `AP-060, AP-062` (Postgres OLTP guardrails).
- **Residual Integration Risks:**
  1. *Legacy Test Migration:* Tracked separately under `task-1-test-migration`. Does not block Slice 0 source architecture.
  2. *Dispatcher Integration:* Task 4B dispatcher component is certified and awaiting runner composition integration.
  3. *Host Bridge Integration:* Task 2A component `HostBridge` remains unmounted in the engine pending full Task 2 wiring.

---

## 5. Summary & Verdict

**VERDICT: PASS**

The Task 1 / Slice 0 source architecture candidate `ad99873e396f7440a6896dabaf516b6393c08a37` satisfies all architectural invariants under AP-010 through AP-076. All 10 discrete defects identified across initial review and Fix Round 1 are verified resolved with empirical behavioral receipts.

All empirical receipts, JUnit reports, and probe tests are preserved in:
- [`review.md`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-2/review.md)
- [`findings.json`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-2/findings.json)
- [`probe-round-2.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-2/probe-round-2.junit.xml)
- [`probe-round-2.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-2/probe-round-2.test.ts)

Quiesced for parent checkpoint and push.
