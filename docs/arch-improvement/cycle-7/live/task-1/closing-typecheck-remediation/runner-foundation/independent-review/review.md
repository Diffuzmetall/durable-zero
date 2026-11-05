# Independent Architecture Re-Review: Closing Typecheck Remediation — Lease B (Runner Foundation)

**Review Date:** 2026-11-05  
**Reviewer Role:** Independent Source/Spec Architecture Reviewer  
**Frozen Reference Commit:** `ecf7c69868c34b6fb0bc5a30b083f4de8a1ce075`  
**Delta Under Review:** Lease B delta `70f4a88` vs `34d33f27`  
**Review Deliverables Directory:** `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/runner-foundation/independent-review/`  

---

## 1. Executive Summary & Review Scope

This independent architecture review evaluates the Type Remediation Lease B delta (`70f4a88` vs `34d33f27`) against the frozen reference commit `ecf7c69868c34b6fb0bc5a30b083f4de8a1ce075`.

### Environment & Source Provenance Qualification
- **Live Shared Checkout Disclosure:** Testing and probe execution occurred directly in the live shared workspace checkout, not an isolated hermetic container. Sibling package files (notably `packages/adapter-pi-durable` and `packages/execution`) and pre-existing `dist/` bundles are live/mixed dependencies undergoing concurrent remediation by Author A.
- **Lease B Source Blob SHA256 Verification:** The executed Lease B production source files match the frozen reference commit `ecf7c69868c34b6fb0bc5a30b083f4de8a1ce075` character-for-character:
  * `packages/runner/src/dispatch/session-dispatcher.ts`: `61b982c87ad1fb1dbbf85aee2fd793c3dff54e9c63b29b0dedbefcdcdbeb5bfc`
  * `packages/runner/src/dispatch/normalizers.ts`: `19c9334012e06f15bfab04cd51c67157c2d8ba827fbbe1a917801d89bf266cf9`
  * `packages/runner/src/dispatch/types.ts`: `4fdddc5059320789ac0ff19fc11aa2309f7243077c5d5f98cff990cefbb22583`
  * `packages/runner/src/dispatch/index.ts`: `6826069ef0a0b55e31f24402d7a97553250f85580f88fc3777916d1bc0ff0005`
  * `packages/contracts/src/cli-args.ts`: `43a8f3a39e8d1976510e14167e452589088523c93da27d14c2b9f33b1e77840d`
  * `packages/contracts/src/runtime-graph/status.ts`: `44b105f9cb558509e51c8a514d3f32e92c68f237f3747c0b0a8805f77fe78426`
  * `packages/protocol/src/jsonrpc/errors.ts`: `eab32fd3c9f2252a16c11db844fb2ad4a02e6e30018b14a274db27c282688f34`
  * `packages/adapter-pi-ai/src/model-setup.ts`: `3d0f5a703135cb17c37df6ff85ad0556dbfa0bf23e1d6c827ea802ca1fc4ba3f`
  * `packages/adapter-pi-ai/src/model-provider.ts`: `9366119851e3c861216d2105a3e144a0709f6f6988897be4f74d0a1b80d0d8fa`
  * `packages/runner/src/cli-args.ts`: `48b4887372cf0175b9fa76ecddc2545f1bce866a2fe57878fa360c732ca4aee6`
  * `packages/runner/src/composition.ts`: `b170e0172e2d93eec608d0a8767980cf7bc6986cf339fa8a24ca18a7a0fbebe3`
  * `packages/runner/src/main.ts`: `fff63fb89531548e351833d7b884d33458db41f02c610bafe74274092b3a985e`
  * `packages/runner/src/host/host-bridge.ts`: `7b62b489a23d069b827e46fcb99fe1e5504fc8fe190b2302e1bdf69a6c9d2fbe`
  * `tsconfig.src.json`: `9e034aeb337854619cb75a89452ec872473489814429e3a6a9be8e7c1ce71649`

### Bounded Scope Ownership
- **Configuration:** `tsconfig.src.json` (official source-only configuration), root `package.json` (`typecheck` script).
- **Foundational Contracts:** `packages/contracts/src/cli-args.ts`, `packages/contracts/src/runtime-graph/status.ts`, `packages/contracts/src/index.ts`.
- **Protocol:** `packages/protocol/src/jsonrpc/errors.ts`.
- **Adapter Pi AI:** `packages/adapter-pi-ai/src/model-setup.ts`, `packages/adapter-pi-ai/src/model-provider.ts`.
- **Runner Foundation:** `packages/runner/src/cli-args.ts`, `packages/runner/src/composition.ts`, `packages/runner/src/main.ts`, `packages/runner/src/host/host-bridge.ts`, `packages/runner/src/dispatch/normalizers.ts`.
- **Capability Test:** `packages/runner/test/capability-dispatch.test.ts` (root abort behavioral assertion).

---

## 2. Mandatory Semantic Probes (Evidence-Backed)

