# Motion presentation — corrected audience and research handoff

Status: Harness Assembly direction selected by user; detailed design and implementation remain unapproved. Follow-up: harness-assembly-workbench-brief.md.
Date: 2026-11-05. Origin: user instructions in BB thread `thr_9yjb93iwmn`.

## Audience correction

The audience writes plugins and adapters and integrates durable-zero as a harness in other environments. Do not replace engineering content with introductory analogies. The previous general-introduction concept was the assistant's proposal, not an approved design. The DIP guide supplies a technology reference, NOT a required presentation format.

## Selected direction; detailed design still pending

**Harness Assembly:** an authored engineering illustration of the runtime, with a spatial exploded view of logical layers. It is an engineering model, not a claim that the software is physical hardware. Opening a port exposes actual interfaces, initialization, ownership, cleanup and errors. Selecting an adapter changes composition before startup; do not imply arbitrary live hot-plug.

Two complementary directions were considered:
- **Runtime Observatory:** a temporal microscope of admission, streaming, tool execution, settlement and persisted entries. Scrubbing is inspection of a fixture/replay, not reversal of real database writes or tool side effects.
- **Contract Studio:** synchronized code / port / payload views of the same integration. It is useful during implementation, but on its own risks becoming API reference with decorative transitions.

The user selected Harness Assembly and added workbench / work desk references. Observatory as an inspection mode and Contract Studio as seam details remain design proposals, not an approved complete specification.

## Motion techniques verified against official documentation

- SVG components, stroke drawing, path offsets, viewBox animation and compatible-path morphing. The author supplies the SVG illustration. Arbitrary path morphs need a mixer such as Flubber.
- Shared MotionValues/useTransform can coordinate physical-looking controls, layer separation and connections without per-frame React render for those values.
- CSS perspective / preserve-3d / z / rotateX / rotateY support a stylized exploded view. This is not a WebGL renderer. Filters, opacity and clipping on the wrong 3D ancestor may flatten the scene.
- Drag gestures, constraints and springs support insertion/extraction. Port compatibility and snap logic are application responsibilities. Keyboard alternatives and proper touch-action are required.
- useAnimate/hybrid animate sequences support choreography and playback controls; semantic seek and a deterministic scene model must be implemented separately.
- layoutId can preserve spatial identity from a compact module to its contract or an event to its payload.

## Access and verification boundaries

Base animation APIs are distinct from paid ready-made examples. The public Tilt card page explicitly gated its live demo/source with Motion+; no account, payment or bypass was used. Current animate docs mark the ready-made Three.js/vgpu integrations Motion+ early access. CSS-3D does not require those integrations.

Official docs and public previews were examined. A public 3D documentation screenshot was read. One oversized browser snapshot timed out; no animation performance result is inferred from that. No FPS claim, package installation, application implementation, merge, tag or deployment was performed. Compatibility with the future presentation's exact lockfile remains to be tested.

## Required technical substance

- Separate Pi coding-agent extensions, BuiltinExtension lifecycle and Core ports.
- Preserve the difference between Core IExecutionEnvironment and full native ExecutionEnv, including async/Context/Result, unsupported operations and cleanup.
- Cover both stdio client integration and library composition (assembleDurableZero is exported from runner).
- Distinguish runtime hosting, transport and tool-execution environment. A replaceable execution environment does not certify browser/edge hosting.
- Preserve ConversationId / EntryId / Submission distinctions and cancellation/ownership semantics.
- Mark native-verified, component-only and deferred integrations separately; do not advertise unmounted dispatcher/admin or native HostBridge continuation as integrated.

## Primary sources

- https://motion.dev/docs/react-svg-animation
- https://motion.dev/docs/react-motion-value
- https://motion.dev/docs/react-use-transform
- https://motion.dev/docs/3d-transforms
- https://motion.dev/docs/react-drag
- https://motion.dev/docs/react-use-animate
- https://motion.dev/docs/animate
- https://motion.dev/docs/react-layout-animations
- https://motion.dev/docs/performance
- https://motion.dev/docs/react-accessibility
- https://motion.dev/examples/react-path-drawing
- https://motion.dev/examples/react-path-morphing
- https://motion.dev/examples/react-tilt-card (public preview; source/live gated)

Code checked: `packages/runner/src/index.ts`, `packages/runner/src/composition.ts`, `packages/adapter-pi-durable/src/index.ts`, `packages/adapter-pi-durable/src/engine/runtime-types.ts`, `packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts`, `packages/core/src/session/engine.ts`, `packages/core/src/tools/execution-env.ts`. Acceptance boundary: `docs/arch-improvement/cycle-7/stage-closure-acceptance.json`.

Canonical enriched research was submitted through GBrain as `wiki/analysis/durable-zero-motion-exploration-2026-11-05`, request `f874162e-648b-47dc-bef1-4c81c72f1a45`. This handoff is the implementation brief, not a duplicate normative policy.
