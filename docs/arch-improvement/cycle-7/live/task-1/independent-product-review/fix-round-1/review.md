# Продуктовое ревью: Независимое черное-ящичное ревью Native Fix Round 1 Candidate

**Дата проверки:** 2026-11-05  
**Статус шлюза:** S9b Product Verify Gate (Fix Round 1)  
**Ревьюер:** Независимый продукт-ревьюер (Black-Box Synthetic User Testing)  
**Репозиторий:** `durable-zero`  
**Скоуп:** `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-1/`  

---

## 1. Идентификация и верификация кандидата (Fix Round 1)

- **Новый корень кандидата:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-fix-round-1`
- **Candidate CLI Binary:** `packages/cli/bin/durable-zero.js` (parent-verified bytes equal source `1298b479`)
- **Compiled Runner Artifact:** `packages/runner/dist/main.js` beneath candidate root
- **Independently Computed Runner SHA256:**  
  `090b6c898bd8931b072e26eb4e18e18a06e5b26dcd75ea543be7bd954858fee0`  
  *(Exact match with specified expected hash)*
- **SDK Pinned Baseline:** Pi 1.5 (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`)
- **Изоляция окружения:** Полностью изолированные временные директории:
  - `HOME`: `/var/folders/.../home`
  - `XDG_DATA_HOME`: `/var/folders/.../xdg`
  - `CWD`: `/var/folders/.../work`
  - `GATE_DIR`: `/var/folders/.../gate`
- **Правило изоляции:** Ревью проведено строго как внешний вызывающий агент (black-box). Исходные коды приложения (`packages/*/src/`), мапы, дифы и внутренние тесты авторов не читались и не модифицировались. Тестировался исключительно скомпилированный продакшн-артефакт.

---

## 2. Прохождение тестовых сценариев (11 из 11 PASSED)

### Journey 1: Happy Path & Reasoning+Text Multi-Block Streaming

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **1.1** | Холодный запуск процесса и handshake готовности `session/getState` | Вывод в stdout строго JSON-RPC 2.0; статус готов, `entryCount: 0`, зарегистрирована модель `echo` | `sessionId: "session-fixround1-canary"`, `entryCount: 0`, модель доступна, 100% строк в stdout валидны JSON-RPC 2.0 | **PASS** |
| **1.2** | Многоблочный стриминг (reasoning + text) с управляемым барьером | Канонический `contentIndex: 0` для thinking, `contentIndex: 1` для text; получение дельты ДО завершения модели | Получен `thinking_delta` (`contentIndex: 0`), затем `text_delta` (`contentIndex: 1`, `"Echo: Verify multi-block F"`). Барьер подтвердил: дельта получена при удерживаемом завершении. После разблокировки получен `turn_complete` с коррелированным `requestId: "9"`. В транскрипте сохранены user (id `8`) и assistant (id `12`). SubmissionId (`9`) отличается от EntryId (`8`, `12`). | **PASS** |
| **1.3** | Второй промпт в ТОМ ЖЕ процессе (`PrefixShared-Turn2-fixround1`) | Отсутствие утечек состояния предыдущей генерации, реплеев или потери дельт; отдельный второй ответ | Admission `id: "14"`. Ответ `"Echo: PrefixShared-Turn2-fixround1"`. В транскрипте сохранены оба раунда диалога (entries `8`, `11`, `12`, `13`, `16`) с уникальными непротиворечивыми ID. | **PASS** |

### Journey 2: Cold-Start & Multi-Process Session Persistence

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **2.1** | Остановка Процесса 1 сигналом `SIGTERM` | Корректный graceful shutdown с кодом выхода 0 без зависания процессов | Процесс 1 завершился с exit code `0`, `signal: null`. Подтверждено чистое завершение ОС-процесса. | **PASS** |
| **2.2** | Повторный запуск того же `--session` во ВТОРОМ независимом ОС-процессе | Восстановление сессии из SQLite; совпадение идентификаторов и текстов исторических записей | Процесс 2 успешно стартовал, выполнил `session/getState` (`entryCount: 5`). В `session/getTranscript` записи Раунда 1 (user `8`, assistant `12`) и Раунда 2 (user `13`, assistant `16`) имеют 100% идентичные ID и текст. | **PASS** |
| **2.3** | Третий промпт в возобновленном Процессе 2 (`Prompt3-post-restart-gamma`) | Корректное добавление третьего хода в существующую сессию | Admission `id: "18"`, ответ `"Echo: Prompt3-post-restart-gamma"`, транскрипт содержит 3 хода (user `17`, assistant `20`), Процесс 2 завершен по SIGTERM с кодом 0. | **PASS** |

### Journey 3: Error Recovery & Adversarial Operator

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **3.1** | Передача битого/невалидного JSON в stdin | Ответ с ошибкой JSON-RPC `-32700 Parse error`; сервер не падает и продолжает обслуживание | Получен `{"error": {"code": -32700, "message": "Parse error"}}`. Сервер остался активен и успешно ответил на последующий `session/getState`. | **PASS** |
| **3.2** | Вызов неизвестного метода RPC (`unsupported/method`) | Ответ `-32601 Method not found`; сервер не падает | Получен `{"error": {"code": -32601, "message": "Method not found: unsupported/method"}}`. | **PASS** |
| **3.3** | Обрыв процесса сервера (SIGKILL) во время выполнения in-flight запроса | Клиентский харнесс корректно отбрасывает (rejects) повисшие запросы без вечного ожидания и зависания | Промис ожидания ответа на `session/prompt` был немедленно отклонен клиентом с `Child exited with code null signal SIGKILL while request id=1 was pending`. Зависших таймеров и дескрипторов в клиенте не осталось. | **PASS** |

