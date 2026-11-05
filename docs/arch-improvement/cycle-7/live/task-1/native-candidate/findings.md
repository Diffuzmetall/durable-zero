# Independent Native CLI Builder Findings & Architecture Verification

**Date:** 2026-11-04  
**Milestone:** `fc0909602e7969df080259a2e2d4a7114be450b8`  
**Role:** Independent mechanical NATIVE CLI builder  
**Scope:** `docs/arch-improvement/cycle-7/live/task-1/native-candidate/`

---

## 1. Architectural Findings

### [P3] Evidence: Hardcoded relative import in CLI entrypoint
- **Evidence:** `packages/cli/bin/durable-zero.js:46` contains:
  ```javascript
  const { main: runRunner } = await import("../../runner/dist/main.js");
  ```
- **Impact:** The CLI executable is tightly coupled to the exact relative disk depth (`../../runner/dist/main.js`). Flattening or relocating `durable-zero.js` independently of `packages/runner/` triggers Node `ERR_MODULE_NOT_FOUND`.
- **Rule:** AP-020 (Composition Root), AP-025 (Import discipline).
- **Fix decision:** In this candidate packaging, we strictly enforce the relative layout (`packages/cli/bin/` and `packages/runner/dist/`). For future production packaging, `@durable-zero/runner` should be imported via package name or package export map rather than relative directory hopping.

---

## 2. Architecture Verification (Scoped)

### Passed:
- **Passed: AP-020 (Clean Architecture boundaries & composition root):** Composition root in `packages/runner` wires domain `SessionCoordinator` with `PiDurableEngine`. No business logic lives in CLI entrypoint.
- **Passed: AP-021 (Thin entry points):** `packages/cli/bin/durable-zero.js` only parses high-level verb (`serve`) and delegates to runner `main()`.
- **Passed: AP-025 (Import discipline):** The frozen candidate is built entirely from `git archive` of milestone `fc0909602e7969df080259a2e2d4a7114be450b8`. No workspace symlinks resolve back to live uncommitted edits from other worker tasks.
- **Passed: AP-027 (Configuration & environment isolation):** Bootstrap verification operates under strictly temporary, isolated `HOME`, `XDG_CONFIG_HOME`, `PI_AGENT_DIR`, `sessionDir`, and `cwd`. Zero touch of user databases, keys, or external network.
- **Passed: AP-059 (Health checks & readiness):** The daemon accepts readiness RPC `session/getState` over JSON-RPC 2.0 stdio, returning active model configuration and zero entry count before processing turn prompts.
- **Passed: AP-074 (Explicit DI):** Scripted provider extension is injected as an external caller argument (`--extension <path>`) into `assembleDurableZero`, avoiding hardcoded production test branches or global provider mocks.

### Residual Risk:
- **Legacy test consumers:** Pre-existing tests in `packages/core/test/` (e.g. `subagent-*.test.ts`, `tool-*.test.ts`) that import from relocated modules are held for separate migration tasks.
- **Independent Product Oracle Verification:** The candidate was verified for bootstrap, RPC readiness, model registration, and clean SIGTERM shutdown (517ms). Full 2-chunk streaming arrival before turn completion, native EntryId restart stability, and multi-turn prompt sequence persistence must be independently exercised by the downstream product reviewer using the provided black-box API package.
