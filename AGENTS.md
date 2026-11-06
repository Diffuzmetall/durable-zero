# durable-zero working contract

## Project goal

- Build our Durable system on Zero, not from copied fragments of Zero.
- Preserve Zero's architecture and native Pi Durable execution.
- Use this local checkout as the integration and test workspace. Upstream Zero remains in its GitHub repository.
- Add our components as separate workspace packages here. Do not create a separate repository for this assembly.
- Connect our packages directly to Zero through its supported interfaces.
- Use extensions, adapters, and a host assembly to connect these packages.
- Keep modules replaceable through explicit interfaces and package boundaries.
- After successful tests, install the Zero-based assembly globally as our primary Pi Durable.

## Architecture constraints

- Preserve existing Zero source unless evidence justifies a focused defect fix or architectural improvement.
- Keep terminal-specific and host-specific functionality in our packages when existing Zero interfaces meet the required contract.
- Before changing Zero, explain the problem, intended improvement, affected boundaries, and verification plan.
- Reproduce defects before fixing them. Add regression tests where practical.
- Do not patch Zero merely to accommodate a preference, bypass a boundary, or produce a patch.
- A missing feature or extension interface is not automatically a defect.
- If a required interface is absent, report the gap and justify the architectural choice before changing Zero.
- Do not copy Zero internals into our packages to bypass a missing interface.
- Do not use monkey-patching, hidden globals, or deep imports into private implementation files.
- Assemble concrete dependencies at the composition root. Keep Core independent from terminal, BB, iii, and storage implementations.
- Keep one native Harness owner per open session. Do not create another model loop, task loop, or session store.
- Distinguish Pi ExtensionAPI modules, native Durable extensions, and Zero BuiltinExtension wrappers.
- Reuse existing Zero modules when they meet the required contract. Do not duplicate their tools or resource owners.

## Implementation order and acceptance

1. Understand current Zero and local Durable boundaries before changing runtime code.
2. Build the terminal and Durable runtime on Zero first. Reuse the existing installed Pi Durable editor, layout, themes, and tool cards. Change the runtime connection, not the interface. A readline client is only a diagnostic probe. Do not migrate our extension collection in this stage.
3. Keep the runtime independent from the terminal client. Closing or disconnecting the terminal must not stop active agent work.
4. Verify a test session through terminal input, streamed output, a native tool call, completion, abort, and reopening.
5. Verify terminal disconnection, continued runtime execution, and reconnection without duplicate prompt submission. Then open an isolated test session in the user's existing Rex app for joint testing; preserve unrelated tabs and the primary installation.
6. Migrate our extensions only after the terminal/runtime foundation passes its integrated checks.
7. Treat BB and iii as later adapter work. Preserve their boundaries without implementing them in the first terminal stage.

SQLite history persistence alone does not prove continued execution after terminal disconnection.
A component test, successful import, or declared capability does not prove an integrated runtime works.

## Delivery and preservation

- Develop and test our packages locally before changing the primary Pi Durable installation.
- Use this delivery order: implement locally, test, install the candidate locally, test the installed candidate, then perform the agreed global switch.
- The global switch makes the Zero-based assembly our primary Pi Durable. It is not an npm publication or upstream deployment.
- Keep upstream GitHub unchanged during local development, installation, and tests.
- Commit and push are later delivery steps after successful installed-system tests, not automatic effects of local development.
- Do not commit or push WIP before those checks. This rule replaces the previous immediate commit/push instruction.
- Run relevant build, type, package, and integrated runtime checks before local installation.
- Install the tested candidate in our environment with a practical rollback path.
- Verify the installed artifact, not only its source tree. Record the candidate identity, commands, results, and remaining failures.
- Preserve existing services, credentials, sessions, and unrelated work during installation.
- Obtain explicit approval for destructive actions, user-session migration, or service replacement outside the agreed installation scope.
- Before the global switch, identify the candidate, installed commands and services, session handling, and rollback procedure.
- Do not migrate or overwrite existing user sessions as an implicit part of the global switch.
- After successful installed-system checks, commit only scoped changes and push only to the agreed repository and branch.
- A request to document this workflow does not authorize immediate installation, global switch, commit, or push.
- Never publish secrets or private data. Never force-push without separate authorization.
- User-facing artifacts belong in `docs/arch-improvement/cycle-<N>/` with a README index: diagrams/HTML, reports, findings, test/build evidence and handoffs. Thread storage is scratch only, never the final deliverable location.
- Show diagrams/reports inline from workspace files, not merely inaccessible internal links.

## Concurrent Cycle 7 ownership

- Parent owns orchestration, mechanical commit/push, shared ledger and ownership changes. Workers own bounded source scopes and milestone reports; they do not spawn agents or claim independent self-acceptance.
- Follow the workspace Arch Loop/Superpowers contracts and concrete AP rules. A passing component is not a working integrated runtime.
- Preserve native Harness/runtime behavior. No replacement loops, fabricated admission IDs, decorative DI, hidden compatibility globals or fake successful unsupported capabilities.
- Bound commands and clean up only verified owned process trees. A persistent serve process is not expected to exit merely because its setup promise resolved.
