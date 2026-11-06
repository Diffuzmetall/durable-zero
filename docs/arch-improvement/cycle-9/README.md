# Cycle 9: паритет терминала и поочерёдный перенос Durable capabilities

Статус: **session commands исправлены и проверены в отдельной установленной сборке; новые extension packages ещё не перенесены**.

- [Матрица фактического паритета и replaceable host boundaries](terminal-parity.md).
- [Исправления `/new`, `/name`, `/resume`, установленный кандидат и evidence](session-commands-and-delivery.md).
- [Очередь 31 donor-компонента, зависимости и условия поставки](extension-migration-plan.md).
- [Дополнительный контур: classic Pi sources и локальные extensions](classic-extension-scope.md).
- [Полные source-review reports, dispositions и границы проверки](evidence/review-dispositions.md).
- [Предыдущая terminal/runtime основа — Cycle 8](../cycle-8/README.md).

Перенос сохраняет все нужные возможности текущего native Durable, а не только число donor-каталогов. Существующие editor, layout, themes, tool cards, native CodeMode и оригинальный Pi MCP переиспользуются; второй Host/model loop не создаётся.

Порядок пользователя: адаптировать → протестировать → упаковать → проверить установленный пакет → отдельный commit/push каждого пакета. Пакеты остаются в этом workspace. Доставка согласована в **существующий PR № 3**, `fork/feat/zero-terminal-runtime`; отдельная migration branch и npm publication не нужны.

Финальный candidate d: 79/79 scoped tests, 48/48 installed checks; exact source/artifact identity — в отчёте поставки. Cycle 8 уже доставлен commit `2147e8d7b7109a7debe663c4b27900bed94bbcda`; этот срез добавляет отдельную поставку Cycle 9.

Следующие capability candidates: `search-history`, `mcp-guidance`, `context7`; их перенос не объявляется выполненным этим срезом. Основная команда `pi-durable`, пользовательские сессии и существующие сервисы не заменяются.
