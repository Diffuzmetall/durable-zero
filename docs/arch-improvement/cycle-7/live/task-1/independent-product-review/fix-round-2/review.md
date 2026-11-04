# Продуктовое ревью: Независимое черное-ящичное ревью Native Fix Round 2 Candidate

**Дата проверки:** 2026-11-05  
**Статус шлюза:** S9b Product Verify Gate (Fix Round 2 Closure)  
**Ревьюер:** Независимый продукт-ревьюер (Black-Box Synthetic User Testing)  
**Репозиторий:** `durable-zero`  
**Скоуп:** `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-2/`  

---

## 1. Идентификация и верификация кандидата (Fix Round 2)

- **Корень кандидата Fix Round 2:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-2`
- **Frozen Source SHA:** `ad99873e`
- **Candidate CLI Binary:** `packages/cli/bin/durable-zero.js` (parent-verified frozen bytes)
- **Compiled Runner Artifact:** `packages/runner/dist/main.js` beneath candidate root
- **Independently Computed Runner SHA256:**  
  `76ec126543cc131986cdc12246f8fdd0a35a596d62c6a7a235ff9c0857f1b05c`  
  *(Exact match with specified expected hash)*
- **Преемственность артефактов:** Артефакты и свидетельства предыдущих проверок (`fc090` 9-case PASS и `fix-round-1` 11-case PASS) сохранены без изменений в соответствующих каталогах.
- **SDK Pinned Baseline:** Pi 1.5 (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`)
- **Изоляция окружения:** Полностью изолированные временные директории:
  - `HOME`: `/var/folders/.../home`
  - `XDG_DATA_HOME`: `/var/folders/.../xdg`
  - `CWD`: `/var/folders/.../work`
  - `GATE_DIR`: `/var/folders/.../gate`
- **Правило изоляции:** Продуктовый ревьюер взаимодействовал с системой исключительно как внешний потребитель (black-box) через публичный интерфейс CLI `serve`. Исходный код приложения, мапы, дифы и внутренние тесты авторов не исследовались.

---

## 2. Результаты исполнения 11 тестовых сценариев (11 из 11 PASSED)

### Journey 1: Happy Path & Reasoning+Text Multi-Block Streaming

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **1.1** | Холодный запуск процесса и handshake готовности `session/getState` | Вывод в stdout строго JSON-RPC 2.0; статус готов, `entryCount: 0`, зарегистрирована модель `echo` | `sessionId: "session-fixround2-canary"`, `entryCount: 0`, модель доступна, 100% строк в stdout валидны JSON-RPC 2.0 (890 ms). | **PASS** |
| **1.2** | Многоблочный стриминг (reasoning + text) с управляемым барьером | Канонический `contentIndex: 0` для thinking, `contentIndex: 1` для text; получение дельты ДО завершения модели | Получен `thinking_delta` (`contentIndex: 0`), затем `text_delta` (`contentIndex: 1`, `"Echo: Verify multi-block F"`). Барьер подтвердил: дельта получена при удерживаемом завершении. После разблокировки получен `turn_complete` с `requestId: "9"`. В транскрипте сохранены user (id `8`) и assistant (id `12`). SubmissionId (`9`) отличается от EntryId (`8`, `12`). | **PASS** |
| **1.3** | Второй промпт в ТОМ ЖЕ процессе (`PrefixShared-Turn2-fixround2`) | Отсутствие утечек состояния предыдущей генерации, реплеев или потери дельт; отдельный второй ответ | Admission `id: "14"`. Ответ `"Echo: PrefixShared-Turn2-fixround2"`. В транскрипте сохранены оба раунда диалога (entries `8`, `11`, `12`, `13`, `16`) с уникальными непротиворечивыми ID. | **PASS** |

### Journey 2: Cold-Start & Multi-Process Session Persistence

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **2.1** | Остановка Процесса 1 сигналом `SIGTERM` | Корректный graceful shutdown с кодом выхода 0 без зависания процессов | Процесс 1 завершился с exit code `0`, `signal: null` (14 ms). Подтверждено чистое завершение ОС-процесса. | **PASS** |
| **2.2** | Повторный запуск того же `--session` во ВТОРОМ независимом ОС-процессе | Восстановление сессии из SQLite; совпадение идентификаторов и текстов исторических записей | Процесс 2 успешно стартовал, выполнил `session/getState` (`entryCount: 5`). В `session/getTranscript` записи Раунда 1 (user `8`, assistant `12`) и Раунда 2 (user `13`, assistant `16`) имеют 100% идентичные ID и текст. | **PASS** |
| **2.3** | Третий промпт в возобновленном Процессе 2 (`Prompt3-post-restart-fixround2`) | Корректное добавление третьего хода в существующую сессию | Admission `id: "18"`, ответ `"Echo: Prompt3-post-restart-fixround2"`, транскрипт содержит 3 хода (user `17`, assistant `20`), Процесс 2 завершен по SIGTERM с кодом 0. | **PASS** |