### Probe 1: Dependency Traceability (AP-074, AP-076) — PASS
- Pure shared config DTO `CliArgs` in `@durable-zero/contracts` decouples CLI arguments from runtime internals.
- `setupRunnerModels(cwd, args)` in `@durable-zero/adapter-pi-ai` consumes `CliArgs` from contracts, eliminating circular dependency on Core.
- `RunnerCliArgs` produced by `packages/runner/src/cli-args.ts` is strictly assignable to `CliArgs`, maintaining producer-consumer consistency without decorative adapters.

### Probe 2: Runtime Completeness & Split-Brain Elimination (AP-010, AP-025) — PASS
- Path mappings in `tsconfig.src.json` cleanly map workspace packages (`@durable-zero/*`) to `./packages/*/src/index.ts`.
- `normalizers.ts` in runner imports `PromptInput` and `PromptContentPart` directly from `@durable-zero/contracts`.
- *Build Qualification:* Historical clean build (exit code 0 at milestone `ad99873`) is noted as context; no new shared build was executed or claimed as part of this review to avoid perturbing live shared workspace dist files.

### Probe 3: Entry Point Wiring (AP-020, AP-075) — PASS
- `packages/runner/src/main.ts` parses CLI flags and invokes `assembleDurableZero` with exact optional property omissions under `exactOptionalPropertyTypes: true`.
- Zero runtime options or config parameters are lost or silently dropped.

### Probe 4: Anti-Gaming & Line Budget Reality (AP-019, AP-076) — PASS
- **Anti-Gaming:** Zero `@ts-ignore`, zero `@ts-expect-error`, zero new `any` casts introduced in Lease B.
- **Line Budgets:** All modified files remain strictly within AP-019 thresholds (`cli-args.ts`: 73 LOC, `status.ts`: 105 LOC, `normalizers.ts`: 115 LOC, `model-setup.ts`: 102 LOC, `model-provider.ts`: 80 LOC).

---

## 3. Detailed Technical Verification