### Journey 4: Lifetime Bug Fix & Turn Abort (Специфика Fix Round 1)

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **4.1** | Закрытие stdin (EOF) на готовом сервере | Сервер корректно обнаруживает EOF и завершается с exit code 0 за ограниченное время (проверка фикса бага жизненного цикла) | По отправке EOF (`child.stdin.end()`) сервер чисто завершился за **11 ms** с кодом выхода **0** (`signal: null`). | **PASS** |
| **4.2** | Прерывание активного хода `session/abort` и продолжение работы в той же сессии | Прерывание активного хода, эмиссия событий `turn_complete (status=aborted)` и `session/aborted`, и возможность выполнить следующий промпт без рестарта сервера | При вызове `session/abort` во время активного стриминга сервер вернул результат `null`, испустил `turn_complete` с `status: "aborted"` и событие `session/aborted`. Следующий промпт в той же сессии (`"Turn 2 executed after abort"`) был принят (id `15`), успешно завершен со статусом `completed`, и оба хода зафиксированы в транскрипте. | **PASS** |

---

## 3. Квалификация границ отчета (Scope & Qualification)

Данное ревью является **строго черным-ящичным (black-box) продуктовым тестированием внешнего контракта** скомпилированного бинарника `durable-zero serve`.

**Квалификационные разграничения:**
1. **Не является аудитом исходного кода (Not a Source-Level Audit):**
   - Продуктовый ревьюер не инспектировал исходные файлы TypeScript, конструкторы классов, бюджеты строк или внутренние интерфейсы `packages/*/src/`.
   - Проверка не отменяет и не перекрывает результаты параллельного source review (где оценивается внутренняя архитектура и устранение замечаний).
   - Подтверждена исключительно внешняя работоспособность цепочки CLI `serve` -> stdio RPC -> потоковая многоблочная выдача -> сохранение в SQLite -> рестарт -> EOF shutdown -> прерывание хода `session/abort`.
2. **Только наблюдаемые результаты персистентности:**
   - Внутренние механизмы SQLite (WAL-flush, синхронизация страниц памяти, чекпоинты) напрямую не профилировались и не инспектировались.
   - Зафиксирован строго наблюдаемый внешний факт: процессы завершаются с exit code `0`, а запущенный следом новый ОС-процесс успешно восстанавливает историю сессии с сохранением идентичных строковых ID и содержимого сообщений.
3. **Поведение клиентского харнесса при сбоях (Case 3.3):**
   - Кейс 3.3 подтверждает отказоустойчивость клиентской очереди запросов (consumer RPC client reject upon child exit), исключая утечки висячих промисов при краше процесса.
4. **Префиксы и генерация (Case 1.3):**
   - Все ответы модели имеют общий префикс провайдера `"Echo: "`. Проверка подтверждает, что при последовательных промптах в одном процессе состояние генератора очищается, дельты не подмешиваются из предыдущего хода, и суффикс промпта отражается строго в соответствующем ответе.

---

## 4. Находки (Findings)

- **Внешние поведенческие дефекты (P0/P1/P2):** None (все 11 синтетических black-box сценариев завершились со статусом `PASSED`).
- **Замечания к фиксу Fix Round 1:** 
  - Фикс завершения по stdin EOF (Case 4.1) полностью подтвержден: сервер не зависает, выходит за 11 ms с кодом 0.
  - Поддержка прерывания `session/abort` (Case 4.2) подтверждена: сессия остается живой, ход прерывается, последующий промпт выполняется штатно.
  - Многоблочный reasoning + text стриминг (Case 1.2) подтвержден с каноническим разделением `contentIndex: 0` (thinking) и `contentIndex: 1` (text).

---

## 5. Артефакты проверки Fix Round 1

Все артефакты сохранены в директории `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/fix-round-1/`:
- `test-suite.mjs` — независимый исполняемый тестовый сценарий (11 проверок).
- `fixtures/gated-reasoning-provider-extension.mjs` — внешнее расширение провайдера модели с поддержкой reasoning, text, барьера и корректной обработки прерывания.
- `wire-observations.jsonl` — полный журнал событий на wire-уровне со всеми входящими/исходящими конвертами и временными метками.
- `test-execution.log` — полный консольный вывод прогона тестов.
- `test-report.junit.xml` — стандартизированный отчет JUnit XML для CI/CD (11 tests, 0 failures).
- `findings.json` — машиночитаемый вердикт и структурированные результаты.
- `review.md` — детальное продуктовое ревью по Fix Round 1.

---

## 6. Итоговый вердикт

```
Product Walking-Path Verification (Fix Round 1):
- Minimal Native Walking Path: PASS
- Multi-Block Streaming (reasoning + text, contentIndex 0/1): PASS
- External Gated Streaming Proof: PASS (первый wire-чанк подтвержден до завершения модели)
- Ready-Server Stdin EOF Clean Exit (Exit Code 0 <= 5s): PASS (11 ms)
- Active Turn Abort & Subsequent Prompt Recovery (session/abort): PASS
- Multi-Process Restart & Exact Transcript Persistence: PASS
- Error Protocol Conformance: PASS (-32700, -32601)
- Source Architecture Audit: DEFERRED TO SOURCE REVIEW (не оценивалось в black-box контуре)

VERDICT: PASS (Qualified to Observed Native Walking Path on Fix Round 1 Candidate)
```
