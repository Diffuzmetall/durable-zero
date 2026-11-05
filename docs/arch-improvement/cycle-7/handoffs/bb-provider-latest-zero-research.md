# Research brief: BB Pi Durable provider → latest durable-zero

Parent: thr_9yjb93iwmn. Role: bounded independent architecture/integration researcher. No implementation, no child agents, no commits/pushes. Parent owns scope and acceptance.

## Mandatory reading BEFORE investigation
- /Users/vanya/Projects/AGENTS.md
- /Users/vanya/Projects/MEMORY.md
- /Users/vanya/Projects/bb-plugin-provider-pi-durable/AGENTS.md
- /Users/vanya/Projects/durable-zero/AGENTS.md
- /Users/vanya/Projects/arch-improvement-skills/skills/arch-improvement-review/SKILL.md
- /Users/vanya/Projects/arch-rules-skills/skills/arch-rules-implementation-review/SKILL.md
- /Users/vanya/Projects/arch-rules/arch-rules.md
- /Users/vanya/.agents/skills/bb-cli/SKILL.md

## User task
Investigate exactly what must change in the existing BB provider to consume the current/latest durable-zero. Identify any remaining dependency extraction or new/adjusted public seams required on the durable-zero side. Extraction proposals are allowed; implementing them is NOT this task. Form a source-evidenced migration plan, not another generic architecture opinion.

Targets:
- /Users/vanya/Projects/bb-plugin-provider-pi-durable
- /Users/vanya/Projects/durable-zero
- /Users/vanya/Projects/pi (upstream primary source)
- /Users/vanya/Projects/bb-reference (BB bundles/types/source maps primary source)

Historical reference: @thread:thr_usuwfbnhx7. Parent has saved full historical thread log in /Users/vanya/.bb/thread-storage/thr_9yjb93iwmn/old-provider-audit-log.json. Read relevant conclusions but treat EVERY claim as stale until rechecked. That audit suggested a new Core agent loop, which is NOT an acceptable direction: preserve the real native Harness loop and existing Pi runtime capabilities. It also proposed deleting dependencies wholesale without tracing consumers; do not repeat that.

## Current durable-zero context, must verify against actual source
- Working branch cycle-7-runtime-adapter-ioc-migration; capture actual HEAD/dirty status and exact source hashes before conclusions.
- Last verified production source 7e12fa592a7de537ade6424f1b1a8a9aa4e6b648; test-only fixes 513d37264c364cdcb733d3da7677911627d8c964. Later commits are mostly documentation; pin current actual inputs yourself.
- Native CLI/Harness/SQLite minimum has bounded source/product acceptance. Official strict production typecheck and cold full root 374/374 passed. Read docs/arch-improvement/cycle-7/stage-closure-acceptance.json and cited receipts; do NOT infer full BB integration readiness from these gates.
- Full dispatcher/admin production mount, native HostBridge reverse-tool continuation, no-session probe/full capability parity remain outside accepted scope. Re-evaluate exact present implementation of each.
- Native execution ABI was repaired: full native ExecutionEnv factory is distinct from limited Core IExecutionEnvironment bridge; do not collapse them or fabricate unsupported success.
- Package version 0.26.31 != runtime SDK 1.5.0 != source commit. Latest source, published package and installed artifact may differ. Record provenance, do not silently install/update anything.

## Broader user intent (research lens, NOT current completeness claim)
Zero is intended as a headless/backendless toolkit for assembling one's own harness; Durable Zero is the Pi Durable-backed reference implementation. The goal is independently configurable/replacable codemode, execution environment (including remote), model sources (direct OpenAI or Pi), proxy/routing and host integration. Check which couplings actually remain and which abstractions are decorative. Backendless does not mean no process/storage/remote compute: it means no mandatory vendor-hosted application backend. Do not market future adapters as shipped.

## Required investigation
1. Inventory the provider's actual runner discovery/install/version resolution, bundled assets, dependencies and import reachability. Do NOT recommend deletion until every real consumer is traced.
2. Trace BB entry point → provider/session lifecycle → runner process/RPC → durable-zero composition/native engine. Distinguish current bundled/installed runner from local latest source.
3. Contract matrix per feature: readiness, model/catalog probe, prompt/admission, deltas and block indexes, abort/reuse, state/transcript/stats, host tools and interaction, dynamic registrations, subagent policy/graph, fork/copy/resume, settings/resources/MCP/skills/extensions, shutdown/retry/errors. For each cite provider consumer, current zero producer, wire shape, gap, owner, minimum test.
4. Identify vendor/core/persistence leaks across the BB boundary, duplicate stores/locks and live session ownership hazards. Separate host state from engine-owned state.
5. Evaluate minimal viable migration and subsequent parity slices with dependencies and P0–P2 blockers. Distinguish work in BB provider, work in durable-zero, optional future extraction, and explicit deferred features.
6. Explain what extractions would enable genuine Zero toolkit reuse without inventing an alternative agent loop or generic abstraction with no consumer.
7. Define hermetic acceptance: public APIs, synthetic provider seam only, real Harness/storage/tool roundtrip where applicable, explicit cancellation/deadlines, owned environment/resources. No live LLM/auth/network/private original databases. Commands ≤60s, tests ≤30s; justified native E2E outer hard bound ≤120s with failure-safe cleanup. No force-exit to make a hang green.

## Evidence/review format
Use concrete AP rules and required Semantic Probes: dependency invocation traceability, split-brain/import completeness, real entry-point wiring, anti-gaming/completeness. Findings: [P1/P2] title; Evidence file:line; Impact; Rule AP-###; Fix decision. Include Architecture verification with Passed AP-### and Residual risk. Research can conclude integration NOT READY; do not invent passing acceptance for unexecuted paths. Never reuse old claims such as missing start() or fake rec_ admission without current proof.

## Write lease and outputs
You may write ONLY /Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/bb-provider-migration-research/ . Everything else is read-only. No source/test/package/lock changes, installs, service restarts, branch switches, DB access, git cleanup or public uploads.
Deliver report.md, findings.json, contract-matrix.json, source-provenance.json and migration-slices.md. Put command evidence in that owned directory; do not publish raw BB transcripts or private configuration.

Send a useful checkpoint within ~10 minutes with concrete inspected paths/findings and a saved partial artifact. Finish with a short result to parent; final notification is automatic. Mark HOLD after report; do not start implementing. Parent is building the unrelated Motion presentation under cycle-7/presentation/; do not touch it or shared ledger/README.
