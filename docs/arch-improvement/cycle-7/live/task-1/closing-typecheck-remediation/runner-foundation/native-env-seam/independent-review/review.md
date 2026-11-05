# Independent Architecture Review: Root Execution Environment Seam Selection (Parent R8 Amendment)

**Review Date:** 2026-11-05  
**Reviewer Role:** Independent Source/Spec Architecture Reviewer  
**Frozen WIP Commit:** `653ec4e722f0b98fbffccf3077ff93b215b5acfb`  
**Delta Under Review:** Root delta `0deedfd` vs prior accepted `70f4a88`  
**Review Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/independent-review/`  

---

## 1. Executive Summary & Review Scope

This independent architecture review evaluates the Root execution environment seam selection delta (`0deedfd` vs `70f4a88`) in `packages/runner/src/composition.ts`, `packages/runner/package.json`, and `pnpm-lock.yaml`, implementing the parent R8 technical amendment.

### Bounded Scope Ownership
- **Composition Root Invariants:** `packages/runner/src/composition.ts` mutual exclusion between `executionEnvFactory` (Core SPI) and `nativeExecutionEnvFactory` (Native SDK), conditional dependency injection, and default native environment wiring.
- **Package Manifest & Lockfile:** Direct dependency `"@earendil-works/pi-durable": "1.5.0"` in `packages/runner/package.json` and associated `pnpm-lock.yaml` pinning.
- **Seam Verification Tests:** `packages/runner/test/native-env-seam.test.ts`.
- **Explicit Exclusion:** Core A helper semantics (4 groups being remediated in parallel per `parent-r8-review/findings.json`), product black-box journey evaluation, and whole-cycle native integration.

### Exact SHA256 Hashes of Executed Artifacts
- `packages/runner/src/composition.ts`: `2e97adca68cdda1e1fcf293b6d679fae86867ab51d4d0ce817c22747de36425e` (verified matching commit `0deedfd`)
- `packages/runner/package.json`: `0f4cbc3a3f464622301b9317ae403a9c428ba8db0994e99e1512a2c342228146` (verified matching commit `0deedfd`)
- `pnpm-lock.yaml`: `056037ab32eae8d7e43f4b444d0e1258c53dff6076242975d4ff11467b4f5eee` (verified matching commit `0deedfd`)
- `packages/runner/test/native-env-seam.test.ts`: `3e84656d67a3c5a858d48a430aa8403bc5f89c54b4f8e8cda2ffe36bbfd86ae5`

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability & Mutual Exclusion (AP-012, AP-074) — PASS
- `packages/runner/src/composition.ts:55-59` enforces mutual exclusion at the composition boundary:
  ```typescript
  if (options.executionEnvFactory && options.nativeExecutionEnvFactory) {
      throw new Error(
          "Invalid composition configuration: cannot specify both executionEnvFactory (Core SPI) and nativeExecutionEnvFactory (Native SDK). Specify at most one (AP-012, AP-074).",
      );
  }
  ```
- Supplying both factories strictly throws an error. Verified by independent probe `Probe 1` in 2.17ms.

### Probe 2: Runtime Completeness & Split-Brain Elimination (AP-010, AP-025) — PASS
- `packages/runner/src/composition.ts:101-107` conditionally forwards factories to `PiRuntimeDependencies`:
  * If `options.executionEnvFactory` (Core SPI) is provided: forwards ONLY `executionEnvFactory`. Does **not** inject any native factory (no shadow default).
  * If `options.nativeExecutionEnvFactory` (Native SDK) is provided: forwards that factory.
  * If neither factory is provided: defaults cleanly to `(target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd })`.
- Direct package dependency `"@earendil-works/pi-durable": "1.5.0"` declared in `packages/runner/package.json` prevents reliance on hoisted dependencies.

### Probe 3: Entry Point Wiring & Actual Real Startup (AP-020, AP-075) — PASS
- Unlike initial draft unit tests that bypassed native engine creation via `MockAgentEngine`, real production native Root startup was executed under an isolated filesystem sandbox (`HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `PI_AGENT_DIR`), with `noGlobalExtensions: true` and owned in-memory streams.
- Factory invocation flags were verified:
  * `customCoreCalled === true`: Core factory invoked by real startup; owned file effect verified (`writeFile` / `readFile`).
  * `customNativeCalled === true`: Native factory invoked by real startup; owned file effect verified (`writeFile` / `readTextFile` with `BACKGROUND_CONTEXT`).
  * Default wiring: starts real native root without either factory and provides full 24 native SDK methods.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076) — PASS