### A. TypeScript Compiler Configuration (`tsconfig.src.json`)
- **Strict Flags Preserved:** `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `noEmit: true`, `allowImportingTsExtensions: true`.
- **Inclusion Scope:** `include: ["packages/*/src/**/*.ts"]` encompasses all production TypeScript files across all 9 monorepo packages.
- **Exclusion Scope:** Tests, fixtures, build artifacts, and docs are cleanly excluded.

### B. Pure DTO Consistency (`CliArgs` vs `RunnerCliArgs`)
- `packages/contracts/src/cli-args.ts` declares pure readonly DTO `CliArgs`.
- `packages/runner/src/cli-args.ts` declares `RunnerCliArgs` returned by `parseCliArgs(argv)`.
- Because mutable arrays in `RunnerCliArgs` (`extensions?: string[]`) are covariant to readonly arrays in `CliArgs` (`extensions?: readonly string[]`), `RunnerCliArgs` satisfies `CliArgs` without structural conversion or data loss.

### C. CLI Parser Robustness & Trailing Arguments
- `packages/runner/src/cli-args.ts` was audited against out-of-bounds argv lookups.
- Verified via independent probe: running `parseCliArgs(["--session"])` with a missing value leaves `session` undefined and does not throw or mutate other fields.

### D. Optional Property Semantics & Omission Discipline
- Under `exactOptionalPropertyTypes: true`, assigning `{ prop: undefined }` to `prop?: T` is illegal.
- In `status.ts` (`projectTaskState`, `projectTaskReceipt`), `composition.ts`, `main.ts`, and `host-bridge.ts`, properties are conditionally included using spread omission `...(val !== undefined ? { prop: val } : {})`.
- Independent probe confirmed that projected states (`pendingState`, `receipt`) do not contain absent keys.

### E. Nominal Error Identity & Root Abort Behavioral Assertion
- `JsonRpcMethodNotFoundError` in `packages/protocol/src/jsonrpc/errors.ts` types `public readonly method?: string | undefined;`, resolving exact optional assignment while preserving nominal `instanceof` prototype checks.
- In `packages/runner/test/capability-dispatch.test.ts:358`, the root abort test was updated from asserting the deprecated `coordinator.isAborted` boolean to asserting real behavioral contracts:
  1. Method return equals `{ ok: true }`.
  2. Engine call receipt: `assert.deepEqual(engine.abortedConversations, ["1"])`.
  3. Event emission: verified listener receives `{ type: "session/aborted" }`.
- *Probe 4 Qualification:* Probe 4 in `remediation-b-probes.test.mjs` verifies `createSessionDispatcher` delegation logic against a lightweight mock (proving that `session/abort` invokes `coordinator.abort(conversationId)` and returns `{ ok: true }`). It does NOT test the real `SessionCoordinator` lifecycle or event emitter in isolation; the authoritative verification for the real Core `SessionCoordinator` event/abort integration is the genuine 90-subset capability test (`packages/runner/test/capability-dispatch.test.ts:358`), which passed in the independent 90-case run.

### F. Attribution & Diagnostic State Qualification
- **Live State Attribution:** Author report claimed Core reached 0 errors via `CliArgs`. In reality, Core's 6 prior errors were remediated by Author A (`batch-1`). B's `CliArgs` unblocked `adapter-pi-ai`, but Core's 0-error state reflects A's concurrent work.
- **Diagnostic Snapshot:** Residual typecheck diagnostics (56 errors at time of re-review) reside strictly within `packages/adapter-pi-durable/src/` (Author A scope). Lease B scope (`runner`, `contracts`, `adapter-pi-ai`, `protocol`) has **0 errors**.
- **Pre-existing Code:** `thinking: options.thinking as any` in `composition.ts:101` was present prior to Lease B and was preserved without introducing new suppressions.

---

## 4. Independent Verification Evidence

### A. Independent 90-Subset Test Execution
- **Command:** `node --test --test-timeout 30000 packages/protocol/test/protocol.test.ts packages/protocol/test/protocol-conformance.test.ts packages/runner/test/capability-dispatch.test.ts packages/runner/test/host-bridge.test.ts packages/runner/test/composition-root.test.ts`
- **Result:** **90 tests passed, 0 failed, 0 skipped** across 20 suites in 1.35s.
- **Artifacts Saved:**
  * Spec log: `independent-90-subset.log`
  * JUnit XML: `independent-90-subset.junit.xml`

### B. Native Semantic Probes Suite (`remediation-b-probes.test.mjs`)
- Executed via `node --test` with native JUnit reporter:
  * Probe 1: `parseCliArgs` produces valid DTO and handles trailing flags (PASS).
  * Probe 2: Contracts `projectTaskState` and `projectTaskReceipt` omit undefined keys (PASS).
  * Probe 3: `JsonRpcMethodNotFoundError` preserves nominal identity and optional method field (PASS).
  * Probe 4: Dispatcher delegation: `session/abort` forwards conversationId and returns `{ ok: true }` (PASS; qualified as delegation check, real coordinator lifecycle verified by capability-dispatch test).
  * Probe 5: `tsconfig.src.json` strict compiler options and package inclusions verified (PASS).
- **Result:** **5/5 probes passed** in 23.6ms.
- **Artifacts Saved:**
  * Spec log: `remediation-b-probes.log`
  * JUnit XML: `remediation-b-probes.junit.xml`

### C. Negative Control Receipt (`negative-control.test.mjs`)
- Deliberate assertion failure (`assert.equal(29, 0)`) confirmed that failure in the verification harness strictly returns **`EXIT_CODE: 1`**.
- **Artifact Saved:** `negative-control.log`.

---

## 5. Architecture Verification (Scoped to Lease B Component Scope)

- **Passed Rules:**
  * **AP-010 (Modular Monolith & Ports/Adapters):** Foundational `CliArgs` in `@durable-zero/contracts` cleanly decouples CLI configuration across packages.
  * **AP-011 (Low Coupling, High Cohesion):** Runner, contracts, protocol, and adapter-pi-ai maintain clear boundaries.
  * **AP-012 (Fail-Fast):** Strict typechecking enforced without compiler escape hatches.
  * **AP-014 (SOLID & Clean Code):** Clean DTO definitions and option normalizations.
  * **AP-018 (Clarity):** Explicit option omission via object spreads.
  * **AP-019 (Line Budget Reality):** All touched files comfortably within line limits.
  * **AP-020 (Composition Root):** Composition and main cleanly wire dependencies under exact optional types.
  * **AP-022 (Typed Errors):** Nominal error identity preserved in `@durable-zero/protocol`.
  * **AP-025 (Import Discipline):** Public package specifiers used across all packages.
  * **AP-026 (API Contracts & DTOs):** Clean DTO schemas and projections in contracts.
  * **AP-028 (Testing Strategy & Determinism):** 90/90 deterministic test execution; independent logs and JUnit captured.
  * **AP-029 (TypeScript Strictness):** Official `tsconfig.src.json` created enforcing full strictness; 0 errors across all 5 Lease B packages.
  * **AP-074 (Explicit DI):** Clean dependency passing without hidden singletons.
  * **AP-076 (Anti-Hollow):** True behavioral and event assertions in tests.
- **Residual Risks & Explicit Boundaries:**
  * Scope PASS is strictly bounded to Lease B (`runner`, `contracts`, `adapter-pi-ai`, `protocol`, and `tsconfig.src.json`).
  * Global typecheck non-zero exit code (56 errors) remains expected until Author A completes native remediation in `packages/adapter-pi-durable`.
  * No new shared build was executed or claimed in this review; dist bundles remain live/mixed dependencies in the shared checkout.
  * Component approval does not substitute for whole-cycle integrated walking skeleton acceptance.

---

## 6. Final Verdict

**VERDICT: PASS (Lease B Component Scope)**

All 29 Lease B typecheck errors are completely resolved under strict TypeScript compiler flags without relaxations or `@ts-ignore` pragmas. All 90 subset tests pass cleanly with verified native test receipts, qualified probe provenance, and negative control validation.

Holding for parent orchestration.