### Journey 3: Error Recovery & Adversarial Operator

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **3.1** | Передача битого/невалидного JSON в stdin | Ответ с ошибкой JSON-RPC `-32700 Parse error`; сервер не падает и продолжает обслуживание | Получен `{"error": {"code": -32700, "message": "Parse error"}}`. Сервер остался активен и успешно ответил на последующий `session/getState`. | **PASS** |
| **3.2** | Вызов неизвестного метода RPC (`unsupported/method`) | Ответ `-32601 Method not found`; сервер не падает | Получен `{"error": {"code": -32601, "message": "Method not found: unsupported/method"}}`. | **PASS** |
| **3.3** | Обрыв процесса сервера (SIGKILL) во время выполнения in-flight запроса | Клиентский харнесс корректно отбрасывает (rejects) повисшие запросы без вечного ожидания и зависания | Промис ожидания ответа на `session/prompt` был немедленно отклонен клиентом с `Child exited with code null signal SIGKILL while request id=1 was pending`. Зависших таймеров и дескрипторов в клиенте не осталось. | **PASS** |

### Journey 4: Lifetime Bug Fix & Turn Abort

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **4.1** | Закрытие stdin (EOF) на готовом сервере | Сервер корректно обнаруживает EOF и завершается с exit code 0 за ограниченное время | По отправке EOF (`child.stdin.end()`) сервер чисто завершился за **6 ms** с кодом выхода **0** (`signal: null`). | **PASS** |
| **4.2** | Прерывание активного хода `session/abort` и продолжение работы в той же сессии | Прерывание активного хода, эмиссия событий `turn_complete (status=aborted)` и `session/aborted`, и возможность выполнить следующий промпт без рестарта сервера | Сервер вернул `result: null`, испустил `turn_complete` с `status: "aborted"` и событие `session/aborted`. Следующий промпт в той же сессии (`"Turn 2 executed after abort"`) был принят (id `15`), успешно завершен со статусом `completed`, и оба хода зафиксированы в транскрипте. | **PASS** |

---

## 3. Квалификация границ отчета и разграничение контуров (Scope & Boundaries)

1. **Разграничение с Source Review (R2 PASS):**
   - Внутренние механизмы дочерних процессов, жизненный цикл per-block catchup и устранение финального дефекта child final-tail были отдельно исследованы и подтверждены в контуре source review.
   - Черное-ящичное продуктовое ревью не выдумывает приватных интерфейсов управления дочерними процессами и не заявляет прямого покрытия внутренних структур дочерних агентов через root-only CLI.
   - Продуктовое ревью подтверждает дееспособность внешнего публичного контракта: stdio JSON-RPC, стриминг дельт, устойчивость к ошибкам, завершение по EOF и прерывание сеанса через `session/abort`.
2. **Только наблюдаемая персистентность (No unmeasured DB claims):**
   - Внутренние механизмы SQLite (WAL-flush, синхронизация страниц памяти, чекпоинты) напрямую не профилировались и не инспектировались.
   - Подтвержден внешний наблюдаемый факт: процессы завершаются с exit code `0`, а запущенный следом новый ОС-процесс восстанавливает историю сессии с сохранением идентичных строковых ID и содержимого сообщений.
3. **Кейс 3.3 — отказоустойчивость клиентского харнесса:**
   - Подтверждает сброс клиентской очереди in-flight запросов при падении сервера, а не выживание сервера после SIGKILL.
4. **Общий префикс ответов модели (Кейс 1.3):**
   - Все ответы модели имеют общий префикс провайдера `"Echo: "`. Проверка подтвердила отсутствие перекрестного загрязнения дельт между последовательными запросами в рамках одного сеанса.

---

## 4. Находки (Findings)

- **Внешние поведенческие дефекты (P0/P1/P2):** None (все 11 синтетических black-box сценариев завершились со статусом `PASSED`).
- Все проверенные функциональные шлюзы закрыты с подтверждением реальными receipts.

---

## 5. Артефакты проверки Fix Round 2

Все артефакты сохранены в директории `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-2/`:
- `test-suite.mjs` — независимый исполняемый тестовый сценарий (11 поведенческих проверок).
- `fixtures/gated-reasoning-provider-extension.mjs` — внешнее расширение провайдера модели с поддержкой reasoning (блок 0), text (блок 1), барьера и корректной обработки прерывания.
- `wire-observations.jsonl` — полный хронологический журнал wire-сообщений.
- `test-execution.log` — лог консольного выполнения тестов.
- `test-report.junit.xml` — стандартизированный отчет JUnit XML для CI/CD (11 tests, 0 failures).
- `findings.json` — машиночитаемый вердикт и структурированные результаты.
- `review.md` — детальное продуктовое ревью по Fix Round 2.

---

## 6. Итоговый вердикт

```
Product Walking-Path Verification (Fix Round 2 Candidate):
- Minimal Native Walking Path: PASS
- Multi-Block Streaming (reasoning + text, contentIndex 0/1): PASS
- External Gated Streaming Proof: PASS (первый wire-чанк подтвержден до завершения модели)
- Ready-Server Stdin EOF Clean Exit (Exit Code 0 <= 5s): PASS (6 ms)
- Active Turn Abort & Subsequent Prompt Recovery (session/abort): PASS
- Multi-Process Restart & Exact Transcript Persistence: PASS
- Error Protocol Conformance: PASS (-32700, -32601)
- Source Architecture Audit: SEPARATELY VERIFIED IN SOURCE REVIEW R2 (PASS)

VERDICT: PASS (Qualified Native Walking Path Closure on Fix Round 2 Candidate)
```
