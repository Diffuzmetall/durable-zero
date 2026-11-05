# Cycle 7 Task 1 (Slice 0): Independent Architecture & Spec Re-Review (Fix Round 1)

**Date:** November 5, 2026  
**Reviewer Role:** Independent SOURCE/SPEC Architecture Reviewer (Separate circuit, non-author)  
**Target Candidate Commit:** `1298b479c5a6cf9087f7e01fc56325feb54a3dbd`  
**Prior Candidate Under Audit:** `fc0909602e7969df080259a2e2d4a7114be450b8`  
**Remediation Report Under Audit:** `docs/arch-improvement/cycle-7/live/task-1/fix-round-1/native-review/remediation-report.md`  
**Governing Rules:** `/Users/vanya/Projects/arch-rules/arch-rules.md` (AP-010 ... AP-076), Cycle 7 Canonical Plan, Binding Rulings R1–R7  
**Artifact Storage:** `docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/`  
**Verdict:** **VERDICT: FAIL** (7 of 8 original blockers verified FIXED; 1 residual P2 defect in child adapter multi-turn streaming; 1 P3 maintainability observation)

---

## 1. Candidate Source Inventory & Checksum Provenance

| Target File | SHA-256 Checksum | Architectural Role |
| :--- | :--- | :--- |
| `packages/core/src/session/coordinator.ts` | `92a8d8f8fb909c9269e7da07eb6c356d227c8e40b8e6a3c3ef35111c2f75d4ee` | Remediated pure domain coordinator |
| `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts` | `609be3672a52fb6c716249240e1953144c40acd8fe1301fb9ecbcbd7e556e985` | Content-index preserved event projector |
| `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts` | `2fc306fc079549528cac5790473065772b689a68353c2684d75f6317d63fddec` | Child event projector (contains residual P2) |
| `packages/adapter-pi-durable/src/engine/bridge/assistant-message-builder.ts` | `e2f631be65eda07bdf8a6b15e587dce264e1008b8387f60d63dd628866fbffb0` | Multi-block sorted content builder |
| `packages/adapter-pi-durable/src/engine/bridge/turn-summary.ts` | `d0fa71a921fdd4c219ff166135632dae1c2c1265131e56e5cdee76422138d8e4` | Block-aware turn summary resolver |
| `packages/runner/src/composition.ts` | `dda2fe28f4421642620f355470e13add0c178f044e8030bed40604eda128b7c8` | Lazy native dependencies & safe teardown |
| `packages/runner/src/main.ts` | `0206232cff1f96112db804a620ddfffe6ab72a394431d9ae9b20698997e28411` | Stdin EOF/close bounded shutdown |
| `packages/cli/bin/durable-zero.js` | `dd470565bf3dc889deb7abfcba444b2b1589e5f9152349b339e9de509a0fb190` | Fail-fast run & doctor prototypes |
| `packages/runner/test/e2e-walking-skeleton.test.ts` | `8107f245ed6588aaae3e25215ec39ea50f62440010b44ec1063f3b9433b42013` | Verified transcript & order walking skeleton test |

---

## 2. Re-Review of Prior Blockers (Round 1 Adjudication)

