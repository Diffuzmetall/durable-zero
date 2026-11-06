# Durable Zero: исходники и границы интеграции

## Durable Zero 0.27.0-alpha.1 — снимок 2026-11-05

**Repo:** https://github.com/VanDalkvist/durable-zero @ `9b65f9b0d8b74e063866e63e6a2cfe553ae97a4f`.

Это исследование перед переносом локального Durable, а не приёмка работающей миграции. Production-код и активное окружение не изменены.

### Версии и происхождение

- Рабочая папка клонирована с `origin/main`. Root package.json закрепляет Earendil Pi SDK `1.5.0`.
- Тег `v27` содержит package version `0.27.0-alpha.1`; его нельзя считать стабильным релизом только по имени.
- Последний найденный semver-тег без prerelease: `v0.26.31` @ `eceb5c16ee912320e2244eb8ec1c62c1f7b292ce`. Его package.json тоже закрепляет SDK `1.5.0`.
- Между `v0.26.31` и исследуемым HEAD в `packages/` и `scripts/` изменены 309 файлов. Старый тег не подменяет текущую архитектуру.
- GitHub Releases, последние merged PR и открытые issues в выполненных ограниченных запросах вернули пустые списки. Это не доказательство отсутствия исторических проблем.
- Поиск Exa не дал полезного независимого описания Zero. Основание выводов — текущие исходники; страница GitHub README также открыта.

### Фактический поток исполнения

```text
CLI serve / programmatic assembleDurableZero
  → runner: composition root
  → core: SessionCoordinator
  → core port: IAgentEngine
  → adapter-pi-durable: PiDurableEngine
  → openDurable → loadHarnessEnvironment
  → native Harness.open + SQLite + native ExecutionEnv

native observations / submission.wait()
  → DurableEventAdapter / PiDurableEngine.events
  → SessionCoordinator.events
  → session/event notifications → host
```

Core не запускает второй цикл модели. Адаптер открывает native Harness и SQLite; coordinator делегирует ему исполнение.

