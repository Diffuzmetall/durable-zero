---
title: "durable-zero Cycle 7: AS IS → TO BE and completeness assessment"
type: analysis
date: 2026-11-04
---

# durable-zero Cycle 7 — architecture / completeness assessment

Snapshot: 2026-11-04T22:21:47.952157+03:00; HEAD `f3fff38a84154a36f017514c234421aef5215ced` + active WIP. Not global acceptance. [Source: BB Pi thread thr_9yjb93iwmn; architecture-map-source-snapshot.json]

## Architectural judgment (assessment)

The target direction fits preserving the mature native runtime while isolating sovereign Core. Native Harness/controller/event bridge/subagents/SQLite are retained behind PiDurableEngine, not replaced by a custom agent loop. This is a design assessment, NOT a claim that the integrated runtime works. [Source: canonical Cycle-7 plan: Goal, Architecture, Canonical Design Amendment; captured CLI/composition/engine sources]

The main completeness risk is horizontal migration and green component results being mistaken for a vertically working product. Task 1 is broad: 71 TypeScript files are currently under the relocated runtime closure; file counts are NOT completion percentages. [Source: architecture-map-migration-metrics.json]

## Evidence and bounded status

- Protocol 4A: fixed candidate `f3fff38a8415`, artifact `24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514`; independent architecture and compiled-public-package product re-reviews PASS. This does not accept the entire production runner or all capability methods. [Source: ../reviews/protocol-architecture-rereview-r1.md; ../reviews/protocol-product-rereview-r1.md]
- HostBridge 2A: candidate `efc9eab7ddfb`, component architecture PASS, 36 author component tests; public package/composition/Harness/full model tool-loop acceptance remains pending. [Source: ../reviews/hostbridge-architecture-review.md]
- Task 1: CLI points at new runner and composition creates the actual engine. A recorded build succeeded, but last recorded CLI walking-skeleton E2E timed out; later WIP is not automatically covered by that build. No global Cycle-7 S9 acceptance. [Source: captured CLI/composition; architecture-map-slice0-command-receipts.json; slice0 event log seq 935/939]

## Current WIP findings (not released-regression claims)

### [P1] В Core ещё есть синтетический accepted без engine

Evidence: packages/core/src/session/coordinator.ts:24-28, sha256 4fd20bb87aa3abcccc7e11bcbf6b1d8dd45b73dd16eb273be6b1166dbb9c80ec; packages/core/src/session/coordinator.ts:98-104, sha256 4fd20bb87aa3abcccc7e11bcbf6b1d8dd45b73dd16eb273be6b1166dbb9c80ec. [Source: architecture-map-source-snapshot.json]

Impact: Стандартный assembly уже передаёт настоящий engine. Но публичный coordinator всё ещё допускает другой режим: принять prompt, придумать rec_… и ничего не исполнить. Старые unit-тесты этого пути могут оставаться зелёными. Это именно остаточная заглушка, а не доказательство исполнения.

Rule: AP-012 / AP-075 / AP-076; canonical plan: Assertion Integrity.

Fix decision: Block acceptance while this production fallback exists; code remains owned by Slice 0. No new work launched.

### [P1] Ресурсный адаптер создан, но не включён в DI-цепочку

Evidence: packages/runner/src/composition.ts:54-69, sha256 e1c0b701951fabdd994012ed715bf1b1c5f1b36082e28f3c8f302c18dd80c82b. [Source: architecture-map-source-snapshot.json]

Impact: resourceExt создаётся, но его configProvider/resourceLoader не передаются в dependencies. Нативный loader может загрузить свои ресурсы по умолчанию — это не доказывает использование инжектированного адаптера. Нужна проверка, что подставленный ресурс реально меняет рабочий prompt/skills.

Rule: AP-074 / AP-076; canonical Dependency Assembly & Injection Boundaries.

Fix decision: Block complete-DI acceptance until constructor → loader → native consumer trace and substitution are verified. No source edits in this assessment.

### [P2] getStats пока возвращает константу вместо измерения

Evidence: packages/adapter-pi-durable/src/engine/pi-durable-engine.ts:311-320, sha256 6def4e70f5d74f6d0c16b458eccd6a7c8966a90ae49eb2366ebf14dbba2e1e13. [Source: architecture-map-source-snapshot.json]

Impact: Метод есть, но tokens: null и contextWindow: 128000 не читаются из текущей модели или сессии. Его нельзя отмечать как сохранённую нативную метрику. Это незавершённая capability, даже если RPC отвечает успешно.

Rule: AP-012 / AP-026 / AP-076; preserve token metrics.

Fix decision: Block full capability-parity acceptance; implement real metric or an explicit unavailable contract, never invented successful data.

### [P2] После abort coordinator блокирует все следующие prompts

