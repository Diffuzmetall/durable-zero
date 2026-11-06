# Текущий Durable, терминал, BB, iii и перенос расширений

Первый read-only проход. Классификация ниже — предложение границ переноса, не результат проверки совместимости. Пользовательские сессии, модели и сервисы не запускались и не изменялись.

## Источники и обозначения

- `H`: `/home/ubuntu/Projects/pi-durable-host`.
- `P`: `/home/ubuntu/Projects/pi-durable-playground`.
- `B`: `/home/ubuntu/Projects/pi-durable-bb-adapter`.
- `A`: `/home/ubuntu/Projects/bb-iii-acp`.
- `E`: `/home/ubuntu/Projects/pi-durable-extensions`.
- `I`: `/home/ubuntu/Projects/iii-test/iii-agent-lab/workers/durable-pi`.
- `R`: `/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-unified-sse-mcp140-20261031-v1`.
- `N`: `R/node_modules/dpi-backend/dist/dpi-backend/src/native-profile`.
- `T`: `/home/ubuntu/.local/share/pi-durable-host/releases/delivery-recovery-terminal-20261101`.
- `Z`: текущий репозиторий Zero, baseline `9b65f9b`.

Локальные checkouts содержат ранее существовавшие незакоммиченные изменения. Их состояние не подменялось Git HEAD и не изменялось исследованием. Точные строки ниже относятся к прочитанному рабочему дереву.

## 1. Не один текущий runtime

```text
Установленная команда:
~/.local/bin/pi-durable
  → закреплённый terminal-launcher.mjs
  → DpiClient → Host service → native profile → Pi Harness

Текущий Host checkout:
terminal main → RemoteTerminal → DpiClient → HTTP /v1 → routes
  → Store.initializeAgent → Harness.open → SQLite
Harness → watchEvents → SSE → SDK → TerminalProjection → TUI

Старый Playground:
main → openDurable → Harness + SQLite → runDurableTui → close
```

### Владение и жизненный цикл

| Граница | Источник |
|---|---|
| Host startup | `H/apps/dpi-backend/src/main.ts:9–19` |
| Store, session lock, SQLite, Harness, profile.bind, resume | `H/apps/dpi-backend/src/store.ts:697–808` |
| Host catalog/app/session databases | `H/apps/dpi-backend/src/store.ts:214–217,560` |
| Terminal client startup | `H/apps/terminal-adapter/src/main.ts:22–38` |
| Terminal screen / ProcessTerminal | `H/apps/terminal-adapter/src/ui/experimental/durable/tui.ts:238,282` |
| Terminal event projection | `H/apps/terminal-adapter/src/remote-controller.ts:160–179` |
| Installed launcher | `/home/ubuntu/.local/bin/pi-durable:3`; `T/host-bindings-v16/terminal-launcher.mjs:10,24–31,63–64,86–98` |
| Playground owner | `P/coding-agent-durable/main.ts:15–19`; `P/coding-agent-durable/runtime.ts:146–177,358–385` |
| Playground session selection and locks | `P/coding-agent-durable/sessions.ts:18–55` |

Установленный launcher выбирает Host session ID, использует DpiClient и не открывает собственный Harness. Для новой сессии он сохраняет request intent и удаляет его только после подтверждённого создания. Эти semantics нельзя потерять при замене терминального транспорта.

Программное закрытие Zero composition закрывает coordinator и engine. Отключение удалённого терминального клиента не должно автоматически закрывать общую Host-сессию. Это разные жизненные циклы.

### Незавершённые границы текущего checkout

- Backend `H/apps/dpi-backend/src/streams.ts:246–275` отправляет `snapshot/batch`.
- SDK `H/apps/dpi-sdk/src/client.ts:183–184` отклоняет такие legacy observations с `426`.
- RemoteTerminal `H/apps/terminal-adapter/src/remote-controller.ts:173–179` ожидает `agent.state`.
- Установленный terminal release `T/node_modules/dpi-terminal-adapter/dist/remote-controller.js:162` принимает `snapshot`; его нельзя приравнивать к текущему checkout.
- Новый `H/apps/dpi-backend/src/durable/native-session.ts:58–85` не является подтверждённым владельцем production-сессий: Store по-прежнему напрямую вызывает Harness.open. Найденное использование в `contract-check.ts:2,6` — типовое, не вызов открытия.

Это подтверждает статическое несовпадение проверенных исходников, но **не доказывает отказ установленного сервиса**. Проверка живой пары backend/SDK/terminal остаётся отдельной задачей.

Название **DKP** в исследованных Host/terminal source-каталогах не найдено. DPI и SDK нельзя автоматически считать его расшифровкой.

## 2. BB

```text
BB → Pi provider / projection bridge
  ├── SharedHostClient → существующий native Pi Harness
  └── RunnerProcess → локальный runner / Harness
```

