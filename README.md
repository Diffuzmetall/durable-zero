# durable-zero

> **The Sovereign, Zero-Leak, ACID-Persisted Agent Runtime and SDK**

`durable-zero` is a lightweight, zero-dependency runtime for building autonomous, durable AI coding agents. It provides transactional state storage, relational task graphs, sandboxed QuickJS codemode execution, and multi-client daemon attachments over standard Unix domain sockets.

---

## Features

- **Transactional ACID Persistence:** Every model turn, tool call, entry, and task status change is committed to an embedded SQLite WAL store.
- **Relational Task Graph:** Tasks form a directed acyclic ancestry graph with causal lineage, live receipts, and depth-guarded subagents.
- **Sandboxed Codemode:** High-performance QuickJS WebAssembly VM for executing generated JavaScript code with typed tools, model introspection, and multi-call RPC.
- **Multi-Client Socket Daemon:** Integrated Unix Domain Socket server (`runner.sock`) allowing multiple CLI processes, inspector UIs, and subthreads to connect to an active session concurrently without lock collisions.
- **Zero Proprietary Host Leaks:** Strict Ports & Adapters architecture. Zero dependencies on specific IDEs or proprietary harnesses.

---

## Architecture & Monorepo Packages

```text
packages/
├── contracts/  # @durable-zero/contracts — Pure wire DTOs and Zod schemas
├── sdk/        # @durable-zero/sdk — Plugin interfaces and PluginRegistry
├── plugins/    # @durable-zero/plugins — Built-in coding tools, QuickJS codemode, subagents
├── core/       # @durable-zero/core — DurableEngine, SQLite storage, SessionDaemon
└── cli/        # durable-zero — Standalone executable binary (run, serve, doctor)
```

---

## Quick Start

### Installation

```bash
npm install -g durable-zero
```

### Run an Agent Task

```bash
durable-zero run "Inspect project dependencies and list outdated packages"
```

### Start as a Background Daemon

```bash
durable-zero serve --session my-session-123
```

---

## License

MIT © Ivan Arc
