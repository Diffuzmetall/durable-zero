# Паритет текущего Durable и Zero: поведение, а не число каталогов

## Вывод

Сохранённый терминальный интерфейс уже работает на Zero. Переписывать редактор, темы, layout, tool cards и MCP manager не нужно. Но одинаковый интерфейс ещё не означает одинаковые возможности Host: history tools, automation, memory, tracing, provider operations и другие сервисы текущего Durable пока не подключены к новой сборке.

Перенос охватывает все нужные возможности **текущего native Durable**, а не только 31 каталог donor-коллекции. Classic Pi settings служат дополнительным списком для сверки. Они не доказывают, что каждый настроенный пакет активен в текущем native Host, и не дают разрешения включать отключённые интеграции.

## С чем сравнивали

- Текущий launcher: `~/.local/bin/pi-durable`, release `delivery-recovery-terminal-20261101`.
- Сохранённый renderer: `dpi-terminal-adapter/dist/ui/experimental/durable/tui.js` внутри этого release. Новый renderer находится в `packages/terminal-ui/vendor/experimental/durable/tui.js`.
- Активная сборка прежнего Host: overlay `~/.local/share/pi-durable-host/extensions/delivery-recovery/20261101/base-profile.mjs`; native source — `pi-durable-host/apps/dpi-backend/src/native-profile/profile.ts`.
- Проверенная новая сборка: [кандидат и результаты](session-commands-and-delivery.md). Сравнение файлов старой установки не считается повторным тестом живых внешних сервисов.

## Матрица

| Возможность текущего Durable | Состояние в Zero | Решение / доказательство |
| --- | --- | --- |
| Rich editor, layout, assets тем, сообщения, tool cards | Переиспользованы | 49 provenance records; installed PTY. Не писать второй renderer. Точный перенос пользовательских presentation settings ещё не доказан. |
| `/new`, `/clear` | Исправлены | Host создаёт отдельную сессию; UI только возвращает выбор. Installed `/new` сохраняет работу прежнего runtime; `/clear` проверен renderer-тестом. |
| `/name NAME` | Исправлен | Имя хранится отдельно от native ID, переживает reconnect/restart. Installed PTY и native regression. Новый предел — 120 символов с отказом на control characters; прежний Host обрезал до 100. Это не полное побайтовое совпадение валидации. |
| `/resume` | Исправлен | Существующий picker получает host catalog; resume возвращает прежний PID и transcript без нового prompt. Installed проверяет выбор и отмену. |
| `/quit`, `/detach`, reconnect | Работают в проверенном контуре | Клиент отсоединяется, native work продолжается. Не превращать quit в закрытие Harness. |
| `/model`, thinking, compact, abort, tasks/agents | Native boundary уже есть | Scoped source/native tests; abort и Bash проверены installed. Полный live smoke каждого picker/compact здесь не выполнен. |
| Skills, autocomplete, `/skill:`, Enter/Alt+Enter | Работают в проверенном контуре | 13 installed baseline checks: insertion-only picker, expansion, rejection, follow-up, reconnect. |
| Пользовательская theme/autocomplete/terminal configuration | Неполный паритет | `local-terminal/src/main.ts` пока задаёт `getThemeSetting: undefined`, autocomplete limit 10 и пустые terminal overrides. Нужен read-only presentation settings adapter к действующему owner, не отдельный config store. |
| `/mcp`, tools/exposure, reconnect, disable/enable, resize | Переиспользован оригинальный Pi MCP manager | 24 installed checks на собственном peer. Это не Nico и не полная совместимость его конфигурации/OAuth store. |
| `/reload` | Есть host-managed reload | Повторная сборка существующего runtime при idle; отказ при active work/открытом MCP menu. Installed проверяет PID, revision и повторное подключение peer. |
| CodeMode | Уже есть Zero adapter | Installed native MCP вызов и scoped adapter tests. Старый `codemode` пакет не переносить вторым владельцем. |
| Native file/Bash tools | Есть Zero/native owner | Installed Bash и native regression. Сохранить фактическую execution boundary, не оборачивать её вторым executor. |
| Native children и activity projection | Частичный паритет | Zero имеет собственных children; projection сохраняет native key/name/role/task/report. Rich multicast, supervisor, recovery и все permissions прежнего Host ещё не аттестованы. |
| Search history | Не перенесён | Первый отдельный capability package; использовать существующую conversation/entries, не вторую history DB. |
| MCP guidance | Не перенесён | Строить из реальной native MCP visibility; не добавлять MCP client. |
| Web search/fetch/batch, Context7 | Не перенесены | Переиспользовать tool implementations через отдельные packages и явные credential/output ports; live checks отдельно. |
| Codex/Antigravity operations, image artifacts, voice | Не перенесены | Сохранять provider/auth/artifact owners. Разделить transport, tool API и terminal recording. |
| DCG, внешние каталоги, input/admission policy | Полный паритет не доказан | В прежнем Host есть отдельные guards и `ExternalDirectories`, не только extension catalogs. Проверить все реальные пути выполнения; не включать отключённый classic guard. |
| Agent Mail identity, reservations, watcher lifecycle | Не перенесены полностью | Существующая identity/admission и adapter ownership; без автоматического создания identity. |
| Goal, schedules, triggers, automation footer | Не перенесены | Переиспользовать native task/admission/recovery; не создавать второй task loop или scheduler. |
| Hindsight, Langfuse | Не перенесены | Нужны проверенные native lifecycle, scope, drain/flush/close и отсутствие дублирующих pipelines. |
| Attention/dialogues, произвольные extension slash commands | Нет общей подтверждённой UI-совместимости | `/mcp` — конкретный adapter. Его успех не доказывает поддержку всех ExtensionAPI UI/context methods. |
| BB, iii, Herdr и operational recovery | Отложенные host adapters | Сохранить границы. Не запускать и не переносить пользовательские сессии в первом terminal-срезе. |