| Finding ID | Prior Severity | Description | Round 1 Review Result | Detailed Finding & Proof |
|---|---|---|---|---|
| **FND-T1-01** | **P1** | Sticky Abort in `SessionCoordinator` | **CLOSED (PASS)** | `this.isAborted` flag was eliminated. `abort(conversationId)` delegates directly to `engine.abort(conversationId)` and emits `{ type: "session/aborted" }`. Subsequent prompts on the session succeed immediately. Child conversation abort delegates to target conversation without affecting root. Verified in `session-abort-lifecycle.test.ts` and `probe-re-review.test.ts` (PROBE 1). |
| **FND-T1-02** | **P1** | Hardcoded `contentIndex: 0` in Event Adapter | **PARTIAL (PASS on parent, REOPENED as P2 on child)** | In `durable-event-adapter.ts`, `change.contentIndex` is extracted and emitted as `assistantMessageEvent.contentIndex`, and indexed in `contentBlocks` Map. However, in `durable-child-event-adapter.ts:122-138`, `message_end` still attempts catchup using deleted `this.currentText`. On turn 2+, `fullText.startsWith("")` evaluates to true, broadcasting a duplicate delta for the entire turn output at hardcoded `contentIndex: 0` (FND-T1-10). |
| **FND-T1-03** | **P1** | Decorative Dependencies in `SessionCoordinator` | **CLOSED (PASS)** | Removed `modelProvider`, `executionEnv`, and `resourceLoader` from `SessionCoordinatorOptions` and class constructor. The class options now strictly require `{ engine: IAgentEngine, sessionDir: string }` without unused injection fields. |
| **FND-T1-04** | **P2** | Incomplete Assertion Integrity in Walking Skeleton | **CLOSED (PASS)** | In `e2e-walking-skeleton.test.ts:314-368`, step 10 now enforces that streaming `text_delta` notifications arrive strictly before `turn_complete`, and step 11 asserts `session/getTranscript` contains distinct assistant entry with ID `"16"` (distinct from turn 1 ID `"12"`) and exact text `"Echo: Second turn"`. |
| **FND-T1-05** | **P2** | Double Disposal of Built-in Codemode Extension | **CLOSED (PASS)** | `assembleDurableZero` was restructured to lazily create native defaults (including `codemodeBuiltin`) only when `options.engine` is omitted. On normal close, `coordinator.close()` delegates to runtime teardown; `composition.ts` no longer calls redundant `codemodeBuiltin.teardown()`. On startup failure in `coordinator.start()`, a dedicated `catch` block invokes `codemodeBuiltin.teardown().catch(() => {})`. |
| **FND-T1-06** | **P2** | Stdio Server Stdin EOF / Close Handling | **CLOSED (PASS)** | `packages/runner/src/main.ts:33-38` attaches `process.stdin.once("end", () => void cleanup())` and `process.stdin.once("close", () => void cleanup())`. This triggers clean lifecycle shutdown (`instance.close()`) and clean process exit without mutating protocol owner files. |
| **FND-T1-07** | **P2** | Hollow CLI Command Prototypes (`run` / `doctor`) | **CLOSED (PASS)** | `packages/cli/bin/durable-zero.js:35-43` replaced fake success outputs with fail-fast `process.exit(1)` and explicit, truthful messages directing users to `serve`. Verified in `cli.test.ts`. |
| **FND-T1-08** | **P2** | Duplicate Store Lock in `SessionCoordinator` | **CLOSED (PASS)** | Removed `store` from `SessionCoordinatorOptions` and deleted `this.store.acquireLock()` / `releaseLock()`. The native engine solely owns the SQLite database and session lock. |
| **FND-T1-09** | **P3** | Split-Brain: Runner Inline Handler vs `SessionDispatcher` | **LOG-ONLY (P3)** | Tracked for runner composition integration once Task 4B is certified. |

---

## 3. New Findings in Fix Round 1

- [P2] FND-T1-10: Unsynchronized `currentText` in `DurableChildEventAdapter` Emits Duplicate Full-Text Delta at `contentIndex: 0` on Subsequent Turns
  - Evidence: `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts:122-138`. Empirically verified in `docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/probe-re-review.test.ts` (PROBE 5).
  - Impact: When `DurableChildEventAdapter` was updated to use `contentBlocks`, `this.currentText` was removed from the class fields. In `message_update`, text deltas are appended to `this.contentBlocks.get(idx)`, leaving `this.currentText` untouched. In `message_end`, `this.currentText = ""` is assigned. On turn 2+, `fullText.startsWith("")` evaluates to `true` and `fullText.length > 0` is `true`. `message_end` then slices `fullText` from index 0 and emits the ENTIRE turn output a second time as a duplicate text delta at hardcoded `contentIndex: 0`.
  - Rule: AP-026, AP-076
  - Fix decision: fix-now (Fix Round 2: update child adapter `message_end` to use `contentBlocks` or remove the legacy text catchup block).

- [P3] FND-T1-11: Stale `currentText` Fallback in `DurableEventAdapter.message_end`
  - Evidence: `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts:155, 167-168`.
  - Impact: In `DurableEventAdapter`, if an entry arrives with undefined `model[0].content`, the fallback `let content = msg.content ?? [{ type: "text", text: this.currentText }]` reads `undefined` because `this.currentText` was removed from the class. While native Pi entries always provide `model[0].content`, the stale reference is dead code.
  - Rule: AP-026, AP-076
  - Fix decision: log-only

