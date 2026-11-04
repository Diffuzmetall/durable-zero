# Cycle 7 — Architecture, Implementation, and Evidence Index

Branch: `cycle-7-runtime-adapter-ioc-migration`  
Source Baseline: `7d4b235` and docs checkpoints `6891b73`, `cafd5f9`, `07609af`.  
Current Status: **Native walking skeleton NOT accepted.** Protocol 4A candidate `f3fff38` has bounded architecture/product PASS; HostBridge candidate `efc9eab` has component architecture PASS only. Global S9 acceptance is pending.

---

## 1. Quick Links

- **Interactive Architecture & Status:** [architecture/durable-zero-architecture-status.html](architecture/durable-zero-architecture-status.html)
- **Architecture Diagrams (SVG):** [AS IS SVG](architecture/durable-zero-architecture-asis.svg) · [TO BE SVG](architecture/durable-zero-architecture-tobe.svg)
- **Status Analysis (Markdown):** [architecture/durable-zero-architecture-status.md](architecture/durable-zero-architecture-status.md)
- **Machine-readable Status Data:** [architecture/durable-zero-architecture-status.json](architecture/durable-zero-architecture-status.json)
- **Canonical Plan:** [2026-11-04-cycle-7-runtime-adapter-ioc-migration.md](../../superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md)
- **Shared Ledger:** [docs/arch-improvement/ledger.md](../ledger.md)
- **Packaging Manifest:** [manifests/relocation-manifest.json](manifests/relocation-manifest.json)
- **Validation Report:** [manifests/final-validation-report.md](manifests/final-validation-report.md)

---

## 2. Directory Structure and Deliverables

All deliverables have been promoted from ephemeral thread storage into permanent, version-controlled project paths.

```text
docs/arch-improvement/cycle-7/
├── README.md                              # This index
├── architecture/                          # Architecture status, diagrams, snapshot, and renderer
│   ├── durable-zero-architecture-status.html # Responsive status dashboard (29 verified relative links)
│   ├── durable-zero-architecture-status.md   # Analysis markdown
│   ├── durable-zero-architecture-status.json # Status JSON schema
│   ├── durable-zero-architecture-asis.svg    # Valid standalone SVG
│   ├── durable-zero-architecture-tobe.svg    # Valid standalone SVG
│   ├── architecture-map-source-snapshot.json # Immutable source snapshot with file SHA256 hashes
│   ├── architecture-map-migration-metrics.json
│   ├── architecture-map-slice0-command-receipts.json
│   └── render-architecture-status.py      # Self-contained source-relative renderer
├── reviews/                               # Author reports and independent re-reviews
│   ├── cycle7-task-1-report.md            # Task 1 / Slice 0 author progress report
│   ├── cycle7-protocol-report.md          # Task 4A Protocol author report
│   ├── cycle7-hostbridge-report.md        # Task 2A HostBridge author report
│   ├── protocol-architecture-rereview-r1.md # Independent architecture re-review (PASS in scope)
│   ├── protocol-product-rereview-r1.md    # Independent product re-review on compiled package (PASS in scope)
│   ├── hostbridge-architecture-review.md  # Independent component architecture review (PASS in scope)
│   ├── protocol-architecture-findings-r1.json
│   ├── protocol-product-findings-r1.json
│   ├── hostbridge-architecture-findings.json
│   └── parent-acceptance-findings.json
├── audit/                                 # Plan audit, AST import graph, and contract baselines
│   ├── cycle7-plan-audit.md               # Independent audit of Cycle 7 plan
│   ├── plan-findings.json                 # Structured plan audit findings
│   ├── third-party-adjudication.json      # Third-party adjudication
│   ├── baseline-import-graph.json         # Baseline AST dependency graph
│   ├── core-vendor-imports.json           # Vendor import analysis in Core
│   ├── audited-plan-ab637a6.md            # Audited plan snapshot
│   ├── initial-cycle7-plan.md             # Initial plan draft
│   ├── plan-76145d4-frozen.md             # Frozen approved plan candidate
│   ├── plan-76145d4-commit-proof.txt
│   ├── plan-76145d4-review.diff
│   ├── plan-candidate-5b15b5e.md
│   ├── plan-repair-review-round1.md
│   ├── plan-repair-review-round2.md
│   ├── plan-contracts-wip-source-check.md
│   ├── plan-final-contracts-author-report.md
│   └── latest-plan-change.patch
├── evidence/                              # RED/GREEN receipts, diffs, build logs, and candidate packages
│   ├── cycle7-task-1-red.log              # Verified RED receipt: walking skeleton timeout (exit 1)
│   ├── protocol-conformance-red.junit.xml / .log
│   ├── protocol-conformance-green.junit.xml / .log
│   ├── protocol-fixround1-red.junit.xml / .log
│   ├── protocol-fixround1-green.junit.xml / .log
│   ├── protocol-product-test.junit.xml / .log
│   ├── protocol-product-test-r1.junit.xml / .log
│   ├── host-methods-red.junit.xml / .log
│   ├── host-methods-green.junit.xml / .log
│   ├── host-bridge-red.junit.xml / .log
│   ├── host-bridge-green.junit.xml / .log
│   ├── fix-round-1-kind-override-red.junit.xml / .log
│   ├── redo-host-methods-behavioral-red.junit.xml / .log
│   ├── redo-host-methods-behavioral-green.junit.xml / .log
│   ├── redo-host-bridge-behavioral-red.junit.xml / .log
│   ├── redo-host-bridge-behavioral-green.junit.xml / .log
│   ├── protocol-named-generic-probe.json / fixed.json
│   ├── hostbridge-kind-boundary-probe.json / fixed.json
│   ├── protocol-product-journeys.json / r1.json
│   ├── protocol-package-build.log / fix-r1-build.log / import.log
│   ├── protocol-candidate-manifest.json / fix-r1-manifest.json
│   ├── protocol-candidate-commit.log / fix-r1-commit.log
│   ├── hostbridge-candidate-commit.log / fix-r1-commit.log
│   ├── hostbridge-fixed-manifest.json
│   ├── protocol-fix-r1-review.diff / review-raw.diff / parent-inspection.diff
│   ├── hostbridge-review-package-fixed.diff / all-raw.diff / parent-inspection.diff
│   ├── protocol-package/                  # Pre-fix built candidate package & consumer test suite
│   │   ├── dist/index.js                  # SHA256: a4eafbd7365b261f6645442a4646b5c01fc9192ce056f8f479087b7e0573578f
│   │   ├── package.json
│   │   ├── generate-journey-artifacts.mjs
│   │   ├── test-consumer-server.mjs
│   │   └── test-suite.mjs
│   └── protocol-package-fix-r1/           # Fixed candidate package & consumer test suite
│       ├── dist/index.js                  # SHA256: 24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514
│       ├── package.json
│       ├── generate-journey-artifacts.mjs
│       ├── test-consumer-server.mjs
│       └── test-suite.mjs
├── historical/                            # Truthful record of initial failures and earlier rounds
│   ├── protocol-architecture-review.md    # Initial Round 0 review (surfaced P1 findings)
│   ├── protocol-architecture-findings.json
│   ├── protocol-product-review.md         # Initial Round 0 product review (surfaced P1 findings)
│   ├── protocol-product-findings.json
│   ├── protocol-fix-round-1.md            # Fix Round 1 instructions
│   ├── hostbridge-fix-round-1.md          # Fix Round 1 instructions
│   ├── durable-zero-architecture.html     # Pre-rereview architecture visualization
│   ├── durable-zero-architecture.json
│   ├── durable-zero-current.svg
│   ├── durable-zero-target.svg
│   └── durable-zero-checkpoint-*.log / .json / .txt
└── manifests/                             # Machine-readable inventory of moved deliverables
    ├── relocation-manifest.json           # 116 deliverables, SHA256, exclusions, and verifications
    └── final-validation-report.md         # Final verification and reproducibility report
```

