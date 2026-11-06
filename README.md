# Durable Zero

**A headless agent harness with a Pi Durable reference runtime.**

Durable Zero provides the parts for composing an agent harness without prescribing its user interface or requiring a vendor application backend. This repository assembles those parts around the native **Pi Durable Harness**, which runs the model/tool loop and persists conversations in SQLite.

A host can communicate with the reference runtime over JSON-RPC on stdio, or use the programmatic composition entrypoint. Core coordination, execution environments, model integration, resources and codemode live in separate packages.

**Zero means freedom to assemble the harness.** It does not mean zero dependencies or zero infrastructure: the reference assembly needs a Node.js process, storage, the Pi SDK and access to a configured model provider.

> **Status: developer preview.** The reference assembly pins the Earendil Pi packages to **1.5.0**. Extension and adapter interfaces are still evolving. The current BB provider has not yet been migrated to this runtime.

## Direction: Zero and Durable Zero

The planned split separates **Zero**, the headless/backendless harness foundation, from **Durable Zero**, a concrete Pi Durable-backed reference assembly.

- **Zero:** neutral contracts and independently usable modules with clean APIs. Applications choose implementations and compose them from the outside; modules do not require a shared DI-container SDK.
- **Durable Zero:** a reference recipe using Pi Durable, native execution/storage and selected module implementations. It is not the mandatory engine or infrastructure for every Zero consumer.
- **The terminal is optional and outside Core.** CLI, TUI, web and other clients are outer shells. Closing a client must not stop the runtime that owns active work.

This is the architectural direction, not a claim that repository extraction or compatibility of all alternative assemblies is already complete. Classify public contracts before moving packages; do not copy native DTOs into a neutral API and merely rename them. Backendless does not mean there are no processes, compute or storage.

## Architecture guidance for contributors