Полная очередь donor-компонентов — [extension-migration-plan.md](extension-migration-plan.md). Дополнительные classic sources и явные исключения — [classic-extension-scope.md](classic-extension-scope.md).

## Как переносить без привязки к одному Host

Применяем dependency rule из Clean Architecture: интерфейс принадлежит потребителю политики, конкретный adapter и wiring — внешней сборке. Отдельный npm/workspace package сам по себе этого не обеспечивает.

1. **Capability package** содержит логику и только нужные ей ports. Например, history получает чтение своей conversation; web получает credential resolver и разрешённый output root. Не создавать универсальный `HostServices` со всеми внутренностями Host.
2. **Native adapter** связывает capability с публичными Registry/ExtensionAPI/ExecutionEnvironment. Native Durable extension, classic Pi module и Zero `BuiltinExtension` — разные contracts; совпадение слова extension не делает их взаимозаменяемыми.
3. **Host assembly** выбирает реализации, credentials, visibility, storage paths и lifecycle. Новый Host меняет этот wiring и adapters, а не бизнес-логику пакета.
4. **Presentation package** читает view и отправляет намерения через controller. Он не открывает Harness, БД или MCP connection. Текущие `TerminalController`/`TerminalViewSource` уже дают такую границу для renderer.

Для первых native packages в публичном Zero composition input пока отсутствует передача дополнительных builtins. Это интерфейсный пробел, не дефект ядра. Перед его изменением нужны конкретный consumer, объяснение узкой границы и проверки default assembly, duplicate IDs, failure cleanup и installed loading. Копировать composition или private internals вместо этого нельзя.

## Идемпотентность и владельцы

Идемпотентность здесь означает наблюдаемое поведение, а не только `Set` в register:

- Повторная activation/refresh не удваивает tools, prompt sections и handlers; явные disable/hidden состояния сохраняются.
- Reload закрывает ресурсы прежнего экземпляра до активации нового; disconnect терминала не закрывает runtime-owned ресурсы.
- Каждый process/subscription/task имеет владельца и проверяемый teardown. Сбой открытия не оставляет частично активированный пакет.
- Повторное подключение не отправляет prompt заново и не создаёт второй Harness для той же сессии.
- Lifecycle проверяется на установленном artifact, а не только unit import. Сетевым/provider пакетам дополнительно нужен разрешённый настоящий endpoint.

Новые session commands соблюдают разделение UI/Host/native execution. `session/create` использует request UUID для повторного запроса к тому же runtime; host admission сериализован. Это не обещание distributed exactly-once при конкурирующих runtime или сбое filesystem посреди записи metadata.

## Порядок продолжения

Сначала поставить проверенные terminal/session/MCP исправления commits в существующий PR № 3. Затем переносить отдельные capabilities по очереди, начиная с history и guidance, с отдельным installed artifact и commit каждого пакета. Новая migration branch, полный legacy `local-host`, пользовательские DB migration и замена основной команды не нужны.

Этот отчёт не закрывает весь перенос: capability packages из незакрытых строк ещё предстоит реализовать и проверить. Скрывать эти пробелы за одинаковым видом терминала нельзя.