Источники:

- `B/src/provider/host/index.ts:6,36–40` — projection bridge.
- `B/src/projection/host/session.ts:123–144` — выбор SharedHostClient либо RunnerProcess.
- `B/src/provider/runner/runtime-loader.ts:54,78` — `noExtensions: true` и открытие native Harness.

Следствие: наличие Pi resource loader в Zero не делает старый BB runner автоматически совместимым. Требуются явное подключение общего runtime, сохранение host tool results, streaming и управления сессией. Не создавать второй набор инструментов или владельца исполнения внутри BB.

Соответствие установленного BB plugin этому checkout не подтверждено.

## 3. Два разных iii-пути

### BB → native iii Harness

```text
BB → bb-iii-acp → upstream ACP → native iii Harness → Router / iii tools
```

`A/bridge.mjs:164–192` вызывает `harness::send` и проецирует сообщения; `:222` вызывает `harness::stop`. Политика функций задаётся на `:8–16,170–175`. Этот мост не является Pi Durable extension и не переносит автоматически полномочия BB.

### iii → существующий Pi Harness

```text
iii engine → durable-pi worker → nativePort → уже открытый Pi Harness
Host native-profile/iii → delegated grants + jobPort → тот же Pi Harness
```

- `I/src/adapter.ts:26–29` требует настоящий Hindsight controller с `admit`, `bind`, `close`.
- `I/src/adapter.ts:43–57` запускает binding/nativePort/worker после host binding; reconciliation предшествует native resume.
- `I/src/worker.ts:128,189` — функции `durable-pi::*` и отдельный completion binding.
- `N/iii/index.js:6–22,40–46,65–79` — установленный delegated grants/jobPort путь.
- `R/node_modules/dpi-backend/dist/dpi-backend/src/routes.js:165–185` — HTTP routes.

У Zero BuiltinExtensionContext пока нет post-open Harness binding. Прямое копирование старого iii adapter не создаст корректный lifecycle, grants или recovery. Native iii Harness и Pi Harness остаются разными владельцами исполнения.

## 4. Что именно переносим из коллекции расширений

**Важное уточнение:** среди исследованных 31 каталогов `E/packages/*` не подтверждено ни одного кандидата, который достаточно просто подключить как обычный Pi ExtensionAPI-модуль без адаптации. Большинство исполняемых компонентов используют native Durable Registry/host contracts. Возможность Zero загружать Pi extensions полезна, но сама по себе эту коллекцию не переносит.

Первичная полная карта entries: `E/docs/extensions-inventory.md:24–56`; дополнительно проверены исходники и package manifests. Число каталогов не равно числу активных или устанавливаемых плагинов.

| Каталоги в `E/packages/` | Предлагаемая граница Zero | Условия переноса |
|---|---|---|
| `codemode` | Уже имеющийся BuiltinExtension | Переиспользовать Zero adapter-codemode; не запускать второй sandbox |
| `web-tools`, `context7`, `antigravity-tools`, `codex-api`, `search-history`, `mcp-guidance` | Адаптация native tools в BuiltinExtension | Явно передавать permissions/network/provider capabilities; сохранить hooks и prompt/tool-view semantics |
| `agent-mail`, `agent-mail-identity` | Runtime/host adapter | Identity, guards и watcher lifecycle принадлежат host authority |
| `agent-profiles` | Библиотека + adapter | Переиспользовать parser/catalog; запуск агентов не переносить в библиотеку |
| `antigravity-shim` | Provider/service adapter | Отдельный startup/auth; это не просто Registry extension |
| `dcg-guard` | Execution adapter | Проверка на настоящей границе исполнения; не только UI/tool-call preview |
| `durable-browser` | Runtime adapter | Один browser owner, conversation-scoped contexts и cleanup |
| `codex-voice` | Transport adapter + UI | Разделить transcription/transport и запись микрофона/редактор |
| `durable-goals`, `durable-schedules`, `durable-subagents`, `durable-triggers` | Native orchestration adapters | Сохранить admission, real receipts, parent/child delivery, cancellation и recovery; не создавать второй task loop |
| `hindsight`, `langfuse`, `running-now` | Нужен post-open host/runtime contract | Нужен существующий Harness, visibility/admission и bind/drain/close |
| `local-host` | Не переносить старую композицию целиком | Разобрать полезные зависимости; не применять monkey-patching старого controller рядом с новым владельцем |
| `activity-panel`, `automation-footer`, `minimal-footer`, `quit-command`, `slash-menu`, `tool-cards` | Терминальный host UI adapter | Переносить поведение и renderer contracts, не применять старые patches вслепую |
| `session-resume`, `host-recovery` | Session/operational adapter | Session identity, locks, receipt uncertainty и recovery; старый SQLite-path CLI не равен Host-ID CLI |
| `cli` | Distribution/installer | Установка не означает активацию; отдельная задача от исполнения агента |