- Zero `@ts-ignore`, zero `@ts-expect-error`, zero new `any` casts.
- `composition.ts` is 185 LOC (well within AP-019 hard limit of 250 LOC).
- Execution is strictly bounded with owned streams and `finally instance.close()` teardown; zero process hangs (executes in <1.3s).

---

## 3. Independent Verification Evidence

### A. Independent Rerun of Author Test Suite
- **Command:** `node --test --test-timeout 20000 packages/runner/test/native-env-seam.test.ts`
- **Result:** **6 tests passed, 0 failed, 0 errors** in 1.28s.
- **Saved Artifacts:**
  * Spec log: `independent-seam-rerun.log`
  * JUnit XML: `independent-seam-rerun.junit.xml`

### B. Native Semantic Probes Suite (`native-env-seam-probes.test.mjs`)
- Executed via `node --test` with native JUnit reporter under hermetic sandbox:
  * Probe 1: Rejects configuration with BOTH factories as genuine error (PASS, 2.17ms).
  * Probe 2: Actual native Root startup with custom Core factory invokes factory and creates owned file effect (PASS, 42.8ms).
  * Probe 3: Actual native Root startup with custom Native factory invokes factory and creates owned file effect (PASS, 18.9ms).
  * Probe 4: Actual native Root startup with DEFAULT wiring uses NodeExecutionEnv with 24 required native methods (PASS, 16.2ms).
- **Result:** **4/4 probes passed** in 80.9ms.
- **Saved Artifacts:**
  * Spec log: `native-env-seam-probes.log`
  * JUnit XML: `native-env-seam-probes.junit.xml`

### C. Negative Control Receipt (`negative-control.test.mjs`)
- Deliberate assertion failure (`assert.equal(1, 0)`) confirmed that failure in the verification harness strictly returns **`EXIT_CODE: 1`**.
- **Saved Artifact:** `negative-control.log`.

---

## 4. Architecture Verification (Scoped to Root Seam Selection)

- **Passed Rules:**
  * **AP-010 (Modular Monolith & Ports/Adapters):** Clean separation between Core SPI execution environment and native SDK execution environment.
  * **AP-011 (Low Coupling, High Cohesion):** Explicit seam configuration at composition root; no accidental coupling between adapters.
  * **AP-012 (Fail-Fast):** Mutually exclusive configuration strictly rejected with explicit Error.
  * **AP-014 (SOLID & Clean Code):** Single responsibility for environment selection.
  * **AP-019 (Line Budget Reality):** `composition.ts` is 185 LOC.
  * **AP-020 (Composition Root):** Composition root owns the concrete choice of environment factory.
  * **AP-025 (Import Discipline):** Explicit direct dependency in `packages/runner/package.json` with lockfile pinning.
  * **AP-028 (Testing Strategy & Determinism):** Hermetic filesystem sandbox ensures deterministic test execution without hanging or polluting host state.
  * **AP-074 (Explicit DI):** Clean factory parameter injection; zero hidden singletons or global shadow defaults.
  * **AP-075 (Walking Skeleton):** Production native root startup succeeds with both custom factories and default wiring.
  * **AP-076 (Anti-Hollow & Receipt Integrity):** Factory invocation verified with concrete file effects and real receipts.
- **Residual Risk & Explicit Boundaries:**
  * Component approval covers ONLY the Root seam selection delta (`packages/runner/src/composition.ts`, `packages/runner/package.json`, `pnpm-lock.yaml`).
  * Core A helper semantics (4 groups) are being remediated in parallel by Author A (`parent-r8-review/findings.json`).
  * Full product I/O acceptance of native built-in tools (e.g. read/write/edit/bash) is prepared for public compiled R3 journeys and is not claimed as verified solely by method list checks.

---

## 5. Final Verdict

**VERDICT: PASS (Root Seam Component Scope)**

The Root execution environment seam selection cleanly implements the parent R8 technical amendment. Mutual exclusion is fail-fast, custom Core environments are not shadowed, default native wiring provides all 24 native SDK methods, and real native startup with owned file effects is proven.

All review deliverables and verification receipts are preserved under `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/native-env-seam/independent-review/`. Source quiescence active; holding for parent orchestration.
