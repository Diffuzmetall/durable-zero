# Продуктовое ревью: Независимое черное-ящичное ревью Native Slice 0 Candidate

**Дата проверки:** 2026-11-05  
**Статус шлюза:** S9b Product Verify Gate  
**Ревьюер:** Независимый продукт-ревьюер (Black-Box Synthetic User Testing)  
**Репозиторий:** `durable-zero`  
**Скоуп:** `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/`  

---

## 1. Идентификация и верификация кандидата

- **Source Commit SHA:** `fc0909602e7969df080259a2e2d4a7114be450b8`
- **Candidate CLI Binary:** `/Users/vanya/Projects/durable-zero/docs/arch-improvement/cycle-7/live/task-1/native-candidate/packages/cli/bin/durable-zero.js`
- **Compiled Runner Artifact:** `packages/runner/dist/main.js` beneath native-candidate root
- **Independently Computed SHA256:**  
  `813931832b4f689713b67cafb3421f4a4fe328a7daa64259acf845f1572efff6`  
  *(Exact match with specified expected hash)*
- **SDK Pinned Baseline:** Pi 1.5 (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`)
- **Изоляция окружения:** Полностью изолированные временные директории:
  - `HOME`: `/var/folders/.../home`
  - `XDG_DATA_HOME`: `/var/folders/.../xdg`
  - `CWD`: `/var/folders/.../work`
  - `GATE_DIR`: `/var/folders/.../gate`
- **Командная строка продакшн-запуска:**
  ```bash
  node durable-zero.js serve \
    --no-global-extensions \
    --provider scripted-e2e \
    --model echo \
    --extension <path/to/gated-provider-extension.mjs> \
    --session session-product-review-canary
  ```
- **Правило изоляции:** Ревью проведено строго как внешний вызывающий агент (black-box). Исходные коды приложения (`packages/*/src/`), мапы, дифы и внутренние тесты не читались и не модифицировались. Тестировался исключительно скомпилированный продакшн-артефакт.

---

## 2. Прохождение трех Золотых Сценариев (The Three Golden Journeys)

### Journey 1: Happy Path (Основной сценарий ценности и потоковая передача)

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **1.1** | Холодный запуск процесса и рукопожатие готовности `session/getState` | Вывод в stdout строго JSON-RPC 2.0 (без текстового мусора), статус готов, `entryCount: 0`, зарегистрирована модель `echo` | `sessionId: "session-product-review-canary"`, `entryCount: 0`, модель `echo` доступна, 100% строк в stdout валидны JSON-RPC 2.0 | **PASS** |
| **1.2** | Отправка промпта с уникальным нонсом `session/prompt` (`Hello world Nonce-...`) | Прием задачи со статусом `accepted` и уникальным `id`. Первый чанк стриминга (`text_delta`) поступает клиенту ДО завершения модели | Admission `id: "9"`. Получен дельта-чанк `"Echo: Hello world Non"`. Файловый барьер подтвердил: провайдер модели удерживал завершение, `turn_complete` еще не наступал. После снятия барьера получен второй дельта-чанк `"ce-..."` и коррелированный `turn_complete` с `requestId: "9"`. В транскрипте сохранены user (id `8`) и assistant (id `12`). SubmissionId (`9`) отличается от EntryId (`8`, `12`). | **PASS** |
| **1.3** | Второй промпт в ТОМ ЖЕ процессе (`PrefixShared-Turn2-beta`) | Отсутствие утечек состояния предыдущей генерации, реплеев или потери дельт; отдельный второй ответ | Admission `id: "14"`. Получен точный ответ `"Echo: PrefixShared-Turn2-beta"` (с общим префиксом ответа `"Echo: "` и корректным продолжением текста промпта). В транскрипте сохранены оба раунда диалога (entries `8`, `11`, `12`, `13`, `16`) с уникальными непротиворечивыми ID без перекрестного наложения дельт. | **PASS** |

### Journey 2: Cold-Start / Empty State & Multi-Process Session Persistence

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **2.1** | Остановка Процесса 1 сигналом `SIGTERM` | Корректный graceful shutdown с кодом выхода 0 без зависания процессов | Процесс 1 завершился с exit code `0`, `signal: null`. Подтверждено чистое завершение ОС-процесса и корректное сохранение транскрипта при последующем рестарте. | **PASS** |
| **2.2** | Повторный запуск того же `--session` во ВТОРОМ независимом ОС-процессе | Восстановление сессии из SQLite; совпадение идентификаторов и текстов исторических записей | Процесс 2 успешно стартовал, выполнил `session/getState` (`entryCount: 5`). В `session/getTranscript` записи Раунда 1 (user `8`, assistant `12`) и Раунда 2 (user `13`, assistant `16`) имеют 100% идентичные ID и текст. | **PASS** |
| **2.3** | Третий промпт в возобновленном Процессе 2 (`Prompt3-post-restart-gamma`) | Корректное добавление третьего хода в существующую сессию | Admission `id: "18"`, ответ `"Echo: Prompt3-post-restart-gamma"`, транскрипт содержит 3 хода (user `17`, assistant `20`), Процесс 2 завершен по SIGTERM с кодом 0. | **PASS** |

### Journey 3: Error Recovery & Adversarial Operator (Ошибки и краевые состояния)

| Шаг | Действие | Ожидание | Фактический результат | Статус |
|---|---|---|---|---|
| **3.1** | Передача битого/невалидного JSON в stdin | Ответ с ошибкой JSON-RPC `-32700 Parse error`; сервер не падает и продолжает обслуживание | Получен `{"error": {"code": -32700, "message": "Parse error"}}`. Сервер остался активен и успешно ответил на последующий `session/getState`. | **PASS** |
| **3.2** | Вызов неизвестного метода RPC (`unsupported/method`) | Ответ `-32601 Method not found`; сервер не падает | Получен `{"error": {"code": -32601, "message": "Method not found: unsupported/method"}}`. | **PASS** |
| **3.3** | Обрыв процесса сервера (SIGKILL) во время выполнения in-flight запроса | Клиентский харнесс корректно отбрасывает (rejects) повисшие запросы без вечного ожидания и зависания | Промис ожидания ответа на `session/prompt` был немедленно отклонен клиентом с `Child exited with code null signal SIGKILL while request id=1 was pending`. Зависших таймеров и дескрипторов в клиенте не осталось. | **PASS** |

---

## 3. Область применимости и квалификация результатов (Scope & Qualification)

Данное ревью является **строго черным-ящичным (black-box) продуктовым тестированием внешнего контракта** скомпилированного бинарника `durable-zero serve`.

**Важные квалификационные разграничения:**
1. **Не является аудитом исходного кода (Not a Source-Level Audit):**
   - Продуктовый ревьюер не инспектировал исходные файлы TypeScript, конструкторы классов, бюджеты строк или внутренние интерфейсы `packages/*/src/`.
   - Проверка не отменяет и не перекрывает результаты параллельного source review (где были зафиксированы P1-дефекты декоративных зависимостей и несовершенства жизненного цикла).
   - Подтверждена исключительно внешняя работоспособность цепочки CLI `serve` -> stdio RPC -> потоковая выдача модели -> сохранение в SQLite -> рестарт.
2. **Только наблюдаемые результаты персистентности:**
   - Внутренние механизмы SQLite (WAL-flush, синхронизация страниц памяти, чекпоинты) напрямую не профилировались и не инспектировались.
   - Зафиксирован строго наблюдаемый внешний факт: процесс завершился с exit code `0`, а запущенный следом новый ОС-процесс успешно восстановил историю сессии с сохранением идентичных строковых ID и содержимого сообщений.
3. **Поведение клиентского харнесса при сбоях (Case 3.3):**
   - Кейс 3.3 подтверждает отказоустойчивость клиентской очереди запросов (consumer RPC client reject upon child exit), исключая утечки висячих промисов при краше процесса.
4. **Префиксы и генерация (Case 1.3):**
   - Все ответы модели имеют общий префикс провайдера `"Echo: "`. Проверка подтверждает, что при последовательных промптах в одном процессе состояние генератора очищается, дельты не подмешиваются из предыдущего хода, и суффикс промпта отражается строго в соответствующем ответе.

---

## 4. Находки (Findings)

- **Внешние поведенческие дефекты (P0/P1/P2):** None (все 9 синтетических black-box сценариев завершились со статусом `PASSED`).
- **Связь с source review:** Замечания к внутренней архитектуре и декоративным портам адресованы авторам в рамках исходного аудита кода. Наблюдаемый минимальный рабочий тракт (Walking Path) функционально дееспособен.

---

## 5. Артефакты проверки

Все артефакты сохранены в директории `docs/arch-improvement/cycle-7/live/task-1/independent-product-review/`:
- `test-suite.mjs` — независимый исполняемый тестовый сценарий (consumer test).
- `fixtures/gated-provider-extension.mjs` — внешнее расширение провайдера модели с поддержкой управляемого барьера на границе модели.
- `wire-observations.jsonl` — полный журнал событий на wire-уровне со всеми входящими/исходящими конвертами и временными метками.
- `test-execution.log` — полный консольный вывод прогона тестов.
- `test-report.junit.xml` — стандартизированный отчет JUnit XML для CI/CD.
- `findings.json` — машиночитаемый вердикт и структурированные результаты.

---

## 6. Итоговый вердикт

```
Product Walking-Path Verification:
- Minimal Native Walking Path (CLI serve, prompt, getState, getTranscript, multi-process SQLite persistence): PASS
- External Gated Streaming Proof: PASS (первый wire-чанк подтвержден до завершения модели)
- Error Protocol Conformance: PASS (-32700, -32601)
- Source Architecture Audit: DEFERRED TO SOURCE REVIEW (не оценивалось в black-box контуре)

VERDICT: PASS (Qualified to Observed Minimum Walking Path)
```
