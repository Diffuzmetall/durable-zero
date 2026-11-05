# Task 1 / Lease A Freeze Checkpoint: Batch 2 Remediation & Facade Encapsulation

## 1. Status Overview
- **Branch**: `cycle-7-runtime-adapter-ioc-migration`
- **Baseline at start of Batch 2**: 56 diagnostics
- **Current Diagnostics**: 2 diagnostics (down 54 errors from Batch 2 start; down 82 from initial 84)
- **Official Command**: `pnpm run typecheck` (`tsc -p tsconfig.src.json --pretty false`)
- **Official Exit Code**: 2
- **State**: HOLD on all source writes for parent backup.

---

## 2. Retained Facade Test Encapsulation Fix
- **Defect**: `PiDurableEngine` declared `private instance: OpenDurableResult | null = null;`. TypeScript emitted an own runtime property `this.instance`, causing `(engine as any).instance !== undefined` to evaluate to `true` (failed `assert.equal(instanceLeaked, false)`).
- **Remediation**: Converted all internal engine fields in `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` (`#options`, `#instance`, `#eventAdapter`, `#watcher`, `#graphSource`, `#unsubscribeView`, `#listeners`, `#sessionDir`) to true ECMAScript `#` private fields.
- **Verification**: `node --test packages/adapter-pi-durable/test/durable-engine-facade.test.ts` PASSES cleanly (1307ms).

---

## 3. Other Batch 2 Remediations in Lease A
1. **`packages/adapter-pi-durable/src/store.ts`**:
   - Removed `as any` casting on `doc._value`.
   - Implemented `toJsonValue` recursive sanitizer enforcing depth limits ($\le 128$), checking for finite numbers, and rejecting non-JSON types (`Function`, `Symbol`, `NaN`, `Infinity`) with `TypeError`.
   - Added test `packages/adapter-pi-durable/test/store-roundtrip.test.ts` (1/1 pass).
2. **`packages/execution/src/adapters/local-node-env.ts`**:
   - Guarded `exec` against empty argv array and empty string without fabricating a binary name. Fails fast with exit code 1 and descriptive stderr.
   - Added test `packages/execution/test/local-node-env.test.ts` (2/2 pass).
3. **`packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`**:
   - Eliminated `Number(requestId)` casting. `DurableController.submit` returns `{ ...receipt, submission }` retaining the genuine native `Submission` handle; correlated via `submissionHandle.wait(runtimeContext)`.
   - `GraphScope` uses real session identity (`viewSnapshot.session.id`) and package version (`getPiDurableVersion()`).
4. **Exact Optional Property Type Alignments**:
   - Resolved 23 errors across 19 files using conditional spreads for `exactOptionalPropertyTypes: true`.
   - `durable-child-event-adapter.ts` and `durable-event-adapter.ts` now have 0 errors.

---

## 4. Residual Diagnostic Inventory (2 Remaining Errors)
Both remaining diagnostics in the entire workspace stem exclusively from the `IExecutionEnvironment` / `ExecutionEnv` seam:
```
packages/adapter-pi-durable/src/engine/runtime-loader.ts(151,3): error TS2345: Argument of type '() => IExecutionEnvironment' is not assignable to parameter of type '() => ExecutionEnv | undefined'.
  Type 'IExecutionEnvironment' is missing the following properties from type 'ExecutionEnv': absolutePath, joinPath, readTextFile, openTextLineReader, and 17 more.
packages/adapter-pi-durable/src/engine/runtime-loader.ts(186,48): error TS2322: Type '({ cwd, conversationId }: EnvTarget) => IExecutionEnvironment' is not assignable to type '(target: EnvTarget, context: Context) => ExecutionEnv | Promise<ExecutionEnv | undefined> | undefined'.
  Type 'IExecutionEnvironment' is not assignable to type 'ExecutionEnv | Promise<ExecutionEnv | undefined> | undefined'.
    Type 'IExecutionEnvironment' is missing the following properties from type 'ExecutionEnv': absolutePath, joinPath, readTextFile, openTextLineReader, and 17 more.
```

---

## 5. Execution Environment Seam Architecture Proposal
1. In `@durable-zero/adapter-pi-durable`:
   `PiRuntimeDependencies` accepts `nativeExecutionEnvFactory?: (target: { cwd?: string; conversationId?: ConversationId }) => ExecutionEnv | Promise<ExecutionEnv>`.
2. When `nativeExecutionEnvFactory` is provided (e.g. from runner composition root using `NodeExecutionEnv` from `@earendil-works/pi-durable/env/node`), it passes directly to `Harness.open`.
3. When custom `IExecutionEnvironment` is provided, adapter wraps it with `CoreToPiExecutionEnvAdapter`, delegating the 6 core methods and returning official SDK `{ ok: false, error: new FileError("not_supported", ...) }` for unsupported operations.
4. Exact Root Wiring Delta:
   In `packages/runner/src/composition.ts`: pass `nativeExecutionEnvFactory: (target) => new NodeExecutionEnv({ cwd: target.cwd ?? cwd })`.

---

## 6. Owned Files & New Files Inventory
### Modified Files in Lease A:
- `packages/adapter-pi-durable/src/engine/bridge/durable-child-event-adapter.ts`
- `packages/adapter-pi-durable/src/engine/bridge/durable-event-adapter.ts`
- `packages/adapter-pi-durable/src/engine/bridge/tool-result-extractor.ts`
- `packages/adapter-pi-durable/src/engine/extension-mount.ts`
- `packages/adapter-pi-durable/src/engine/harness-setup.ts`
- `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts`
- `packages/adapter-pi-durable/src/engine/runtime-bindings.ts`
- `packages/adapter-pi-durable/src/engine/runtime-controller.ts`
- `packages/adapter-pi-durable/src/engine/runtime-graph-mapper.ts`
- `packages/adapter-pi-durable/src/engine/runtime-graph-receipts.ts`
- `packages/adapter-pi-durable/src/engine/runtime-graph-source.ts`
- `packages/adapter-pi-durable/src/engine/runtime-loader.ts`
- `packages/adapter-pi-durable/src/engine/runtime-types.ts`
- `packages/adapter-pi-durable/src/engine/runtime.ts`
- `packages/adapter-pi-durable/src/engine/session-commands.ts`
- `packages/adapter-pi-durable/src/engine/shared/extension-runner.ts`
- `packages/adapter-pi-durable/src/engine/shared/extension-ui-context.ts`
- `packages/adapter-pi-durable/src/engine/subagent-policy-ack.ts`
- `packages/adapter-pi-durable/src/engine/subagent.ts`
- `packages/adapter-pi-durable/src/engine/task-labels.ts`
- `packages/adapter-pi-durable/src/engine/task-tokens.ts`
- `packages/adapter-pi-durable/src/engine/tool-adapter.ts`
- `packages/adapter-pi-durable/src/store.ts`
- `packages/execution/src/adapters/local-node-env.ts`

### New Files in Lease A:
- `packages/adapter-pi-durable/test/store-roundtrip.test.ts`
- `packages/execution/test/local-node-env.test.ts`
- `docs/arch-improvement/cycle-7/live/task-1/closing-typecheck-remediation/native-core/remediation-batch-2.md`
