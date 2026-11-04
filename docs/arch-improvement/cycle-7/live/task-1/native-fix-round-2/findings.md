# Native CLI Builder Fix-Round-2 Findings & Architecture Verification

**Date:** 2026-11-04  
**Milestone:** `ad99873e396f7440a6896dabaf516b6393c08a37`  
**Role:** Independent mechanical NATIVE CLI builder  
**Scope:** `docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2/`

---

## 1. Architectural Observations & Verification

### [P3] Evidence: Relative module resolution coupling in CLI entrypoint
- **Evidence:** `packages/cli/bin/durable-zero.js:39` contains:
  ```javascript
  const { main: runRunner } = await import("../../runner/dist/main.js");
  ```
- **Impact:** CLI executable relies on relative path depth (`../../runner/dist/main.js`). Moving `durable-zero.js` independently without preserving relative directory structure causes `ERR_MODULE_NOT_FOUND`.
- **Rule:** AP-020 (Composition Root), AP-025 (Import discipline).
- **Fix decision:** Preserved exact directory depth (`packages/cli/bin/` and `packages/runner/dist/`) in candidate package.

---

## 2. Remediations Verified in Fix-Round-2

1. **Catchup Block Alignment (AP-013, AP-023, AP-047):**
   - **Evidence:** `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts` and `durable-event-adapter.ts` align per-block child catchup events with parent state.
   - **Verification:** Fresh compiled `packages/runner/dist/main.js` (`76ec1265...`) incorporates the adapter updates directly from frozen commit `ad99873e396f7440a6896dabaf516b6393c08a37`.
2. **Graceful Stdin EOF & SIGTERM Cleanup (AP-023):**
   - **Evidence:** `packages/runner/src/main.ts` wires `process.stdin.once("end", ...)` and `process.stdin.once("close", ...)` to `cleanup()`.
   - **Verification:** Verified via `verify-smoke.mjs` (Test 1 & Test 2). Closing `child.stdin.end()` successfully triggers coordinated shutdown and terminates the process with exit code `0` in 856ms. SIGTERM cleanly exits in 506ms.
3. **Explicit Fail-Fast on Unsupported Commands (AP-012, AP-076):**
   - **Evidence:** `packages/cli/bin/durable-zero.js` explicitly rejects `doctor` and standalone `run` with exit code `1`.
   - **Verification:** Verified via `verify-smoke.mjs` (Test 3) in 122ms.
4. **Purity of Internal Bundling:**
   - Fresh build of `@durable-zero/runner` bundles internal packages (`@durable-zero/contracts`, `protocol`, `core`, `execution`, `adapter-pi-durable`, `adapter-pi-ai`, `adapter-codemode`, `extension-pi-resource`) from frozen commit `ad99873e396f7440a6896dabaf516b6393c08a37` with zero live workspace symlinks leaking to node_modules.

---

## 3. Architecture Verification (Scoped)

### Passed:
- **Passed: AP-012 (Fail-fast and explicit error contracts):** `doctor` and standalone `run` fail fast with code 1 and explicit instructions.
- **Passed: AP-013 (Data integrity):** Event adapter catchup logic correctly aligned for multi-block child and parent persistence.
- **Passed: AP-020 (Clean Architecture boundaries & composition root):** `assembleDurableZero` in runner composition cleanly coordinates domain and engine without leaking to CLI.
- **Passed: AP-021 (Thin entry points):** `durable-zero.js` is a thin router delegating to `runner.main()`.
- **Passed: AP-023 (Async discipline and clean process shutdown):** Process handles SIGTERM, SIGINT, and stdin EOF gracefully with bounded exit.
- **Passed: AP-025 (Import discipline):** Zero live uncommitted workspace edits contaminate the candidate.
- **Passed: AP-027 (Configuration and environment isolation):** Verification runs with ephemeral temp HOME, XDG, agent, and session directories.
- **Passed: AP-059 (Readiness handshake):** `session/getState` responds cleanly over JSON-RPC 2.0 before accepting prompt admissions.
- **Passed: AP-074 (Explicit dependency injection):** Public provider extensions injected via `--extension <path>` without production test hooks.
- **Passed: AP-076 (Anti-Hollow):** Replaced hollow stubs in `doctor` and `run` with explicit fail-fast rejections.

### Residual Risk:
- Global test suite contains pre-existing tests in `packages/core/test/` requiring migration to `packages/adapter-pi-durable/test/`.
- Full black-box product verification (2-chunk streaming delivery, SQLite EntryId stability across process restart, multi-turn prompt sequence) is evaluated independently by the product reviewer using the provided black-box package.