---

## 4. Semantic Probes Status (Round 1)

1. **Dependency Traceability (AP-074, AP-076):** **PASS.** All injected dependencies in `SessionCoordinator` are actively called. Dead constructor options (`modelProvider`, `executionEnv`, `resourceLoader`, `store`) are completely removed.
2. **Runtime Completeness & Split-Brain Detection:** **PASS.** Pure core is decoupled from infrastructure; AST boundary guards pass 30/30; production runner handles stdin EOF/close for clean lifecycle teardown.
3. **Entry Point Wiring (AP-020, AP-075):** **PASS.** `durable-zero serve` connects cleanly to runner composition root; prototype `doctor` and `run` fail fast truthfully with exit code 1.
4. **Anti-Gaming & Line Budget Reality (AP-019, AP-076):** **FAIL ([P2] FND-T1-10).** Parent adapter streaming deltas and walking skeleton test assertions are robust. However, child subagent adapter contains an unsynchronized `currentText` catchup block that emits duplicate full-text deltas on multi-turn conversations.

---

## 5. Architecture Verification

- **Passed Rules:**
  - `AP-010` (Modular Monolith & Ports/Adapters: clean pure domain).
  - `AP-011` (Low Coupling & High Cohesion).
  - `AP-012` (Fail-fast errors and proper turn abort semantics).
  - `AP-019` (File size limits observed).
  - `AP-020` (Composition root in runner).
  - `AP-021` (Thin entrypoints; child abort isolation).
  - `AP-023` (No floating promises; clean process and stream teardown on EOF/close).
  - `AP-025` (Strict import discipline verified by AST guards).
  - `AP-028` (Rigorous E2E test oracle with transcript readback and delta ordering).
  - `AP-029` (TypeScript strictness).
  - `AP-034` (Single physical lock ownership).
  - `AP-059` (Fail-fast prototype command boundaries).
  - `AP-074` (Explicit DI without decorative constructor injection).
  - `AP-075` (Walking skeleton vertical slice connects CLI, stdio JSON-RPC, coordinator, engine, and SQLite WAL).
- **Violated Rules (Failing Gate):**
  - `AP-026, AP-076` (FND-T1-10: Unsynchronized child event adapter catchup emits duplicate full-text delta at contentIndex 0).
- **Not Applicable:**
  - `AP-051–AP-055` (Frontend / React architecture).
  - `AP-060, AP-062` (Postgres OLTP guardrails).
- **Residual Integration Risks:**
  1. *Subagent Streaming Multi-Turn Integrity:* Child subagent interactions must reconcile deltas using `contentBlocks` in Fix Round 2.
  2. *Legacy Test Migration:* Tracked separately under `task-1-test-migration`.
  3. *Dispatcher Integration:* Task 4B dispatcher component is certified and awaiting runner composition integration.

---

## 6. Verdict & Actionable Remediation Brief for Author

**VERDICT: FAIL**

The author achieved high-quality fixes across 7 of the 8 original blockers, delivering clean constructor DI, single physical lock ownership, truthful CLI fail-fast, robust stdin EOF handling, and a hardened walking skeleton test oracle.

However, per Arch Review invariants, **VERDICT: FAIL** is mandated due to open P2 defect `FND-T1-10`.

### Targeted Fix for Fix Round 2:
In `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts:122-138`:
Remove the obsolete `fullText.startsWith(this.currentText)` catchup block in `case "message_end"` or reconcile it against `this.contentBlocks.get(0)?.text`, and delete the leftover `this.currentText = ""` statement.
Similarly, in `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts:155, 167-168`, clean up the fallback references to `this.currentText` and `this.currentThinking`.

All empirical receipts, JUnit reports, and probe tests are preserved in:
- [`review.md`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/review.md)
- [`findings.json`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/findings.json)
- [`probe-re-review.junit.xml`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/probe-re-review.junit.xml)
- [`probe-re-review.test.ts`](/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/independent-source-review/fix-round-1/probe-re-review.test.ts)

Quiesced for parent checkpoint and push.
