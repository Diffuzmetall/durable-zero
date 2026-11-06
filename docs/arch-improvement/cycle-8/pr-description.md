# PR: независимый терминальный хост Durable на Zero

## Кратко

Добавлены три workspace-пакета для запуска существующего rich-терминала поверх штатной композиции Zero. Native Pi Durable Harness остаётся единственным владельцем исполнения, инструментов и SQLite-сессии. Закрытие терминала не останавливает работу; повторное подключение не отправляет старый prompt заново.

**Сам native Harness / SDK не патчили. Но изменения не ограничены нашими новыми пакетами:** пять существующих runtime/assembly-файлов Zero получили узкие изменения публичной границы, адресации команд и доставки финальных событий. Также добавлены regression-тесты, dependency lock entries и документация.

## Что было нужно

Собрать локальный Durable на общей основе Zero, а не копировать отдельные внутренние части Zero в старый Host. Сохранить привычные редактор, layout, темы и tool cards. Разделить процесс исполнения и терминальный клиент, чтобы работа продолжалась без подключённых клиентов.

Дополнительно исправлен рабочий путь навыков: в раннем кандидате каталог был пустым, autocomplete отключён, а обычный Enter отклонял `/skill:…` как неизвестную команду. Отключённые Attention/Automation-панели показывали предупреждения, хотя соответствующие возможности ещё не подключены.

## Новые пакеты

### `@local-durable/runtime` — отдельный процесс-хост

- Запускает `assembleDurableZero()`, не создавая второго Harness или модельного цикла.
- Обслуживает JSON-RPC через приватный Unix-сокет с режимом `0600`.
- Держит session lease, отклоняет конкурирующего владельца и проверяет старый endpoint перед удалением.
- Управляет соединениями и ограниченной причинной выходной очередью. Disconnect клиента не вызывает `Harness.close()`.
- Передаёт native view с монотонной ревизией и отдельными metadata ресурсов.
- Раскрывает явный `/skill:имя аргументы` на RPC ingress до native admission.

### `@local-durable/terminal` — клиент

- Подключается к существующему runtime; не владеет моделью, инструментами или SQLite.
- Проверяет envelope и ревизии, отбрасывает устаревшие снимки.
- Передаёт адрес conversation и отклоняет действия после disconnect без автоматического retry.
- При подключении получает историю и состояние, не повторяя предыдущий ввод.
- Запускает rich UI при настоящем TTY; readline остаётся диагностическим probe для pipe/`--probe`.

### `@local-durable/terminal-ui` — существующее представление

- Сохраняет установленный редактор, layout, темы, model picker и карточки инструментов.
- Получает view/controller от клиента через публичный вход, не открывая native-сессию.
- Picker навыков только вставляет команду в редактор; Enter отправляет её, Alt+Enter выбирает native `followUp`.
- Показывает ошибки admission и сохраняет черновик после закрытия error dialog.
- Скрывает только отключённые дополнительные панели, не настоящие runtime notices.
- Использует Photon через штатный Node-модуль; старый filesystem monkey-patch не переносился.

Presentation-код действительно vendored и местами адаптирован. Это не копия Harness или нового execution loop. Сохранены лицензии, original source manifest, 49 provenance records и объявленные adaptation hashes. Перед публикацией к NOTICE добавлено пояснение: старые `src/ui/` пути относятся к исходной поставке, актуальные лицензии находятся в `vendor/licenses/`, а текущая provenance — в `PROVENANCE.json`. Оригинальный текст notice сохранён.

UI использует совместимую с этим сохранённым представлением зависимость `@earendil-works/pi-tui@1.4.0`; native runtime/SDK остаются на `1.5.0`. Это отдельная presentation-зависимость, не откат Harness.

## Что изменено внутри Zero — полный runtime-список

| Файл | Изменение | Причина и граница |
| --- | --- | --- |
| `packages/adapter-pi-durable/src/engine/pi-durable-engine.ts` | Публичные getters `view`/`controller`; явный root target для root submit/abort | Хост получает уже существующие native-порты. Команда root не должна случайно попасть в просматриваемого child |
| `packages/adapter-pi-durable/src/engine/runtime-types.ts` | Опциональные conversation IDs для submit/abort и expected ID для setModel | Контракт выражает адресацию явно; вызовы без новых аргументов сохраняют native selected-conversation поведение |
| `packages/adapter-pi-durable/src/engine/runtime-controller.ts` | Выбор target внутри существующей command queue; hooks, receipts и cascade abort используют этот target; stale model target отклоняется до изменения модели | Исправление адресации и race на границе adapter/controller, не изменение native scheduler или Harness |
| `packages/adapter-pi-durable/src/engine/bridge/watch-events-compat.ts` | `message_end` из committed assistant entry | Live snapshots могут объединиться раньше, чем наблюдатель увидит весь текст. Persisted entry даёт подтверждённое финальное сообщение; генерация модели не меняется |
| `packages/runner/src/composition.ts` | Экспорт native view/controller и read-only facade существующего resource loader/settings | Хост использует штатную композицию, а не создаёт второй loader и не обращается к приватным полям |

Публичные native view/controller types уже экспортировались adapter-пакетом. Core ports и `IAgentEngine` не получили терминальных зависимостей; необязательные native-порты относятся к конкретной композиции. Injected generic engine не обязан их реализовывать.

Regression-тесты: `controller-targeting.test.ts` проверяет root/child адресацию, hooks, receipts, cascade abort, native default и stale model selection. `watch-events-compat.test.ts` проверяет authoritative final messages при пропущенных live updates. Новые package tests покрывают protocol/client/UI/native roundtrip.