Use the **[arch-rules repository](https://github.com/ai-meatbags/arch-rules)** and its [full AP-rule scope](https://github.com/ai-meatbags/arch-rules/blob/main/arch-rules.md) as the architectural development reference. Apply rules relevant to the changed boundaries and risks; explain non-applicable database, UI or distributed-system rules instead of applying them mechanically.

**Skills are optional for contributors.** No particular skill installation or workflow is required. Architecture boundaries and behavioral evidence matter, not a specific tooling ritual.

Preserve neutral Core dependencies (AP-020/025), explicit composition/defaults outside modules (AP-073/074), versioned contracts/capabilities (AP-026/046), owned cancellation/cleanup and readiness (AP-023/059), and a real walking skeleton with observable use of injected dependencies (AP-075/076). One native Harness owns execution for each open Durable Zero session. Admission is not completion; disconnect is not shutdown. Add, replace and remove are different operations.

An extension contribution should identify its public entry/contract, an external consumer example without private imports, compatibility requirements, resource ownership/lifecycle and checks of actual outcomes. A public parameter, lower-level seam, absent replacement slot, intentional native owner and unmounted interface have different readiness levels. Do not claim a replacement is supported just because an interface exists.

See the **[architecture atlas and contributor direction](https://zero.vanya-arc.dev/)** for the source-pinned dependency and extension maps. Source tracing, component tests and native acceptance are separate levels of evidence.

## Local terminal integration
This checkout also contains three separate workspace packages: `@local-durable/runtime` (independent process host), `@local-durable/terminal` (Unix-socket client), and `@local-durable/terminal-ui` (preserved rich presentation). They compose Zero; they do not replace its native Harness or model loop.
See [architecture, package boundaries, build/test/install commands and PR scope](docs/arch-improvement/cycle-8/architecture-and-packaging.md) and [latest skills/installed-artifact verification](docs/arch-improvement/cycle-8/capability-followup.md). The primary installation has not switched. Attention, Goal and schedules are deferred in this assembly.
## What the reference assembly includes

- **Native agent execution.** `PiDurableEngine` adapts the upstream Harness; Core does not implement a second model loop.
- **Persistent sessions.** The Pi Durable adapter opens SQLite storage and exposes session state, transcripts and streamed events.
- **JSON-RPC 2.0 over stdio.** A parent process can submit prompts, abort work and inspect a session.
- **Pi extension loading.** Explicit extension paths, skills and Pi resources feed the reference runtime through its resource loader and extension bridge.
- **Execution environment injection.** The default assembly uses the SDK's `NodeExecutionEnv`; custom factories can supply a different environment.
- **Codemode integration.** A separate adapter installs the Pi codemode integration, with the QuickJS WASM asset included by the build.

These are parts of the reference assembly, not a claim that every Pi UI feature or every integration seam is supported by every host.

## Start from source

Requirements: **Node.js 22.19 or newer** (the pinned Pi SDK requirement) and **pnpm**. Development has used Node.js 26 and pnpm 11.

```sh
git clone https://github.com/VanDalkvist/durable-zero.git
cd durable-zero
pnpm install --frozen-lockfile
pnpm build
```

The build generates package bundles, the runner entrypoint and copies the QuickJS WASM asset. The Pi SDK remains an external dependency; the runner is not a standalone, dependency-free executable.

The source checkout exposes the CLI directly:

```sh
node packages/cli/bin/durable-zero.js --version
```

Configure a model provider using Pi's provider configuration and credentials, then start the runner. Replace the paths, provider and model below with your own:

```sh
node packages/cli/bin/durable-zero.js serve \
  --cwd /path/to/project \
  --session-dir /path/to/session \
  --provider YOUR_PROVIDER \
  --model YOUR_MODEL
```

`serve` keeps a **stdio JSON-RPC connection** open. It is not an interactive chat prompt or a Unix socket daemon. The host owns the child's stdin/stdout connection; closing stdin shuts the runner down.

The root package currently has no `bin` declaration. Global installation with `npm install -g durable-zero` is not the documented launch path. The prototype `run` and `doctor` commands report that they are unsupported and exit non-zero.

## Talk to the runner

Each request is one JSON object followed by a newline on stdin. After startup, `session/getState` can be used as a readiness probe:

```json
{"jsonrpc":"2.0","id":1,"method":"session/getState","params":{}}
```

Submit a prompt on the same connection:

```json
{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"content":"Describe this project"}}
```

A successful prompt response acknowledges admission. It is **not** the completed answer. Subsequent progress arrives through `session/event` notifications; assistant deltas are carried by `message_update.assistantMessageEvent`, including their content index.

The default runner currently routes:

- `session/prompt`
- `session/abort`
- `session/getState`
- `session/getTranscript`
- `session/getStats`
- `session/setSubagentPolicy`

The mounted handler in [`composition.ts`](packages/runner/src/composition.ts) is the authority for this list. A method's presence in a schema, component dispatcher or adapter does not make it available on the default runner.

## Write extensions and adapters

### Pi extensions

For tools, providers and lifecycle hooks in the reference runtime, the starting point is the pinned **Pi extension API**. Extension modules export a default factory receiving `ExtensionAPI` from `@earendil-works/pi-coding-agent`.

Load explicit files with repeatable `--extension` flags:

```sh
node packages/cli/bin/durable-zero.js serve \
  --cwd /path/to/project \
  --session-dir /path/to/session \
  --provider YOUR_PROVIDER \
  --model YOUR_MODEL \
  --no-global-extensions \
  --extension /path/to/first-extension.ts \
  --extension /path/to/second-extension.mjs
```

`--no-global-extensions` disables automatic extension discovery while retaining explicitly supplied paths. Repeatable `--skills /path/to/skill` flags add skill paths. `PI_ADDITIONAL_EXTENSIONS` also accepts comma-separated extension paths.

The adapter loads resources, registers extension providers, adapts registered tools into the native registry and bridges lifecycle hooks. See [`runtime-loader.ts`](packages/adapter-pi-durable/src/engine/runtime-loader.ts) and [`extension-mount.ts`](packages/adapter-pi-durable/src/engine/extension-mount.ts) for the implemented behavior.

**Extension loading is not complete host compatibility.** Terminal UI, dialogs and host-owned tools need corresponding host support. In particular, this release does not establish a working native BB host-tool roundtrip.

### Built-in extensions

Assembly-level extensions use the separate [`BuiltinExtension`](packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts) contract: identity fields, `register(context)` and optional `teardown()`. They install native registry behavior and are supplied when constructing the Pi Durable adapter. They are not the same API as a Pi extension file.

### Replace assembly parts

The public programmatic entrypoint is `assembleDurableZero` from `durable-zero/runner`. Its [options](packages/runner/src/composition.ts) include:

- `engine`: an implementation of Core's [`IAgentEngine`](packages/core/src/session/engine.ts). Supplying it bypasses the default Pi engine construction.
- `nativeExecutionEnvFactory`: a factory implementing the **Pi SDK execution environment** contract.
- `executionEnvFactory`: a factory implementing **Core's execution environment** contract, adapted for the native runtime.
- Extension and skill paths, session settings, stdio streams and a notification callback.

The two execution environment factories are mutually exclusive. Core's smaller environment interface and the native SDK interface are distinct contracts, not interchangeable types.

These are implementation seams for adapter authors. Replacement engines and remote execution environments still need their own implementations and validation; they are not shipped as ready-made integrations.

## Package layout

```text
packages/
├── contracts/             Wire DTOs and shared contracts
├── core/                  Session coordination, policy and abstract ports
├── protocol/              JSON-RPC types and stdio transport
├── execution/             Execution environment implementations
├── adapter-pi-durable/    Native Harness, SQLite sessions and extension bridge
├── adapter-pi-ai/         Pi model-provider adapter
├── adapter-codemode/      Codemode built-in extension
├── extension-pi-resource/ Pi settings and resource-loader integration
├── runner/                Reference composition and process entrypoint
├── cli/                   CLI wrapper
├── local-runtime/         Independent session process / Unix-socket host
├── local-terminal/        Optional terminal client and launcher
└── terminal-ui/           Optional native rich presentation
```

In the default assembly, a request goes through the stdio runner and Core's `SessionCoordinator` to `PiDurableEngine`, then to the native Harness. Runtime execution and persistence stay with Pi Durable; Core remains separate from that implementation.

The root package exposes subpaths such as `durable-zero/core`, `durable-zero/runner`, `durable-zero/protocol` and `durable-zero/adapter-pi-durable`. The complete list is in [`package.json`](package.json). `@durable-zero/*` names are workspace package names used inside this monorepo.

## Current boundaries

- The full session/admin dispatcher is not mounted in the default composition. Do not assume model controls, binding registration, tool registration or session forking are all exposed as runner RPC methods.
- The generic host bridge has component-level work behind it, but native host-tool continuation and interaction roundtrips are not accepted end to end. BB-specific tool execution and UI adaptation belong to the host integration; that provider migration is separate work.
- `--no-session` is parsed but is not wired into the default assembly as a supported stateless probe.
- Persistence is not a blanket guarantee of exactly-once external effects or automatic recovery of interrupted tool operations.
- This preview is not full Cycle 7 capability parity or a stable, universally compatible plugin SDK.

## Development and implementation notes

```sh
pnpm build
pnpm typecheck
pnpm test
```

[Cycle 7 documentation](docs/arch-improvement/cycle-7/README.md) records the migration and its evidence. The [stage acceptance record](docs/arch-improvement/cycle-7/stage-closure-acceptance.json) describes a bounded historical verification stage, not acceptance of every integration or a fresh verification of each later commit.

## License

MIT © Ivan Arc