**Источники:** [composition.ts:52–186](../../../packages/runner/src/composition.ts#L52), [coordinator.ts](../../../packages/core/src/session/coordinator.ts), [pi-durable-engine.ts:66–193](../../../packages/adapter-pi-durable/src/engine/pi-durable-engine.ts#L66), [runtime-loader.ts:191](../../../packages/adapter-pi-durable/src/engine/runtime-loader.ts#L191).

### Владение пакетами

| Пакет | Текущая ответственность |
|---|---|
| contracts | Wire DTO: запросы, события, сообщения, receipts |
| core | SessionCoordinator, политика, порты engine/store/execution/host |
| adapter-pi-durable | Native Harness, SQLite, сессии, загрузка расширений, проекция событий |
| protocol | JSON-RPC 2.0, stdio, корреляция запросов и ответов |
| execution | Реализации меньшего Core execution-контракта |
| adapter-pi-ai | Адаптация модельного провайдера |
| adapter-codemode | BuiltinExtension для native codemode и QuickJS |
| extension-pi-resource | Pi settings и resource loader |
| runner | Сборка конкретных зависимостей и процесс |
| cli | Внешняя команда запуска |

Статический поиск не обнаружил `@earendil-works/*` или `@durable-zero/adapter*` в `packages/core/src`. Это ограниченный текстовый контроль, не доказательство полного отсутствия архитектурных нарушений.

## Доступность возможностей: не смешивать три уровня

### 1. Реально смонтированный runner

`composition.ts:148–168` маршрутизирует только:

- `session/prompt`
- `session/abort`
- `session/getState`
- `session/getTranscript`
- `session/getStats`
- `session/setSubagentPolicy`

Admission receipt означает принятие запроса, а не готовый ответ. `PiDurableEngine.submit()` сохраняет native Submission и сообщает завершение после `wait()`.

### 2. Реализованные компоненты вне production-сборки

- [createSessionDispatcher](../../../packages/runner/src/dispatch/session-dispatcher.ts#L20) содержит дополнительные методы: model/thinking controls, compact, abortTask, steer/followUp. Production composition его не вызывает.
- `tools/register`, `session/fork` и binding-операции в этом dispatcher явно возвращают unsupported.
- [HostBridge](../../../packages/runner/src/host/host-bridge.ts#L24) умеет `host/toolCall` и `host/interaction`, но production composition его не создаёт и не подключает к engine.

### 3. Декларации и остатки прежней реализации

- В [runtime-types.ts:24–36](../../../packages/adapter-pi-durable/src/engine/runtime-types.ts#L24) локальный `IHostBridge` пока пустой. Наличие `dependencies.hostBridge` не подтверждает действующую интеграцию.
- В [host-rpc.ts:104–132](../../../packages/adapter-pi-durable/src/engine/host-rpc.ts#L104) остались mutable module-level forwarders. Это расходится с целевым constructor DI из Cycle 7.
- Существование этих методов и типов нельзя считать готовым BB roundtrip.

## Расширения: два разных контракта

### Pi extension — основной кандидат для наших существующих расширений

```text
--extension / resource discovery
  → DefaultResourceLoader.reload()
  → pending provider registrations
  → ExtensionRunner
  → adaptExtensionTool → native registry
  → lifecycle hooks
```

Factory получает `ExtensionAPI` из `@earendil-works/pi-coding-agent`. Поэтому перенос в Zero не требует автоматически переписывать каждое расширение в новый формат.

**Источники:** [runtime-loader.ts:82–174](../../../packages/adapter-pi-durable/src/engine/runtime-loader.ts#L82), [extension-mount.ts](../../../packages/adapter-pi-durable/src/engine/extension-mount.ts), [shared/extension-runner.ts](../../../packages/adapter-pi-durable/src/engine/shared/extension-runner.ts).

### BuiltinExtension — компонент сборки native runtime

Контракт: `id`, `name`, `version`, `register(context)`, необязательный `teardown()`.

Контекст может содержать native Registry, SettingsManager, policy getter и dynamic namespaces. Пример — `adapter-codemode`. Это не взаимозаменяемая форма Pi extension и не обязательная цель для каждого пользовательского расширения.

**Источники:** [builtin-extensions/types.ts:17](../../../packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts#L17), [adapter-codemode/codemode.ts](../../../packages/adapter-codemode/src/codemode.ts).

## Терминальный UI — существенная незакрытая граница

В [createExtensionUIContext](../../../packages/adapter-pi-durable/src/engine/shared/extension-ui-context.ts#L4):

- `select`, `confirm`, `input` обращаются к requester; default requester без подключения возвращает `null`.
- `onTerminalInput`, status, widgets, footer/header и работа с editor представлены пустыми обработчиками.
- `custom()` возвращает `undefined`.
- `setTheme()` возвращает `{ success: true }`, не устанавливая тему.
- [extension-runner.ts:145](../../../packages/adapter-pi-durable/src/engine/shared/extension-runner.ts#L145) устанавливает именно этот UI context.

Следствие: импорт расширения и успешная регистрация инструментов не подтверждают работу его терминального интерфейса. Перенос терминала требует настоящего host UI adapter и проверок пользовательских сценариев; нельзя оставлять фиктивно успешные UI-вызовы.

## Commands

| Задача | Команда | Ограничение |
|---|---|---|
| Версия | `node packages/cli/bin/durable-zero.js --version` | Реально печатает alpha version |
| Справка | `node packages/cli/bin/durable-zero.js --help` | Текст устарел: обещает run, doctor и socket daemon |
| Запуск | `node packages/cli/bin/durable-zero.js serve --cwd PATH --session-dir PATH` | Stdio JSON-RPC; не интерактивный терминал |
| Сборка | `pnpm build` | В этом checkout не запускалась |
| Typecheck | `pnpm typecheck` | В этом checkout не запускался |
| Тесты | `pnpm test` | Полный набор не запускался |
| Prototype doctor | `node packages/cli/bin/durable-zero.js doctor` | Exit 1; не реализовано |
| Prototype run | `node packages/cli/bin/durable-zero.js run text` | Exit 1; не поддерживается |

## Config

| Параметр | Default / поведение | Владелец |
|---|---|---|
| `cwd` / `--cwd` | `process.cwd()` | composition root |
| `sessionDir` / `--session-dir` | `--session` относительно cwd либо `.durable/sessions/default` | composition root |
| `--provider`, `--model`, `--thinking` | Если не заданы, выбираются settings/native runtime | Pi adapter |
| `--extension` | Повторяемый; explicit extension paths | resource loader |
| `--skills` | Повторяемый; additional skill paths | resource loader |
| `--no-global-extensions` | По умолчанию `false`; explicit paths сохраняются | resource loader |
| `--continue` | По умолчанию не задан | Pi session selection |
| `--no-session` | Парсится, но не подключён как stateless mode | Незавершённая возможность |
| `engine` | Default `PiDurableEngine`; override обходит его создание | programmatic assembly |
| `nativeExecutionEnvFactory` | Default native `NodeExecutionEnv` | programmatic assembly |
| `executionEnvFactory` | Альтернатива с меньшим Core ABI; несовместима с одновременным native factory | programmatic assembly |

**Источники:** [composition.ts](../../../packages/runner/src/composition.ts), [cli-args.ts](../../../packages/runner/src/cli-args.ts), [main.ts](../../../packages/runner/src/main.ts).

## Env Vars

| Переменная | Назначение |
|---|---|
| `PI_ADDITIONAL_EXTENSIONS` | Comma-separated дополнительные пути расширений |
| `PI_AGENT_DIR` | Изоляция Pi resources/settings; используется E2E fixtures |
| `HOME`, `XDG_CONFIG_HOME` | Изоляция пользовательской конфигурации в тестовых дочерних процессах |

Перечисление ограничено проверенными интеграционными точками. Это не полный каталог переменных upstream SDK; значения секретов не читались.

## Gotchas

1. **CLI help не равен возможностям.** `run` и `doctor` завершаются ошибкой; `serve` — stdio, не socket daemon. Источник: [CLI](../../../packages/cli/bin/durable-zero.js).
2. **Компонентный PASS не равен runtime integration.** HostBridge и расширенный dispatcher не смонтированы в default composition. Источник: composition и соответствующие компоненты.
3. **UI может сообщать ложный успех.** Особенно `setTheme()`, пустые widget/editor callbacks и отсутствующий requester. Источник: extension-ui-context.
4. **Core execution env не равен native ExecutionEnv.** Не расширять интерфейс догадками и не подменять неподдерживаемые операции host filesystem. Источник: composition, core-execution-env-adapter и R8 amendment плана.
5. **Ветка и установленная программа — разные объекты.** Для миграции надо закрепить и проверить фактически запускаемый артефакт каждого хоста.
6. **Токены требуют отдельной проверки семантики.** `getStats()` читает `harness.usage().totalTokens`; это само по себе не доказывает корректный текущий context-window meter.

## Свежая проверка этого checkout

Выполнено:

```sh
node --test --test-timeout=10000 \
  --test-name-pattern='prints version|unsupported prototype' \
  packages/cli/test/cli.test.ts
```

Результат: **3 теста PASS, 0 FAIL**, exit `0`. Проверены только version и честный отказ `run`/`doctor`. `serve`, native Harness, SQLite, расширения и терминал этим запуском не проверены.

`node_modules/` отсутствует. `pnpm --version` через текущий Corepack завершился `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`; окружение не исправлялось. Полный build/typecheck/regression и model calls не выполнялись.

CodeGraph: пользователь сообщил о текущей индексации. При проверке этой рабочей папки `.codegraph/codegraph.db` ещё отсутствовал. Повторная индексация не запускалась; структурные выводы этого документа основаны на исходниках, а не на готовом графе.

## Sources

- Code: ссылки на файлы и строки выше, baseline `9b65f9b`.
- Existing intent, not proof of implementation: [Cycle 7 plan](../../superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md).
- Historical evidence, not a fresh test: [Cycle 7 index](../cycle-7/README.md).
- Opened public source: https://github.com/VanDalkvist/durable-zero.