Evidence: packages/core/src/session/coordinator.ts:70-73, sha256 4fd20bb87aa3abcccc7e11bcbf6b1d8dd45b73dd16eb273be6b1166dbb9c80ec; packages/core/src/session/coordinator.ts:124-131, sha256 4fd20bb87aa3abcccc7e11bcbf6b1d8dd45b73dd16eb273be6b1166dbb9c80ec. [Source: architecture-map-source-snapshot.json]

Impact: Флаг isAborted проверяется до submit и не сбрасывается в start/prompt. Это наблюдаемое поведение исходников. Отдельный сценарий abort → новый prompt должен подтвердить требуемую семантику живой сессии; существующий happy-path этого не доказывает.

Rule: AP-021 / AP-028 / AP-076; lifecycle and capability preservation.

Fix decision: Resolve lifecycle contract and verify abort/reuse before accepting session behavior. This is an unaccepted WIP finding, not a released-regression claim.

## Plan mapping

- **1 · Slice 0 — В работе.** CLI переведён на runner/dist/main.js; реальный engine передан coordinator; runtime перенесён. Сборка проходила. Последний записанный E2E: таймаут, не PASS. Remaining: Зелёный сквозной stream → settlement → SQLite → restart/readback; убрать обходную fake-admission ветку; независимая приёмка. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]
- **2A · часть Task 2 — Проверен компонент.** 36 компонентных случаев; архитектурное ревью efc9eab — PASS в ограниченном scope. Исправлены kind override и качество RED-пруфа. Remaining: Task 2 целиком: exports, composition, tools/register, actual model tool call → client result → continuation; убрать legacy globals. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]
- **3 · Probe — Остаётся.** Продуктовой приёмки probe нет. Наличие модели в каталоге не доказывает отсутствие SQLite/lock side effects. Remaining: Запуск с чистым временным каталогом; список моделей; ноль session DB, locks и watchers. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]
- **4A · часть Task 4 — Проверен пакет.** f3fff38: архитектурный re-review PASS и black-box публичного пакета PASS; проверены notifications, IDs, XOR, reverse RPC, ошибки и shutdown. Remaining: Task 4 целиком: capability dispatcher, все нативные команды, images/root-child/steer/fork/model/policy/abortTask; endpoint-интеграция. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]
- **5 · Pure Core — Частично затронут Task 1.** Механическая часть переноса уже идёт. Это не равно независимому AST/build/package acceptance чистого Core. Remaining: AST: zero vendor/adapter/I/O imports в Core; ацикличный DAG; корректные public exports; чистая сборка без старого dist. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]
- **6 · S9 и ledger — Остаётся.** Есть только ограниченные component/package PASS. Глобального Cycle-7 PASS нет. Remaining: Независимое architecture + compiled-product review, реальные journeys и orchestrator diff gate на одном кандидате. [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]

## Acceptance obligations

- **Реальный ход модели: Не подтверждено.** CLI bin → настоящий Harness; nonce в model output; canonical text_delta; native Submission.wait() завершён с тем же requestId. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Durability, не «файл появился»: Не подтверждено.** Записи user/assistant читаются через native entries; процесс закрыт; после restart те же EntryId и текст; второй ответ действительно завершён. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Нет умных заглушек: Есть открытые места.** Без engine — явная ошибка, не rec_…; метрики из runtime либо explicit unavailable; каждая внедрённая зависимость доходит до реального потребителя. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Полнота capability: Остаётся.** Images-only, root/child, steer/followUp, abort/reuse, abortTask, compact, model/thinking, policy, bindings/fork и история проверяются отдельно. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Настоящий host tool round-trip: Остаётся.** Модель сама вызывает инструмент; client отвечает reverse RPC; engine использует результат и продолжает генерацию. Один server.request не заменяет этот путь. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Изоляция и lifecycle: Остаётся.** Два instance не делят host/global state; один владелец session lock; abort/failure/shutdown освобождают ресурсы; probe не открывает сессию. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]
- **Один собранный кандидат: Остаётся.** Чистый build + отдельный typecheck + full tests + AST boundaries; потребитель читает public exports/реальный bin, а не случайный stale dist. [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]

## Architecture verification

- Passed (bounded components): AP-010/AP-022/AP-028/AP-074/AP-076 as documented in the Protocol and HostBridge review scopes. These are NOT global architecture passes. [Source: ../reviews/protocol-architecture-rereview-r1.md; ../reviews/hostbridge-architecture-review.md]
- Global AP-075 (working entry point), AP-076 (no hollow implementations), full DI, lifecycle and capability parity remain unaccepted. [Source: current WIP findings above; last E2E receipt]
- Residual risk: incomplete integration, fake admission fallback, decorative resource DI, placeholder metrics, abort/reuse semantics, legacy host globals, unverified probe/isolation/teardown and stale-dist/typecheck blind spots. Some are intentional future scopes; none may be hidden behind a component PASS. [Source: evidence above; planned Tasks 2–6]

No new implementation or reviewer threads launched, no source edits/release/install performed for this assessment. The user asked for the overall picture, not acceleration. [Source: BB Pi thread thr_9yjb93iwmn, user request]
