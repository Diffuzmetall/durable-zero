# Independent Architecture Re-Review (Fix Round 1): Task 4B (Typed Capability Preservation Dispatcher)

**Review Date:** 2026-11-05  
**Reviewer Role:** Independent Source/Spec Architecture Reviewer  
**Frozen Fixed Candidate Commit:** `ea21bf5a645d148c0767716b099d387bb0bce822`  
**Candidate Paths Under Review:**
- `packages/runner/src/dispatch/{session-dispatcher.ts,normalizers.ts,types.ts,index.ts}`
- `packages/runner/test/capability-dispatch.test.ts`
- `packages/protocol/src/jsonrpc/errors.ts`
- `packages/protocol/src/transport/request-dispatcher.ts`
- `packages/protocol/test/protocol-conformance.test.ts`
- `docs/arch-improvement/cycle-7/live/task-4b/fix-round-1/*`

---

## 1. Executive Summary & Verification Context

This re-review evaluates the Fix Round 1 remediation candidate (`ea21bf5a645d148c0767716b099d387bb0bce822`) submitted by author `thr_4yhrgipwed` following parent orchestration adjudication.

### Environment & Executed File Qualification
- **Source Verification:** Verified that `packages/runner/src/dispatch/session-dispatcher.ts` and `packages/runner/src/dispatch/normalizers.ts` in the working tree match frozen commit `ea21bf5a645d148c0767716b099d387bb0bce822` character-for-character.
- **Dependency Context:** Executed in the repository workspace where `@durable-zero/protocol`, `@durable-zero/core`, and `@durable-zero/contracts` resolve to their respective built packages in `dist/`.
- **Exact SHA256 Hashes of Executed Artifacts:**
  * `packages/runner/src/dispatch/session-dispatcher.ts`: `61b982c87ad1fb1dbbf85aee2fd793c3dff54e9c63b29b0dedbefcdcdbeb5bfc`
  * `packages/runner/src/dispatch/normalizers.ts`: `19c9334012e06f15bfab04cd51c67157c2d8ba827fbbe1a917801d89bf266cf9`
  * `packages/runner/src/dispatch/types.ts`: `4fdddc5059320789ac0ff19fc11aa2309f7243077c5d5f98cff990cefbb22583`
  * `packages/runner/src/dispatch/index.ts`: `6826069ef0a0b55e31f24402d7a97553250f85580f88fc3777916d1bc0ff0005`
  * `packages/runner/test/capability-dispatch.test.ts`: `06c78dd82798c596c3eb11735c33b0b52a738d2607fcf35de7b92c08cc425868`
  * `packages/protocol/src/jsonrpc/errors.ts`: `700892c3d942f78271eecde3a775596276b7e2205b5a187ba462a4a552072590`
  * `packages/protocol/src/transport/request-dispatcher.ts`: `8fdc6b109eb7c3dcfec25a9234110abf65603c5cde5200f917d4dca21a204e79`
  * `packages/protocol/test/protocol-conformance.test.ts`: `4808101dde651bc8f2d98a9a9b74e44ec5354f9ff98f95f610e1ec1972249ee1`
  * `packages/protocol/dist/index.js`: `b627622fe86a94907cb387994bf7188a91c9bcd81f5161fd0c3efb36056d06d0`
  * `packages/core/dist/index.js`: `ca07a4a9f8c261de4843f41fd59e5633977276090b511a967c23ccb4d83e18b3`
  * `packages/contracts/dist/index.js`: `b21fa96e911cbcd59dacb6ce4b82f658da238bc059c0d7984519d85934d8faf4`

---

## 2. Independent Verification Harness Receipts

