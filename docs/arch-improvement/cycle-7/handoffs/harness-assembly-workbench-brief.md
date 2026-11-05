# Harness Assembly — workbench and product-storytelling reference handoff

Status: Harness Assembly direction selected by user; detailed design and implementation NOT approved yet.
Date: 2026-11-05. User reference: iii.dev; user examples: workbench / work desk.

## Scope and positioning

Audience: authors of plugins/adapters and integrators embedding the harness elsewhere. Preserve actual interfaces, ownership, lifecycle, errors, cancellation and readiness boundaries. This is communication/design research, NOT authorization to rewrite runtime architecture to match a reference product.

Candidate proposition (draft): **Build your own agent harness.** An embeddable runtime around native Pi Durable with explicit extension/composition boundaries. Demonstrate who supplies each component and how it connects; do not claim distributed-worker equivalence, universal portability, zero integration work or arbitrary exact-once recovery.

## What iii.dev contributes

The homepage connects `Custom harness / Your choices`, a growing worker graph, orchestrator code, trace and result in one continuing example (`Build it up. See it work.`). Its sample trace explicitly uses illustrative timings. Borrow that continuity and control-over-composition argument.

Architectural boundary: iii describes a central engine and independently connected WebSocket workers registering functions. Current durable-zero composes SessionCoordinator, IAgentEngine/PiDurableEngine and an execution environment, with stdio RPC at the boundary. These are related goals with different architecture, NOT feature-equivalent products. Do not rename durable-zero ports to iii workers. iii docs currently mix older Trigger terminology with newer Observers/migration material; homepage samples are not a pinned API spec.

Primary sources: https://iii.dev/ ; https://iii.dev/docs ; https://iii.dev/docs/understanding-iii ; https://iii.dev/docs/reference/engine-protocol

## Additional references, one communication job each

- **Dagger — demonstrate adoption through concrete modules and commands.** Current introduction leads with lint, e2e, generators and debugging. Use the pattern minimal working assembly → own module → inspect result. Do not import its container/cache/DAG guarantees. Source: https://docs.dagger.io/ . Old 0.18.19 module documentation is explicitly legacy and is not used as current API authority.
- **Restate — sell durability through a failure scenario and its journal.** Use the proof pattern, not broad replay/exact-once claims that our current acceptance does not establish. Sources: https://restate.dev/ ; https://restate.dev/what-is-durable-execution
- **Mastra — entry paths based on the integrator's task, and a unified build/test/inspect environment.** Separate own tool / own environment / own client. Studio was studied through its docs, not a running deployment. Sources: https://mastra.ai/docs/harness/overview ; https://mastra.ai/docs/studio/overview
- **Stately — keep code, model and execution inspection connected.** One selected component should resolve to the same object in contract and trace views. We are not thereby proposing a diagram editor or two-way code generation. Source: https://stately.ai/
- **Effect — technical depth can itself be the value argument.** Typed errors, requirements/dependencies and concurrency need not be hidden for an expert reader. Borrow focused technical demonstrations rather than generic dark-grid styling. Source: https://effect.website/

## Workbench interpretation — still a design proposal

Use a precise engineering working surface rather than decorative wood, workshop tools and screws. One persistent assembly remains on the table. Modules can be inspected against their actual ports; a selected module opens a readable flat specification; the execution strip stays associated with the same assembly.

Candidate zones: component tray; central assembly/cutaway; contract/implementation sheet; execution trace. These are not four independent dashboards and need not all occupy equal visual weight. Motion should preserve identity while the reader moves from whole assembly to interface to concrete event.

Candidate gestures:
- pull a module aside to compare its implementation and lifecycle;
- match it to a port to inspect compatibility conditions;
- separate logical layers to inspect Core/native/host boundaries;
- submit a marked demonstration request and inspect its trace;
- export/view the assembly passport: configuration, dependencies, integration code and readiness status.

This is an educational configuration/inspection model, not a promise of arbitrary hot-plug or reversible real side effects. Runtime hosting, transport and tool-execution environment remain separate dimensions.

## Evidence and next design boundary

Primary websites/docs were read. Public iii and Effect homepages and the Mastra Studio overview page were captured; their provenance is in `../evidence/presentation-references/sources.json`. The first unhydrated iii entrance frame was discarded in favor of a settled capture. No load-time or FPS benchmark was performed. No products were installed, authenticated, purchased or tested for interoperability. No presentation application code, release, merge, tag or deployment was created.

Rich canonical research is held in GBrain `wiki/analysis/durable-zero-motion-exploration-2026-11-05`, update request `4e8f6ea7-8c54-4a51-b25f-847552f5bd65`; this file is the implementation-facing handoff. Full design/storyboard approval and a separate implementation plan are still required before building.
