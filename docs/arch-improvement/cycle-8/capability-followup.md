# Follow-up: навыки и отключённые панели

## Итог

Навыки подключены от штатного каталога Zero до native admission. Picker только вставляет команду; Enter отправляет её, Alt+Enter ставит native follow-up. Ошибка неизвестного или недоступного навыка не принимает новый prompt; после Esc из error dialog исходный ввод остаётся в редакторе.

Отключённые Attention/Automation-панели больше не показывают вводящие в заблуждение предупреждения, пустые requests, Goal-строку и schedule/goal badges. Настоящие runtime notices и ошибки не скрываются. Attention, Goal и schedules **не реализованы в этом кандидате** и отложены по согласованию.

Разбор хоста, терминала, пакетов, сборки и состава PR: [architecture-and-packaging.md](architecture-and-packaging.md).

## Что изменилось

- Runner экспортирует read-only facade уже существующих skills/settings; второй resource loader не создаётся.
- Runtime передаёт ресурсные metadata отдельно от native view. Общий RPC ingress раскрывает `/skill:…` до native admission; приватный expander SDK не импортируется.
- Клиент проверяет metadata и сохраняет их при обновлении снимков и disconnect. UI использует каталог вместо жёстко заданного пустого списка.
- Explicit skill command проходит через обычный Enter, а не отвергается как неизвестная slash command.
- Presentation-адаптация и хеш TUI записаны в `PROVENANCE.json`; лицензии и 49 provenance records сохранены.

## Проверенный кандидат

```text
Build:
/tmp/pi-zero-capabilities-20261106T0642

Standalone install:
/home/ubuntu/.local/share/pi-durable-zero/candidates/20261106T0642-capabilities

Installed rich-acceptance evidence:
/tmp/zero-capabilities-installed-dtk84rjs
```

Окружение: Node `24.19.0`, pnpm `11.25.0`. Новый prefix установлен отдельно. Исправлена одна воспроизведённая pnpm legacy self-link; 459 ссылок существуют и разрешаются внутри prefix. Хеши восьми установленных entrypoints совпали с build candidate. Все 49 UI-файлов и объявленная replacement прошли проверку хешей.

Манифест: [capabilities-installation.json](evidence/capabilities-installation.json). Install scripts `@google/genai` и `protobufjs` запрещены только в скопированной candidate-конфигурации; существующее разрешение esbuild сохранено. Source workspace configuration не изменена.

## Свежие проверки

| Проверка | Результат | Доказательство |
| --- | --- | --- |
| Сборка Zero + локальных executable-пакетов | PASS | [build log](evidence/capabilities-build.log) |
| Production typecheck всех `packages/*/src/**/*.ts` | PASS внутри build script | [build log](evidence/capabilities-build.log) |
| Focused/native/UI/adapter regressions | **50/50**, без skipped | [test log](evidence/capabilities-tests.log) |
| Реальный rich TTY установленного кандидата | **13/13** | [installed log](evidence/capabilities-installed.log), [manifest](evidence/capabilities-installation.json) |
| Замкнутость установленного dependency tree | **459**, external/broken = **0** | [manifest](evidence/capabilities-installation.json) |
| Идентичность executable/runner/adapter bytes | **8/8** | [SHA-256](evidence/capabilities-installation.json) |
| Presentation provenance | **49/49** + replacement | [manifest](evidence/capabilities-installation.json) |

50 regression-проверок включают native Harness, Bash, abort, повторное открытие, перезапуск и SIGKILL recovery; очереди/backpressure; native resource catalogue и раскрытие skills; malformed/unknown/unreadable skill rejection; клиентские ревизии и адресацию; отображение и picker. Это scoped regression suite, не весь test suite репозитория.

13 installed-проверок прошли через настоящие PTY stdin/stdout, полноценный UI, приватный Unix-сокет, native Harness и SQLite:

1. Самостоятельность dependency tree.
2. Provider fixture находится внутри установленного prefix.
3. Native-каталог содержит тестовый навык и включённые команды.
4. Rich UI действительно использует PTY, а не readline probe.
5. Предупреждения отключённых панелей отсутствуют.
6. Выбор навыка не создаёт user entry.
7. Enter передаёт в native transcript skill body и аргументы.
8. Unknown skill не принимается; черновик возвращается после закрытия error dialog.
9. Alt+Enter во время активного turn доставляет раскрытый native follow-up.
10. Bash действительно активен непосредственно перед disconnect.
11. Закрытие терминала оставляет runtime живым.
12. Bash записывает marker после disconnect при отсутствии всех клиентов и наблюдателей.
13. Повторное подключение восстанавливает историю без повторного admission.

Проверки используют deterministic provider вместо внешней модели. **Harness, tools, Bash, SQLite и терминал настоящие.** Прежний успешный запрос к `gpt-6.1-sol` в Rex относится к предыдущему кандидату; за новый live-provider тест он не выдаётся.

Первые два запуска нового Python-driver выявили неверные предположения самого driver: не у всех transcript entries есть `role`, а черновик скрыт за error dialog до Esc. Driver исправлен; результаты выше относятся к полному успешному запуску. Изменений runtime для обхода этих проверок не потребовалось.

## Воспроизведение и экраны

- [Повторяемый installed driver](evidence/capabilities-installed-check.py) и [команда запуска](architecture-and-packaging.md#7-получить-самостоятельную-установленную-сборку).
- [Стартовый экран](evidence/capabilities-01-startup.txt).
- [Раскрытый навык и ответ](evidence/capabilities-02-skill-completed.txt).
- [Настоящая ошибка](evidence/capabilities-03-error-dialog.txt) и [восстановленный черновик](evidence/capabilities-03-error-and-draft.txt).
- [Native follow-up](evidence/capabilities-04-followup.txt).
- [История после подключения](evidence/capabilities-05-reconnected.txt).

## Что остаётся за границей результата

- Основная команда `pi-durable`, прежний Host service и пользовательские сессии не заменены.
- Открытая ранее вкладка Rex продолжает использовать предыдущий candidate. Её ввод и процесс не трогались.
- Совместная пользовательская приёмка нового кандидата и глобальное переключение ещё не выполнены.
- Hot reload ресурсов, полная коллекция расширений, Attention/supervisor, Goal/schedules, BB и iii не входят в проверенный набор.
- Child-targeting проверяется scoped adapter/client regressions и общим RPC ingress. Новый installed driver не создаёт отдельного child-сеанса и не доказывает end-to-end subagent UI.
- Commit, push, npm publication и создание PR не выполнялись. Документ описывает их состав, но не выдаёт разрешение на публикацию.