### A. Independent 60-Case Suite Execution
- **Command:** `node --test --test-timeout 30000 --test-reporter=junit --test-reporter-destination=docs/arch-improvement/cycle-7/live/task-4b/independent-architecture-review/fix-round-1/independent-60-rerun.junit.xml --test-reporter=spec --test-reporter-destination=docs/arch-improvement/cycle-7/live/task-4b/independent-architecture-review/fix-round-1/independent-60-rerun.log packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-dispatch.test.ts`
- **Result:** **60 tests passed, 0 failed, 0 errors** in 1.18s.
- **Saved Evidence:**
  * Spec log: `independent-60-rerun.log`
  * JUnit XML: `independent-60-rerun.junit.xml` (contains 60 real `<testcase>` tags, time=1.004s/0.133s).

### B. Native Semantic Probes Suite (`semantic-re-review.test.mjs`)
- Replaces earlier manual XML generation with native `node:test` assertions and native Node.js JUnit reporter.
- **Probe 1 (Invalid params):** Empty content maps to code `-32602` over transport (PASS).
- **Probe 2 (Unmapped method):** Unmapped method maps to code `-32601` over transport (PASS).
- **Probe 3 (Anti-gaming check):** Generic spoofed Error object maps to code `-32603`, not `-32602` (PASS).
- **Probe 4 (Numeric conversationId):** `conversationId: 42` is normalized to string `'42'` for Core port (PASS).
- **Probe 5 (Invalid conversationId):** Values `0`, `-1`, `'abc'`, `'0'` strictly fail fast with `-32602` (PASS).
- **Probe 6 (Root abort):** `session/abort` without `conversationId` forwards `undefined` to root (PASS).
- **Saved Evidence:**
  * Test script: `semantic-re-review.test.mjs`
  * Spec log: `independent-re-review.log` (6 passed / 0 failed in 0.064s)
  * JUnit XML: `independent-re-review.junit.xml` (generated directly by Node.js test runner with real measured durations).

### C. Negative Control Receipt (`negative-control.test.mjs`)
- **Purpose:** Prove that an assertion failure in this test runner strictly causes exit code 1 and surfaces an error.
- **Execution:** Deliberately asserted `-32603 === -32602`.
- **Result:** Test runner exited with **exit code 1**, outputting `AssertionError: -32603 !== -32602`.
- **Saved Evidence:** `negative-control.log`.

---

## 3. Mandatory Semantic Probes (Evidence-Backed)

1. **Dependency Traceability (AP-074, AP-076): PASS**
   - Injected `coordinator` and `engine` have zero decorative ports. Every accepted method is actively called in real request paths:
     * `coordinator.prompt`: lines 33, 39, 45
     * `coordinator.abort`: line 50
     * `engine.abortTask`: line 59
     * `engine.compact`: line 70
     * `coordinator.setSubagentPolicy`: line 80
     * `engine.getState`: line 85
     * `engine.setModel`: line 100
     * `engine.setThinkingLevel`: line 112
     * `coordinator.getState`: line 118
     * `coordinator.getTranscript`: line 131
     * `coordinator.getStats`: line 140

2. **Runtime Completeness & Split-Brain Elimination (AP-010, AP-025): PASS**
   - All source-relative imports escaping package roots (`../../../protocol/src/...` and `../../../core/src/...`) have been removed.
   - `packages/runner/src/dispatch/session-dispatcher.ts` and `normalizers.ts` import canonical `@durable-zero/protocol` and `@durable-zero/core`.
   - Nominal error identity is unified across source tests and compiled distributions.

3. **Entry Point Wiring (AP-020, AP-075): PASS (Component Handoff Scope)**
   - Factory `createSessionDispatcher({ coordinator, engine })` matches the frozen handoff interface and is ready for composition root integration.
   - Parent adjudication confirmed that wiring into `composition.ts` is explicitly reserved to the entrypoint owner as part of whole Task 4.

4. **Anti-Gaming & Line Budget Reality (AP-019, AP-076): PASS**
   - `packages/runner/src/dispatch/session-dispatcher.ts`: 171 LOC (<= 250 LOC hard limit).
   - `packages/runner/src/dispatch/normalizers.ts`: 115 LOC (<= 150 LOC soft limit).
   - Unsupported capabilities (`binding/register`, `binding/list`, `session/fork`, `tools/register`) fail fast with `UnsupportedCapabilityError`, refusing to fabricate `{ ok: true }` receipts.