---

## 3. Honest Status and Bounded Scope

1. **Protocol 4A (Commit `f3fff38`):**
   - Verified by independent architecture re-review ([protocol-architecture-rereview-r1.md](reviews/protocol-architecture-rereview-r1.md)) and compiled-package product test ([protocol-product-rereview-r1.md](reviews/protocol-product-rereview-r1.md)).
   - Conformance: StdioJsonRpcServer correctly handles notifications, request ID types, XOR response objects, reverse RPC, and typed method-not-found errors.
   - Candidate Artifact: Frozen and preserved at [evidence/protocol-package-fix-r1/dist/index.js](evidence/protocol-package-fix-r1/dist/index.js) (SHA256: `24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514`).
   - Boundary: Scope is strictly limited to `@durable-zero/protocol`. It does NOT accept the full runner capability dispatcher.

2. **HostBridge 2A (Commit `efc9eab`):**
   - Verified by independent component review ([hostbridge-architecture-review.md](reviews/hostbridge-architecture-review.md)).
   - Conformance: 36 component test cases pass; kind overrides and boundary probes verified.
   - Boundary: Scope is strictly component-level `IHostBridge` adapter. Full integration into composition, Harness, model tool call loop, and client result continuation remains pending.

3. **Task 1 / Slice 0 Walking Skeleton (WIP):**
   - Author progress documented in [cycle7-task-1-report.md](reviews/cycle7-task-1-report.md).
   - Test Status: **UNACCEPTED / TIMEOUT.** Verified physical receipt [evidence/cycle7-task-1-red.log](evidence/cycle7-task-1-red.log) proves the end-to-end test timed out at 60s.
   - Open Defects: Production fallback in `SessionCoordinator` (returns synthetic `rec_...` when no engine is provided), decorative DI in `composition.ts` (resources not wired to consumer), placeholder metrics in `getStats` (`tokens: null`), and prompt blocking after `abort`.

---

## 4. Exclusion of Harness Internals

In compliance with project safety rules, the following harness-internal categories are strictly excluded from git publication and remain in scratch storage:
- Raw LLM conversation/session JSON dumps (`thread-rfpk.json`, `thread-usuw.json`, `pi-dialogue.md`).
- Background compaction scripts and IPC daemon state (`compact-when-idle.py`, pid/log files).
- Private GBrain database schemas and sources (`brain-schema.json`, `brain-sources.json`).
- Ephemeral raw stream event logs (`*-events.json`).
- Host OS process dumps and local environment provider configurations.
