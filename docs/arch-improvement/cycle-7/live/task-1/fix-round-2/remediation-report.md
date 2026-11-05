# Cycle 7 Task 1 Remediation Round 2: Child Catchup & ContentIndex Alignment

**Date:** November 4, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Review Target:** `1298b479c5a6cf9087f7e01fc56325feb54a3dbd`  
**Finding Remediated:** `FND-T1-10` (P2) & `FND-T1-11` (P3)  
**Status:** **REMEDIATED & GREEN (Quiesced for Parent Backup)**  

---

## 1. Defect Root Cause & Analysis

1. **FND-T1-10 (DurableChildEventAdapter duplicate full-text delta on turn 2):**
   - In `DurableChildEventAdapter`, `currentText` was removed in favor of `contentBlocks: Map<number, Block>`.
   - However, in `case "message_end"`, the code still checked:
     ```typescript
     if (fullText.startsWith(this.currentText) && fullText.length > this.currentText.length)
     ```
   - At the end of turn 1, `this.currentText = ""` was assigned dynamically to the instance.
   - On turn 2, because `this.currentText` was never updated during `message_update`, `fullText.startsWith("")` and `fullText.length > 0` both evaluated to `true`, causing `message_end` to slice from index 0 and re-broadcast the entire turn 2 text as a duplicate delta at hardcoded `contentIndex: 0`.

2. **FND-T1-11 (Stale undeclared currentText in DurableEventAdapter message_end):**
   - In `DurableEventAdapter.case "message_end"`, fallback `msg.content ?? [{ type: "text", text: this.currentText }]` referenced stale undeclared `this.currentText`, which evaluated to `undefined` on malformed entries.

---

## 2. Remediation Applied

1. **Per-Content-Index Suffix Catchup in `DurableChildEventAdapter`:**
   - In `case "message_end"`, iterates through `message.content` parts.
   - For each text part at index `i`, looks up what was actually streamed for that specific block (`this.contentBlocks.get(i)`).
   - If `part.text.startsWith(streamedText)`:
     - Calculates the missing suffix: `const suffix = part.text.slice(streamedText.length)`.
     - Emits `message_update` ONLY if `suffix.length > 0` at the correct `contentIndex: i` with `parentRef` and `conversationId`.
     - If `suffix.length === 0` (text was already fully streamed), **zero duplicate delta is emitted**.
   - If prefix does not agree, emits `part.text` at index `i`.
   - Clears `this.contentBlocks` and `this.activeThinkingIndex` at the conclusion of `message_end` as well as on `turn_start` and `run_end` to guarantee turn isolation.

2. **Clean Content Construction in `DurableEventAdapter`:**
   - In `DurableEventAdapter.case "message_end"`, replaces stale `this.currentText` fallback with index-sorted blocks reconstructed from `this.contentBlocks`.
   - Completely removed all assignments to `this.currentText` and `this.currentThinking`.

---

## 3. Verification Receipts

### 3.1. Behavioral RED Baseline
- **Artifact:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-2/fnd-t1-10-red.log`
- **Output:**
  ```
  ✖ multi-turn: already-complete text emits NO duplicate delta on message_end across turns (1.12ms)
    AssertionError [ERR_ASSERTION]: Expected exactly 2 deltas, got 3
  ✖ partial tail catchup: emits ONLY missing suffix at the correct non-zero contentIndex with parentRef correlation (0.15ms)
    AssertionError [ERR_ASSERTION]: Expected 2 text deltas (initial + catchup), got 1
  ```

### 3.2. Suite GREEN Verification
- **Test Spec Log:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-2/native-suite.log`
- **JUnit Report:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-2/native-suite.junit.xml`
- **20 Tests Passing Across 5 Suites (0 failures, ~3.2s):**
  - `packages/adapter-pi-durable/test/durable-child-event-adapter-catchup.test.ts`: 3 tests pass (multi-turn isolation, non-zero partial tail catchup with parentRef, malformed guard)
  - `packages/adapter-pi-durable/test/durable-event-adapter-indices.test.ts`: 1 test pass (multi-block contentIndex preservation)
  - `packages/adapter-pi-durable/test/session-fork.test.ts`: 1 test pass
  - `packages/adapter-pi-durable/test/watch-events-compat.test.ts`: 1 test pass
  - `packages/cli/test/cli.test.ts`: 4 tests pass (version, fail-fast doctor, fail-fast run, serve)
  - `packages/core/test/session-abort-lifecycle.test.ts`: 3 tests pass (root abort, child abort isolation, unstarted/closed reject)
  - `packages/core/test/pure-domain-coordinator.test.ts`: 3 tests pass
  - `packages/runner/test/composition-root.test.ts`: 3 tests pass
  - `packages/runner/test/e2e-walking-skeleton.test.ts`: 1 test pass (10-step full journey)
- **Task 5A Architecture Boundaries Guard:** 30/30 tests pass (`packages/core/test/architecture-boundaries.test.ts`).

---

## 4. Item Accounting

- **Remediated in this Checkpoint:**
  - `FND-T1-10` (P2): Child event adapter per-content-index catchup and multi-turn isolation.
  - `FND-T1-11` (P3): Removal of stale undeclared `currentText`/`currentThinking` references in `DurableEventAdapter`.
- **Previously Remediated & Preserved:**
  - `FND-T1-01` (P1): Active turn cancellation without permanent session poisoning.
  - `FND-T1-02` (P1): Multi-block `contentIndex` preservation.
  - `FND-T1-03` (P1): Pure `SessionCoordinator` constructor without unused DI options.
  - `FND-T1-04` (P2): E2E walking skeleton oracle asserting distinct second assistant text/ID and deltas before terminal.
  - `FND-T1-05` (P2): Ownership-aware exactly-once codemode teardown.
  - `FND-T1-06` (P2): Production serve clean exit on stdin EOF/close.
  - `FND-T1-07` (P2): Prototype CLI run/doctor fail-fast with non-zero exit.
  - `FND-T1-08` (P2): Single physical lock ownership (engine-owned).
- **Tracked Out-of-Scope Items:**
  - `FND-T1-09`: Capability dispatcher wiring into serve/composition — tracked pending Task 4B component acceptance (owned by `thr_4yhrgipwed`).
  - Residual legacy native Core test migration (transferred to `thr_t38ban9s79`).

---

## 5. Scope & Lease Boundaries Maintained

- All architecture boundary tests/fixtures (`thr_rhrzagp727`), runner dispatch (`thr_4yhrgipwed`), and test migration paths (`thr_t38ban9s79`) remain completely untouched.
- No git commits, pushes, branches created, or subagents spawned.
- The thread is completely quiesced awaiting parent checkpoint commit and push.
