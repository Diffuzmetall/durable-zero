# Closing typecheck remediation A — original native author

Original author thr_tcbhyv8p4r. This is REQUIRED closure of existing strict verification gate, not a new feature/probe/host/admin scope. Source ad99873e had genuine minimum native source+product PASS, but independent clean-build/typecheck audit now shows113 production diagnostics. Do not call esbuild/runtime success full type-safety acceptance.

Read current AGENTS, arch-improvement-fix/arch-rules + TDD/verification skills, canonical plan. Primary evidence live/task-1/closing-build-typecheck/{diagnostic-tsconfig.json,tsc-diagnostic.log,findings.json,findings.md}. Existing declared clean build passed; production-only strict diagnostic fails. Native84 approximate ownership share = adapter-pi-durable77 + core6 + execution1 (derive actual counts from logs; no fake success).

## Exclusive new lease A
- packages/adapter-pi-durable/src/**, packages/core/src/**, packages/execution/src/**.
- Retained native/Core focused regressions you already own; new targeted type/runtime regressions for these modules.
- NO runner/src/**, contracts/src/**, adapter-pi-ai/src/**, protocol/src/**, package/lock/root tsconfig/build config, architecture-boundaries*, or legacy/native test migration files. Lease B original4B author now owns Runner/foundation/config to repair29 remaining diagnostics; parent owns orchestration/coordination.
- Old frozen build/review artifacts unchanged; evidence NEW live/task-1/closing-typecheck-remediation/native-core/.

## Remediation invariants
- Preserve root strict/exactOptionalPropertyTypes/noUncheckedIndexedAccess/verbatimModuleSyntax. No blanket any, @ts-ignore/nocheck, false declarations, feature deletion or disabling options to get green.
- Stateful fields intentionally cleared to undefined should have honest T|undefined slots; optional DTO/SDK properties normally OMIT absent fields. Do not blanket widen every public optional contract.
- Fix bridge/contracts deep broken relative imports via genuine public @durable-zero/contracts exports, not another depth guess or restoring Core concrete exports. RunnerEvent belongs contracts. Pure CliArgs cross-package contract is coordinated by lease B; don't create Core->native or adapter->runner dependencies.
- Actual native branded ConversationId/SubmissionId use installed SDK validated constructors/conversion, no arbitrary casts from random numbers or invented IDs.
- Core index duplicate PromptOptions must be semantically disambiguated, preserving correct public DTO meaning; pure Zod policy/store optional-nullability aligned to real validation, no casts replacing soundness.
- CRITICAL real DI issue: IExecutionEnvironment currently has readFile/writeFile/exec/stat/list/cleanup, while installed SDK ExecutionEnv expects21+ richer methods. Native env collection passes/casts pure port directly, and async factory may be cast synchronously. Inspect ACTUAL pinned SDK and local execution adapter. Do not hide with `as ExecutionEnv`, stub missing methods, or silently replace injected custom env with default. Reuse supported native bridge/helper if available; preserve all actual native I/O/tool behavior and effect of injected factory. If no bounded sound bridge exists, return exact primary-source blocker/design ruling request rather than guess or add fake methods. This is an existing broken contract, not permission for new tool APIs or agent loop.
- Any Env bridge/API repair needs genuine effect regression (existing native builtin/codemode file/exec on owned temp path, public scripted-model seam if E2E; not mere ctor spy). No real model/network/auth/original databases. No new host reverse-RPC/admin integration.

Use B's eventual official source-only typecheck config (strict preserved) and report real remaining diagnostics. You can make meaningful independent optional-field/import fixes while pure DTO contract is coordinated. Do not wait silently or edit B files. No shared dist/build races; coordinate any needed build through parent/B mechanical verifier. First useful saved RED/GREEN/type-diagnostic batch <=10min then HOLD for immediate backup, explicit completed/remaining counts and SDK citations. No commits/spawns/ledger/provider changes. Source changes require fresh verification; old Native min PASS remains pinned, not transferred automatically.
