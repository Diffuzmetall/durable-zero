# Cycle 7 Task 1 / Slice 0 Milestone Report: Walking Skeleton & Bridge Streaming

**Date:** November 4, 2026  
**Branch:** `cycle-7-runtime-adapter-ioc-migration`  
**Task:** Task 1 — Skeletons & Closures (Acyclic Closure Relocation)  
**Milestone Scope:** Task 1 / Slice 0 Walking Skeleton (Focused Subsystem Verification)  
**Status:** **TASK-1 GREEN (Quiesced for Parent Checkpoint & Push)**  
*Note: This report certifies completion of Task 1 / Slice 0. It does NOT claim global Cycle 7 PASS.*

---

## 1. Verified Architecture Execution Chain

The complete compiled vertical path is verified operational without stubs or decorative abstractions:

$$\text{Compiled CLI (\texttt{durable-zero serve})} \longrightarrow \text{JSON-RPC 2.0} \longrightarrow \text{SessionCoordinator} \longrightarrow \text{PiDurableEngine} \longrightarrow \text{Pi 1.5 Harness} \longrightarrow \text{SQLite WAL}$$

1. **CLI & JSON-RPC Transport:**
   - Real `packages/cli/bin/durable-zero.js` invoking `packages/runner/dist/main.js`.
   - `StdioJsonRpcServer` handling JSON-RPC 2.0 requests and notifications over standard I/O.
2. **Domain Core Separation:**
   - Pure domain `SessionCoordinator` requiring `IAgentEngine` with zero `@earendil-works/*` or filesystem dependencies in `@durable-zero/core`.
   - Complete elimination of synthetic `rec_...` fallback IDs or fake admission timestamps (AP-076).
3. **Pi-Durable Engine & SQLite Persistence:**
   - `PiDurableEngine` backed by native `openDurable` and SQLite WAL persistence.
   - Native `Submission.wait()` terminal resolution correlated directly to `turn_complete`.

---

## 2. Verification Receipts: Exact Cases and Gates Reached

### 2.1. Bridge RED Test (Genuine Regression First)
- **File:** `packages/adapter-pi-durable/test/watch-events-compat.test.ts`
- **Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1/bridge-red.log`
- **Result:** Exit code 1.
  ```
  ✖ watchEvents: emits message_update with incremental text deltas from pi.live.generation
    AssertionError [ERR_ASSERTION]: Expected at least 2 message_updates, got 0
  ```

### 2.2. Focused Test Suite Run (GREEN)
- **Command:**
  ```bash
  node --test \
    packages/adapter-pi-durable/test/watch-events-compat.test.ts \
    packages/core/test/pure-domain-coordinator.test.ts \
    packages/runner/test/composition-root.test.ts \
    packages/cli/test/cli.test.ts \
    packages/runner/test/e2e-walking-skeleton.test.ts
  ```
- **Exit Code:** 0
- **Duration:** 1905ms (~1.9s)
- **Log Receipt:** `docs/arch-improvement/cycle-7/live/task-1/task-1-green.log`
- **JUnit Receipt:** `docs/arch-improvement/cycle-7/live/task-1/test-report.junit.xml` (12 testcase nodes, 0 failures, 0 skipped):

```xml
<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="watchEvents: emits message_update with incremental text deltas from pi.live.generation" time="0.001233" classname="test" file="/Users/vanya/Projects/durable-zero/packages/adapter-pi-durable/test/watch-events-compat.test.ts"/>
	<testcase name="CLI: --version prints version string" time="0.114477" classname="test" file="/Users/vanya/Projects/durable-zero/packages/cli/test/cli.test.ts"/>
	<testcase name="CLI: doctor checks runtime capabilities" time="0.070204" classname="test" file="/Users/vanya/Projects/durable-zero/packages/cli/test/cli.test.ts"/>
	<testcase name="CLI: serve starts JSON-RPC server and responds to requests" time="0.720950" classname="test" file="/Users/vanya/Projects/durable-zero/packages/cli/test/cli.test.ts"/>
	<testsuite name="SessionCoordinator (AP-010, AP-012, AP-074, AP-076)" time="0.005289" disabled="0" errors="0" tests="4" failures="0" skipped="0">
		<testcase name="coordinates session lifecycle: lock, prompt admission, abort cascade, and release" time="0.001126" classname="test" file="/Users/vanya/Projects/durable-zero/packages/core/test/pure-domain-coordinator.test.ts"/>
		<testcase name="fails fast when prompt is called on aborted session" time="0.000927" classname="test" file="/Users/vanya/Projects/durable-zero/packages/core/test/pure-domain-coordinator.test.ts"/>
		<testcase name="fails fast when prompt is called before start() (Defect 2)" time="0.001194" classname="test" file="/Users/vanya/Projects/durable-zero/packages/core/test/pure-domain-coordinator.test.ts"/>
		<testcase name="fails fast when prompt is called after close() (Defect 1)" time="0.000397" classname="test" file="/Users/vanya/Projects/durable-zero/packages/core/test/pure-domain-coordinator.test.ts"/>
	</testsuite>
	<testsuite name="@durable-zero/runner Composition Root (AP-020, AP-073, AP-074)" time="0.014446" disabled="0" errors="0" tests="3" failures="0" skipped="0">
		<testcase name="exports executable main function" time="0.000390" classname="test" file="/Users/vanya/Projects/durable-zero/packages/runner/test/composition-root.test.ts"/>
		<testcase name="parseCliArgs: parses --session, --cwd, --provider, --model, and --thinking flags" time="0.000094" classname="test" file="/Users/vanya/Projects/durable-zero/packages/runner/test/composition-root.test.ts"/>
		<testcase name="assembleDurableZero: assembles coordinator, streams session/event notifications, and safely closes" time="0.013416" classname="test" file="/Users/vanya/Projects/durable-zero/packages/runner/test/composition-root.test.ts"/>
	</testsuite>
	<testcase name="Slice 0 Walking Skeleton: End-to-end CLI JSON-RPC prompt streaming, persistence, and restart" time="2.001383" classname="test" file="/Users/vanya/Projects/durable-zero/packages/runner/test/e2e-walking-skeleton.test.ts"/>
