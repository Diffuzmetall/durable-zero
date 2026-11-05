# Task 1 / Lease A Final Closing Remediation: Native Execution Env Seam & 100% Clean Typecheck

## 1. Status Overview
- **Branch**: `cycle-7-runtime-adapter-ioc-migration`
- **Initial Diagnostics**: 84 errors
- **Batch 1 Result**: 56 errors
- **Batch 2 Result**: 0 errors (100% clean typecheck across all 11 workspace packages)
- **Official Command**: `pnpm run typecheck` (`tsc -p tsconfig.src.json --pretty false`)
- **Official Exit Code**: 0
- **State**: HOLD on all source writes for parent backup commit.

---

## 2. Closing Amendment R8 Implementation Details
1. **Public NativeExecutionEnvFactory Interface**:
   ```typescript
   export type NativeExecutionEnvFactory = (
       target: import("@earendil-works/pi-durable").EnvTarget,
       context: import("@earendil-works/chord").Context,
   ) => import("@earendil-works/pi-durable/env").ExecutionEnv | undefined | Promise<import("@earendil-works/pi-durable/env").ExecutionEnv | undefined>;
   ```
   - Exported from `@durable-zero/adapter-pi-durable` (`packages/adapter-pi-durable/src/index.ts` and `./src/engine/runtime-types.ts`).
   - Attached to `PiRuntimeDependencies` as `readonly nativeExecutionEnvFactory?: NativeExecutionEnvFactory;`.

2. **Mutual Exclusivity & Safe Config Validation**:
   - In `ExecutionEnvs` and `openDurable`, if both `nativeExecutionEnvFactory` and `executionEnvFactory` are provided, throws an explicit configuration error (`Configuration error: Both nativeExecutionEnvFactory and executionEnvFactory provided; they are mutually exclusive.`).
   - If neither factory is provided, fails fast (`ExecutionEnvFactory or NativeExecutionEnvFactory is required in openDurable`).

3. **CoreExecutionEnvAdapter (Bounded Semantics)**:
   - Forwards genuine 6-method Core capabilities:
     - `readTextFile` $\to$ `readFile`
     - `writeFile` (string only) $\to$ `writeFile`
     - `exists` $\to$ `statFile` / `readFile`
     - `fileInfo` $\to$ `statFile` (maps `sizeBytes` $\to$ `size`)
     - `listFiles` $\to$ `listFiles`
     - `exec` (argv array) $\to$ `exec` with preserved `Result` semantics (non-zero exit code returns `ok({ exitCode })`, not `ExecutionError`)
   - Strictly rejects unrepresentable operations with SDK typed errors without touching host:
     - `readBinaryFile` $\to$ `FileError("not_supported")`
     - `appendFile` $\to$ `FileError("not_supported")`
     - `truncateFile` $\to$ `FileError("not_supported")`
     - `renameFile` $\to$ `FileError("not_supported")`
     - `watch` $\to$ `FileError("not_supported")`
     - string command `exec` $\to$ `ExecutionError("shell_unavailable")`
   - Zero host filesystem fallback.

4. **Synchronous Extension SDK Getter at Line 151**:
   - Asynchronously prepares the root environment beforehand:
     `const rootEnv = await envs.getOrCreate({ cwd: location.cwd }, runtimeContext);`
   - Extension runner getter passes `() => rootEnv ?? envs.peek(location.cwd)` synchronously.
   - `Harness.open` retains the native asynchronous ABI `env: (target, context) => envs.getOrCreate(target, context)`.
   - Tracks unique instances in `#uniqueEnvs = new Set<ExecutionEnv>()` ensuring cleanup runs **EXACTLY ONCE** per instance.

---

## 3. Fresh Verification Receipts
- **Typecheck**: `pnpm run typecheck` $\to$ `TSC_EXIT_CODE=0` (0 errors)
- **Build**: `node scripts/build.mjs` $\to$ SUCCESS
- **Targeted Lease A Suite (10/10 PASS, 826ms)**:
  - `packages/adapter-pi-durable/test/execution-env-adapter.test.ts` (6/6 pass)
  - `packages/adapter-pi-durable/test/durable-engine-facade.test.ts` (1/1 pass)
  - `packages/adapter-pi-durable/test/store-roundtrip.test.ts` (1/1 pass)
  - `packages/execution/test/local-node-env.test.ts` (2/2 pass)
- **Full Native Suite (30/30 PASS, 2519ms)**
- **Architecture Boundaries Guards (30/30 PASS, 3653ms)**

---

## 4. Lease A Owned Files for Staging
### Modified in Lease A:
- `packages/adapter-pi-durable/src/engine/harness-setup.ts`
- `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
- `packages/adapter-pi-durable/src/engine/runtime-loader.ts`
- `packages/adapter-pi-durable/src/engine/runtime-types.ts`
- `packages/adapter-pi-durable/src/engine/runtime.ts`
- `packages/adapter-pi-durable/src/index.ts`
### New Files in Lease A:
- `packages/adapter-pi-durable/src/engine/core-execution-env-adapter.ts`
- `packages/adapter-pi-durable/test/execution-env-adapter.test.ts`
- `packages/adapter-pi-durable/test/store-roundtrip.test.ts`
- `packages/execution/test/local-node-env.test.ts`
- `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/remediation-batch-2.md`
- `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/batch-2-tsc.log`