---

## 4. Re-Review Findings Status

| Prior ID | Sev | Title | Status in Fix Round 1 |
|---|---|---|---|
| F-01 | **P1** | Cross-package source-relative imports break nominal error identity | **RESOLVED** (canonical imports wired; verified by `semantic-re-review.test.mjs`) |
| F-02 | **P2** | Test suite count discrepancy | **RESOLVED** (physical count 60/60 testcase nodes confirmed independently) |
| F-03 | **P2** | Dispatcher RED artifact truncated | **RESOLVED** (authentic behavioral RED captured in `public-import-regression-red.log`) |
| F-04 | **Obs** | createSessionDispatcher omitted from runner root export | **ADJUDICATED NON-BLOCKING** (internal factory for `composition.ts`) |
| F-05 | **P3** | File line budget exceeded (300 LOC > 250 LOC) | **RESOLVED** (decomposed to 171 LOC and 115 LOC) |
| F-06 | **P3** | Numeric conversationId rejected | **RESOLVED** (normalized via `conversationIdSchema` to string for Core) |
| F-07 | **P3** | Report contains handwritten prose timestamps | **LOG-ONLY** (documented observation; behavior independently verified) |

---

## 5. Architecture Verification (Scoped to Task 4B Component)

- **Passed Rules (Component Scope):**
  * **AP-010 (Modular Monolith & Ports/Adapters):** Clean dependency on Core SPI contracts; public package imports wired.
  * **AP-011 (Low Coupling, High Cohesion):** Discrete capability routing separated from input normalizers.
  * **AP-012 (Fail-Fast):** Strict parameter validation; invalid inputs fail fast with `-32602`.
  * **AP-014 (SOLID & Clean Code):** Cleanly decomposed helpers and router.
  * **AP-016 (Security Boundaries):** Parameter validation guards against prototype tampering.
  * **AP-018 (Clarity):** Single-responsibility files under 200 LOC.
  * **AP-019 (Line Budgets):** All dispatch files <= 171 LOC.
  * **AP-020 (Composition Root):** Clean factory contract ready for `composition.ts`.
  * **AP-021 (Thin Entry Points):** No domain logic inside dispatcher.
  * **AP-022 (Typed Errors):** Nominal error classes with verified `instanceof` behavior across package boundaries.
  * **AP-023 (Async Discipline):** All promises properly awaited.
  * **AP-025 (Import Discipline):** Clean public package imports.
  * **AP-026 (API Contracts & DTOs):** Public JSON-RPC error codes `-32601` and `-32602` verified.
  * **AP-028 (Testing Strategy & Determinism):** 60 deterministic behavioral tests execute in ~1.2s; independent test receipts captured.
  * **AP-029 (TypeScript Strictness):** Explicit typing across all functions.
  * **AP-072 (Domain Specifications vs Switch):** Real domain DTOs used.
  * **AP-074 (Explicit DI):** Options-injected dependencies; zero singletons.
  * **AP-076 (Anti-Hollow & Receipt Integrity):** Real port calls asserted; unsupported capabilities explicitly rejected.
- **Residual Risk & Architecture Boundaries:**
  * Component approval does **NOT** constitute whole-cycle or native runtime acceptance:
    - Administrative capabilities (`binding/register`, `binding/list`, `session/fork`, `tools/register`) remain unsupported on the SPI and require dedicated SPI design.
    - End-to-end integration into `packages/runner/src/composition.ts` is owned by the entrypoint owner.
    - The native walking skeleton and foundational contracts DAG cycles remain managed separately by their respective owners.

---

## 6. Final Verdict

**VERDICT: PASS (Task 4B Component Scope)**

All previously blocking P1 and P2 defects have been completely resolved with verified public imports, nominal error mapping, numeric conversation ID normalization, and AP-019 line decomposition. All verification receipts have been independently executed, timed, and preserved.

Holding for parent orchestration and compiled builder evaluation.