## Что не патчили

- Исходники зависимости `@earendil-works/pi-durable` и сам native `Harness`.
- Native model/tool loop, scheduler, task ownership и формат SQLite storage.
- Earendil SDK через `patch-package`, `patchedDependencies`, overrides или скрытый postinstall patch. Таких механизмов в root package/workspace configuration нет; эти два файла не менялись.
- Основной старый Host, его сервисы, launcher и существующие пользовательские сессии.

Таким образом, точная формулировка — **«наша отдельная host/terminal-сборка плюс узкие изменения Zero adapter/runner»**, а не «только три пакета без изменений основы» и не «форк native Harness».

## Навыки: почему preprocessing принадлежит приложению

Штатный resource loader Zero остаётся владельцем каталога. Runner отдаёт read-only доступ к этому же экземпляру; runtime передаёт metadata в `resources`, отдельно от native `view`.

SDK не предоставляет публичного standalone expander, а его приватный `_expandSkillCommand` не импортируется. Небольшой application-owned preprocessing ищет имя в серверном каталоге, читает разрешённый каталогом файл, убирает frontmatter публичным `stripFrontmatter`, формирует skill block и сохраняет аргументы. Он расположен до root/child dispatch, поэтому не дублируется в UI и отдельном модельном цикле.

Unknown/malformed/unreadable skill возвращает ошибку до admission. Это намеренно строже приватного SDK-поведения, которое может оставить неизвестную команду обычным текстом. Native receipt по-прежнему создаёт native submission, не адаптер.

## Сборка и доставка

Кандидат собирается отдельно от committed source `dist`:

```sh
node packages/local-runtime/scripts/build-candidate.mjs /tmp/pi-zero-review-candidate
cd /tmp/pi-zero-review-candidate
node --test --test-timeout=40000 \
  packages/local-runtime/test/*.test.ts \
  packages/local-terminal/test/*.test.ts \
  packages/terminal-ui/test/*.test.mjs \
  packages/adapter-pi-durable/test/controller-targeting.test.ts \
  packages/adapter-pi-durable/test/watch-events-compat.test.ts
```

Нужны подготовленные зависимости, Node `24.19+` и для PTY acceptance — tmux. Подробности fresh setup, source build, standalone `pnpm deploy`, runtime/terminal CLI и PR scope: [architecture-and-packaging.md](architecture-and-packaging.md).

`pnpm-lock.yaml` добавляет importers трёх пакетов и presentation dependency `pi-tui@1.4.0`; версия native Harness не заменяется. `.gitignore` добавляет только машинный CodeGraph-каталог. `AGENTS.md` фиксирует согласованный рабочий контракт: сначала local build и проверка установленного кандидата, затем отдельно разрешённая доставка. После просмотра diff он включён в полную доставку как относящийся к этой работе, без изменения его содержимого при подготовке commit.

pnpm legacy deploy оставлял одну внешнюю self-link на build candidate. Исправлена именно deployment-ссылка, затем проверены все symlink. Это packaging correction, не patch runtime или native SDK. Разрешения install scripts менялись только в скопированном candidate: `@google/genai=false`, `protobufjs=false`, существующий `esbuild=true` сохранён.

## Проверки и доказательства

Проверенная source/build identity: `pi-zero-capabilities-20261106T0642`. Проверенный standalone prefix: `20261106T0642-capabilities`.

- Сборка Zero + runtime + terminal, production typecheck — PASS.
- Scoped source/native/UI/adapter regressions — **50/50**, без skipped.
- Installed rich PTY acceptance — **13/13**: insertion-only picker, Enter, Alt+Enter во время активного turn, skill body в native transcript, error/draft recovery, native Bash после отключения всех клиентов, reconnect без replay.
- **459** существующих внутренних symlink, **0** external/broken targets.
- **8/8** entrypoint hashes совпадают между build и установкой; **49/49** presentation records и объявленная replacement прошли hash checks.
- Native source lifecycle test дополнительно покрывает abort, graceful restart и SIGKILL recovery.

Полный результат и ссылки на логи, driver, экраны и манифест: [capability-followup.md](capability-followup.md). В репозитории ссылки относительны к этому документу. При создании GitHub PR ссылки преобразуются в permalinks на опубликованный commit.

Deterministic provider заменяет только ответы модели. PTY, Harness, SQLite и Bash настоящие. Предыдущий live `gpt-6.1-sol` smoke в Rex относится к предыдущему candidate и не выдаётся за новый live-provider тест. Метаданные/пояснение NOTICE уточнены при подготовке PR; executable и provenance-tracked presentation bytes не менялись после acceptance.

## Ограничения и что не входит в PR

- Attention/supervisor, Goal и schedules отложены; скрытие панели не означает реализацию её backend.
- Нет переноса всей коллекции extensions, BB/iii adapters или hot reload ресурсов.
- Child-targeting покрыт scoped adapter/client regressions; installed driver не доказывает полный subagent UI roundtrip.
- Основная команда Pi Durable и уже открытая вкладка Rex не переключены. Старые сессии не мигрировали.
- Совместная пользовательская приёмка нового кандидата и глобальное переключение остаются отдельными шагами.
- Source/regression/installed evidence не подменяется утверждением, что весь test suite репозитория или GitHub CI прошёл. Полный suite в рамках этого этапа не запускался.

PR не должен merge автоматически. Текущий запрос разрешает commit, push и создание PR, но не глобальное переключение, migration, npm publication или production deployment.
