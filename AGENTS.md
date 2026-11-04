# durable-zero working contract

## Delivery and preservation

- Commit and push meaningful work immediately to the current working branch, including WIP and public repositories. Do not wait for consistency, tests, review or completion. Mark WIP honestly; remote backup is not acceptance, merge or release. Never publish secrets/private data or force-push without separate authorization.
- User-facing artifacts belong in `docs/arch-improvement/cycle-<N>/` with a README index: diagrams/HTML, reports, findings, test/build evidence and handoffs. Thread storage is scratch only, never the final deliverable location.
- Show diagrams/reports inline from workspace files, not merely inaccessible internal links.

## Concurrent Cycle 7 ownership

- Parent owns orchestration, mechanical commit/push, shared ledger and ownership changes. Workers own bounded source scopes and milestone reports; they do not spawn agents or claim independent self-acceptance.
- Follow the workspace Arch Loop/Superpowers contracts and concrete AP rules. A passing component is not a working integrated runtime.
- Preserve native Harness/runtime behavior. No replacement loops, fabricated admission IDs, decorative DI, hidden compatibility globals or fake successful unsupported capabilities.
- Bound commands and clean up only verified owned process trees. A persistent serve process is not expected to exit merely because its setup promise resolved.