Классификация обозначает направление. Для каждого пакета ещё нужны сборка на SDK 1.5 и сценарий через реальную сборку Zero. Ни одна строка не помечена как выполненный перенос.

### Проверенные глубокие зависимости

- `E/packages/hindsight/src/adapter.mjs:39,75`: native Registry и Host binding; controller живёт дольше отдельной регистрации.
- `E/packages/langfuse/src/index.mjs:153`: получает существующий Harness.
- `E/packages/running-now/src/index.ts:11–15`: получает существующий Harness/taskGraph и visibility callback.
- `E/packages/local-host/src/adapter.ts:51–72`: изменяет внутренний controller lifecycle.
- `Z/packages/adapter-pi-durable/src/engine/builtin-extensions/types.ts:7–22`: текущий BuiltinExtensionContext предоставляет registry/settings, но не открытый Harness.

Нельзя решать эти зависимости decorative DI или скрытым глобальным Harness. Нужна минимальная настоящая граница, принадлежащая runtime, и один проверенный lifecycle.

### Права на повторное распространение

Inventory отдельно отмечает unresolved/UNLICENSED участки у некоторых извлечённых пакетов. Root MIT не отменяет package NOTICE и права донора. До копирования такого кода в публично распространяемую сборку требуется разрешить provenance/licensing; исследование не выдаёт такое разрешение.

## 5. Конфигурация не равна фактической загрузке

Безопасная выборка service configuration указала на `R/operational-service.mjs`. Состояние systemd и живые session journeys не проверены; пользовательская шина была недоступна при отдельной проверке.

В `nativeExtensions` найден установленный путь MCP guidance `0.1.0-candidate.0`. Это не означает, что всё остальное отсутствует: профиль сам собирает значительную часть runtime.

| Установленный source | Что собирается |
|---|---|
| `N/profile.js:68–101` | Coding tools, skills, web, Context7, Codex, Antigravity |
| `N/profile.js:119–126` | MCP/CodeMode и subagents |
| `N/profile.js:129–197` | Автоматизация и память |
| `N/profile.js:283` | iii binding |
| `R/operational-profile.mjs:105–107,132–134` | Условные Langfuse и DeLM; активность не установлена |

Общие Pi settings содержат explicit paths для `tool-schema-bounds-guard`, двух `pi-above-harness` bridges, Algorithm, Antigravity proxy и Hindsight coding-agent plugin. Это отдельный классический Pi-контур. Их конфигурация не доказывает загрузку установленным native Host и не является доказательством Zero compatibility.

## 6. Несовпадение версий

| Кандидат | Подтверждено |
|---|---|
| Zero | package `0.27.0-alpha.1`, SDK `1.5.0` |
| Host checkout | Backend/SDK/terminal-adapter `0.1.0`; native Durable/pi-tui dependencies `1.4.0` |
| Установленный Host R | Durable `1.4.0` по package manifest |
| BB checkout | `0.3.0-beta.1`; Durable dependencies `1.2.0`, BB SDK `0.6.15`; description одновременно говорит SDK 1.3 |
| Коллекция E | Большинство manifests SDK 1.3; mcp-guidance/running-now — SDK 1.4 |
| Playground | Dependencies `^1.0.0`; локальные Durable/pi-tui `1.0.0` |
| ACP bridge A | iii-sdk `0.24.6` |
| durable-pi worker I | iii-sdk `0.25.0` |

Эти строки описывают manifests, а не одинаковый работающий API. Глобально установленный Pi SDK 1.5 не обновляет автоматически закреплённый Host release.

## 7. Доказано и осталось проверить

**Доказано чтением:** точки запуска, владельцы Harness, разные iii-направления, native extension boundaries, statically mismatched checkout events, фактический путь установленного terminal launcher. Важные выводы сопоставлены с исходниками, а не только с графом или README.

**CodeGraph:** существующие индексы H/P/B/E использовались для навигации. В B результаты часто указывали на старые `candidates`, поэтому они не принимались за текущий `src`. Индекс Z в ходе исследования отсутствовал; новый запуск не выполнялся.

**Не проверено исполнением:** совместимость SDK 1.3/1.4 extensions с 1.5, полная установленная пара Host/SDK/TUI, BB native host-tool roundtrip на Zero, post-open lifecycle, iii grants/completion/recovery, reconnect/revocation/uncertain delivery и migration пользовательских SQLite.

Следующий результат должен быть ограниченным интегрированным сценарием, а не набором успешных component imports. Для терминала это реальный ввод → native submission → streaming/tool → подтверждённое завершение → abort/reopen на тестовой сессии, с настоящим host UI и без второго владельца Harness.
