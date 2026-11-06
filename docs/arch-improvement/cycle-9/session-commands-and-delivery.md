# Session commands: исправления и проверенная поставка

## Результат

`/new`, `/name` и `/resume` работают через существующий rich terminal и host RPC, а не через второй model loop. `/clear` использует тот же host selection contract, что `/new`. Терминал отсоединяет прежний клиент; native runtime и его работа сохраняются.

Финальный source candidate: `/tmp/pi-zero-session-commands-20261106-d`. Отдельная standalone установка: `~/.local/share/pi-durable-zero/candidates/20261106-session-commands-d`. Основа — доставленный SnowyCave Cycle 8 `2147e8d7b7109a7debe663c4b27900bed94bbcda` плюс Cycle 9. [33 source-файла с SHA256](evidence/source-manifest.json) побайтово совпали с candidate. MCP manager/activation/projection из Cycle 8 повторно проверены на этом artifact. Исторический candidate c и его результаты сохранены в [candidate-c](evidence/candidate-c/).

Основная команда `pi-durable` не заменена. Пользовательские сессии и credentials не переносились; прежние сервисы, вкладки и отключённые интеграции не менялись. Все runtime/PTY проверки использовали отдельные HOME, config, workspace, session catalog и собственный tmux server. Cleanup сверяет runtime PID, executable path и cwd перед сигналом.

## Причины и исправления

- **`/new` и `/clear`:** renderer отклонял создание сессии как unsupported. Теперь он возвращает `null` host loop. Host создаёт descriptor с request UUID, запускает отдельный native runtime и подключает тот же UI. Native DB и Harness принадлежат runtime, не catalog.
- **`/name`:** transport method был заглушкой. `session/rename` сохраняет display name в `.terminal/session.json`, отправляет новую view revision и не изменяет native identity. Валидация — trimmed 1–120 символов без Unicode control/format characters.
- **`/resume`:** picker существовал, но не имел настоящего catalog/controller. `session/list` и `session/describe` дают проверенные sibling sessions. Выбор за пределами catalog отклоняется; UI сравнивает native ID и session directory.
- **Начальная готовность:** installed `/new` выявил гонку, которую прежние component tests пропустили. `instance` присваивался до асинхронного чтения catalog; ранний `runtime/info` допускал terminal с `sessionName: undefined`. Теперь входящие connections не допускаются до полной готовности host envelope. [Native red](evidence/readiness-red.txt) фиксирует `expected string / actual undefined`, [PTY red](evidence/readiness-red-screen.txt) — потерю display name.
- **Длина Unix-сокета:** каталог `new-<полный UUID>` помещался в короткий `/tmp` fixture, но давал 114 bytes в стандартном `~/.local/state/pi-durable-zero/sessions`. [Red](evidence/socket-path-red.txt) воспроизводит превышение лимита 103 bytes в default-style layout. Теперь имя каталога — base64url всех UUID bytes, без потери битов; native и installed tests используют удлинённый catalog path.
- **Extension inheritance:** catalog сохраняет effective configured extension paths, включая `PI_ADDITIONAL_EXTENSIONS`. Installed test запускает original runtime с fixture **только через env**, а terminal — без него; новый runtime всё равно получает provider через descriptor. При restart без options сохранённый список читается **до** native assembly; явный `[]` по-прежнему очищает его. Model берётся из текущего native agent document.
- **Прерванное создание:** descriptor готовится в отдельном staging directory внутри `.terminal` владельца, затем полный каталог публикуется атомарным rename. Retry после пустого interrupted target проходит; занятый чужими данными target не перезаписывается.
- **Activation при смене exposure:** adapter убирает прежнее прямое объявление после `direct → codemode/deferred`, сохраняя явный выбор deferred tool и deselection. Два red regressions подтвердили дефект; общий suite проверил исправление. Не поддерживаемые SDK удаления tools/child registry records не превращены в новые механизмы.

Изменения catalog и launch loop находятся в наших `local-runtime`/`local-terminal` packages. Для session commands менять Zero Core, копировать native execution internals или переносить legacy `local-host` не потребовалось. Контракты `TerminalController`/`TerminalViewSource` сохраняют renderer отдельно от host transport.

## Проверки финального кандидата

> 🧠 **From Hindsight memory (Conventions and patterns)** — В проекте раздельно учитывают source, native и installed evidence. Исторические PASS не доказывают готовность нового artifact; таблица ниже относится к свежим проверкам указанного кандидата.

| Проверка | Результат | Evidence |
| --- | --- | --- |
| Build и production TypeScript | PASS | [build](evidence/build.txt) |
| Provenance / public UI import | PASS, 49 records | [package proof](evidence/package.json) |
| Финальный scoped native/runtime/client/UI/adapter suite, `--test-concurrency=1` | **79/79 PASS**, 0 skipped | [финальный лог](evidence/regressions-serial.txt) |
| Предыдущий candidate b: concurrent suite | **72 PASS / 2 FAIL** из 74 | [сохранённый лог](evidence/regressions-concurrent.txt) |
| Candidate b: два упавших MCP cases отдельно | **2/2 PASS** | [serial log](evidence/mcp-regressions-serial.txt) |
| Installed `/new`, `/name`, `/resume`, cancel, reconnect, preserved work | **11/11 PASS** | [results](evidence/session-commands-installed/results.json) |
| Installed MCP manager, exposure, reconnect, reload, Bash | **24/24 PASS** | [results](evidence/mcp-installed/results.json) |
| Installed skills/editor/follow-up/disconnect baseline | **13/13 PASS** | [results](evidence/baseline-installed/results.json) |
| Standalone dependency closure | 460 symlinks, **0 external / 0 broken**, 11 matching entry hashes | [manifest](evidence/package.json) |