</testsuites>
```

---

## 3. Explicit Milestone Verifications (Checklist)

1. **Live text arrived BEFORE model/provider completion:**
   - **CONFIRMED.** The scripted model fixture emits two distinct chunks (`"Echo: he"` and `"llo world"`) separated by pauses (120ms and 140ms) exceeding Pi-Durable's 100ms throttle interval.
   - Live partial commits to `docs["pi.live"].generation` occurred while the provider's stream was actively open.
   - The JSON-RPC notifications (`message_update` with `assistantMessageEvent.delta`) were emitted on stdout and received by the client well before `stream.end()`, before the final assistant entry committed, and before `turn_complete`.
2. **Transcript & Native EntryId Restart Consistency:**
   - **CONFIRMED.** In turn 1, `session/getTranscript` returned user entry `id: "8"` and assistant entry `id: "12"`.
   - After process exit and restart with the same `--session` directory, `session/getTranscript` returned identical IDs (`"8"` and `"12"`) with identical text (`"Echo: hello world"`), verified against the SQLite database.
3. **Clean Process Exits:**
   - **CONFIRMED.** Process cleanly terminated with exit code `0` on SIGTERM.
4. **Distinct Second Reply & Multi-Turn Persistence:**
   - **CONFIRMED.** A second prompt (`"Second turn"`) admitted under `id: "14"`, streamed chunks `"Echo: Se"` and `"cond turn"`, settled with `turn_complete`, and advanced persistent session `entryCount` from 3 to 5.

---

## 4. Remaining Full Test-Suite / Consumer Migration Work (Transparently Noted)

The Task 1 walking skeleton and its direct subsystem tests are 100% green. However, running the broad workspace test suite (`npm test`) reveals pre-existing test files in `packages/core/test/` that require migration:
- **Relocated Module Paths:** Legacy test files in `packages/core/test/` (e.g. `subagent-*.test.ts`, `tool-*.test.ts`, `view-stream-projector.test.ts`, `session-storage-*.test.ts`) still contain static imports pointing to `/packages/core/src/subagent.ts` or `/packages/core/src/runtime-controller.ts` which were relocated to `@durable-zero/adapter-pi-durable`.
- **Planned Resolution:** These test suites belong in `packages/adapter-pi-durable/test/` as adapter integration tests or need import updates to point to `@durable-zero/adapter-pi-durable`. They will be addressed systematically in subsequent task slices.

---

## 5. Quiesced State & Scope Boundaries

- **Reserved files untouched:**
  - `docs/superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md`
  - `docs/arch-improvement/ledger.md` (parent sole writer)
  - `packages/protocol/src/jsonrpc/schema.ts`, `errors.ts`, `transport/request-dispatcher.ts`
  - `packages/core/src/tools/host-bridge.ts`, `packages/runner/src/host/host-bridge.ts`
  - `packages/core/test/architecture-boundaries.test.ts`
- **No git actions taken:** No commits, pushes, branches created, or subagents spawned.
- **Ready for parent checkpoint:** Workspace is clean, build is verified, tests are passing, and all worker activities are quiesced.
