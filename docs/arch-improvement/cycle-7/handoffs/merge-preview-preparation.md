# Bounded release preparation / verification — merged Cycle7 developer preview

Parent thr_9yjb93iwmn. User explicitly authorized NOW: merge entire working branch into main with a new tag, and asked whether implementation is ready for friends to write plugins/extensions. No BB install/restart, npm publication, new runtime features or provider migration is authorized by this release task.

## Exact candidate / ownership
You work ONLY in candidate clone /var/folders/jl/wlqvk7_17hv0_0mcd3pg0br00000gn/T/durable-zero-merge-preview-zbiu_5oc. This is an isolated temporary copy of the EXISTING repository, not a new project. Actual merge commit294212ac2d2260f794a4bd351b9e8b5ad077a789 integrates origin/main7b530f353c06306cde05d77c09198788dd2609e2 with FULL source branch2127b8f7a825618314a79b371a2dd16d9078ff40.
Original checkout /Users/vanya/Projects/durable-zero has pre-existing dirty dist and reports; DO NOT modify/stage/reset/checkout it. Candidate node_modules is a read-only-use symlink to existing installed deps; no install or mutation through it.
Candidate is detached. Parent does all commits/tags/push. No children, git commits/tags/push, force operations, installs/restarts, live LLM/network/auth/MCP/user session access.
Your lease: version files, CLI version constant and its version assertion, root README.md, existing normal build outputs, docs/arch-improvement/cycle-7/merge-preview-2026-11-05/preparation/. Do not touch reviewer's independent/ directory, runtime source behavior or existing test assertions unrelated to version.

## Release identity / small docs repair
Use unused candidate version v0.27.0-alpha.1 (developer preview, not complete Cycle7/stable generic toolkit). Parent refreshed tags and checked unused; recheck locally if needed. Match repo precedent7b530f3: root package.json + all package package.json versions, packages/cli/bin/durable-zero.js version and corresponding CLI test assertion updated TOGETHER. Do not arbitrary bump dependency SDK1.5.0, remove deps, change strictness or refactor modules. Lock consistency if root lock records own versions.
Root README is visibly STALE: claims zero dependencies, Unix sockets daemon, old3package architecture, global npm install despite root package lacking bin. Replace with short TRUTHFUL developer-preview README: actual public package subpath names ('durable-zero/runner', not internal @durable-zero aliases), actual build/setup/CLI invocation proven by commands, extension mechanism proven against source. Distinguish native Pi extension authoring from alternative engines/adapters/host integrations. No invented createHarness or untested ready-to-run code. State known unmounted dispatcher/host bridge and absent parity; don't call full Cycle7 accepted.
Do not spend20minutes writing a new manual. A concise accurate README + limits is enough.

## Fresh gates on candidate
Read canonical AGENTS / verification-before-completion skill and directly relevant build/test files first. Normal supported commands only:
- package manager source from root pnpm lock, use already installed deps; NEVER npm install through symlink.
- full source typecheck (strict tsconfig.src.json) exit/count.
- normal build (scripts/build.mjs), required tracked outputs.
- native full Node test suite with <=30s per test, <=60s total ordinary run; save genuine JUnit via node --test --test-reporter=junit --test-reporter-destination=<file> with existing root glob. No handwritten successful reports or masked exit code.
Preserve initial failures separately, do not overwrite RED with GREEN. If meaningful failure not trivially version metadata/report path, stop/report, do not broaden into runtime repair without parent brief.
Verify executable CLI identity/help/version by actual public command. If existing frozen R3 compiled-product harness has a supported candidate CLI/runner override, run it against THIS candidate; if not, say not rerun, don't relabel old fixture result as fresh proof.
No unbounded tests/force-exit. Isolated HOME/XDG/PI_AGENT_DIR/cwd and allowlisted env for any SDK/product probe; no real LLM/auth/MCP calls. Root hermetic tests should keep original behavioral assertions.

## Output
Actual logs/native JUnit/summary.json with source merge SHA, version, command exit codes, artifact hashes, counts and limits in owned preparation/ dir. Copy final concise logs/report also to $BB_THREAD_STORAGE if useful for parent UI, but canonical artifacts belong in candidate docs. No duplicate normative rule files in scratch.
Initial real verification checkpoint within~8min; bounded delivery10–15min. Finish source/build quiescent; report paths/actual pass/fail then HOLD. Independent friend-readiness reviewer runs separately; your test pass is not its verdict. No claiming stable release or BB migration complete.