# Task5A — Guard fix round4/5 (same original author)

Parent has NOT accepted the reported R3 PASS. Primary actual frozen c248 helper was executed with native node:test assertions and reporter: 4 cases, 3 failures, process exit1. Evidence: live/task-5-guards/parent-adjudication/round-3/{adjudication.json,callable-target.test.mjs,frozen-runner-verify.ts,junit.xml,test-output.txt,exit-code.txt}. No production source was mutated; the failing expected-correct assertions expose remaining checker behavior, not failing Native application code.

Confirmed remaining P2 callable-target bypasses:
- `export const main = Number("17")` is accepted, but exports a number.
- `const n=17; export const main=n` is accepted, but exports a number.
- `const n=17; export {n as main}` is accepted, but exports a number.
- Genuine exported function positive is correctly accepted.

Cause in actual frozen runner-verify: isCallableNode returns true for ANY CallExpression and Identifier; named re-export branch accepts `localFunctions.has(name) || !sf.isDeclarationFile` (the latter true for ordinary source). This is an unresolved form of the ORIGINAL callable-main target requirement, not optional polish/new feature. All P0-P2 block this checker scope even when production CLI is sound.

Repair the semantic rule rather than literal examples: resolve actual referenced declaration/symbol and prove callable shape; never assume any call/factory/identifier returns a function, never bypass verification for non-declaration files. Unsupported forms can fail closed with explicit diagnostics. Installed TypeScript Compiler API may supply actual symbol/type/signature resolution; use primary installed API/docs, not invented methods or another name whitelist. Do not blindly trust a matching name in a different lexical scope. Preserve legitimate direct function, async/arrow/function-expression and supported real compiled-esbuild exports/aliases. No need to solve arbitrary JavaScript or implement a second compiler; bound/document supported forms honestly.

Recheck exact package/subpath export resolution too, not only path existence, and preserve previous branch/dead-code/DAG/report/grammar fixes. Keep meaningful AP019 decomposition; no dummy wrappers or deleting semantics. Actual original CLI remains unchanged. Do not mutate other owners' Core/native/runner/protocol/migration files.

Own existing architecture-boundaries* helpers/tests/fixtures; evidence NEW live/task-5-guards/fix-round-4/. Preserve R1/R2/R3 and original reported PASS/probe artifacts as superseded history. Genuine behavioral RED against R3 followed by true corrected GREEN, genuine reporter/JUnit/exit, no invented timing/count. Do not label bug-demonstration tests that assert broken acceptance as fixed acceptance. First useful saved milestone <=10min then HOLD for immediate backup and same independent reviewer re-review. No commits/spawns/ledger/provider changes. Max5 rounds remains binding; no scope PASS with open P2.