Два concurrent failures предыдущего candidate b не скрыты: stalled-peer startup превысил короткий readiness deadline; manager input оказался на другой menu row при высокой параллельной нагрузке. Оба cases прошли отдельно без изменения source. Финальный candidate d после исправлений source review прошёл весь scoped suite последовательно: 79/79. Это указывает на timing-sensitive harness, но не доказывает отсутствие всех конкурентных дефектов. Полный параллельный прогон не объявляется зелёным.

Installed checks проверяют реальный Harness, SQLite, native tools, Unix socket, original MCP protocol и rich PTY. Offline fixture заменяет только model responses и свой MCP peer. Эти результаты не подтверждают live-provider credentials, внешние MCP services, реальную OAuth процедуру, macOS или весь repository test suite.

### Что видно в rich terminal

- [Resume picker](evidence/session-commands-installed/01-resume-picker.txt) показывает обе именованные сессии.
- [Возвращённая original session](evidence/session-commands-installed/02-resumed-original.txt) содержит прежний streamed response.
- [Повторное открытие второй сессии](evidence/session-commands-installed/03-reopened-second.txt) восстанавливает сохранённое имя.

Installed driver проверяет исходный PID после resume, отдельный PID для новой сессии, отсутствие повторного user prompt и продолжающийся native run в первой сессии. Затем он отменяет собственный slow run и завершает только свои runtimes.

## Воспроизведение

```sh
node packages/local-runtime/scripts/build-candidate.mjs /tmp/NEW-CANDIDATE
# Standalone offline deploy и self-link repair:
# docs/arch-improvement/cycle-8/architecture-and-packaging.md

PREFIX="$HOME/.local/share/pi-durable-zero/candidates/20261106-session-commands-d"
python3 docs/arch-improvement/cycle-9/session-commands-installed-check.py "$PREFIX"

# Внутри собранного source candidate:
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=40000 \
  packages/local-runtime/test/*.test.ts \
  packages/local-terminal/test/*.test.ts \
  packages/terminal-ui/test/*.test.mjs \
  packages/adapter-codemode/test/*.test.ts \
  packages/adapter-pi-durable/test/{controller-targeting,watch-events-compat,extension-user-message,extension-ui-context,extension-activation,runtime-activity,mcp-prompt-sync}.test.ts
```

Изменённый native regression находится в `packages/local-runtime/test/session-catalog-native.test.ts`: он пробует `runtime/info` **до stdout ready**, затем проверяет обязательное display name. Ожидание только готового stdout раньше скрывало дефект.

## Независимое source review

Первый Astra attempt завершился [incomplete / not accepted](evidence/review-attempt-incomplete.md): substantive source review не выполнено. Нулевое число findings в нём не означает PASS.

Два native read-only reviewers `openai-codex/gpt-6.1-sol` завершили проверку ограниченных пакетов frozen candidate c: [sessions packet](evidence/review-packet-sessions.md), [MCP packet](evidence/review-packet-mcp.md). Полные reports: [sessions](evidence/review-results-sessions.md) и [runtime/MCP](evidence/review-results-mcp.md). Они не исполняли product commands/tests и не проверяли final candidate d.

[Disposition каждого замечания](evidence/review-dispositions.md) связывает три подтверждённых дефекта с red/green evidence и новым artifact. Исчезновение tools из регистрации и удаление child registry record не установлены как поддерживаемые операции; это открытые условия/границы покрытия, а не закрытые исправления. Новых reviewers не запускали. Независимый полный PASS или независимое повторение installed QA не заявляются.

## Доставка и остаток

Доставка — существующий [PR № 3](https://github.com/VanDalkvist/durable-zero/pull/3), head `Diffuzmetall/durable-zero:feat/zero-terminal-runtime`. SnowyCave уже доставил Cycle 8 commit `2147e8d7b7109a7debe663c4b27900bed94bbcda` и передал Git index GrayMountain (Mail 533). Cycle 9 содержит scoped source/tests/docs поверх него; новый PR, branch, глобальная замена и npm publication не требуются. Exact source identity перед commit зафиксирован manifest; итоговый remote SHA проверяется при push и сообщается в результате доставки.

Tracked `dist`-изменения, появившиеся от стандартного build в рабочем checkout, не смешиваются с исходниками этой поставки и не удаляются обходом DCG. Отдельный build candidate воспроизводит artifact из source.

Session catalog не мигрирует старые пользовательские DB и не сканирует весь legacy Host. Общий extension UI dispatch, все capabilities прежнего Host и вся extension collection ещё не перенесены: [матрица паритета](terminal-parity.md) отделяет выполненное от оставшегося.
