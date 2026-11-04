# -*- coding: utf-8 -*-
"""Read-only architecture evidence renderer. Does not touch product sources."""
import os, json, html, re, subprocess, hashlib
from pathlib import Path
from datetime import datetime

# Source-relative path resolution: no dependency on BB_THREAD_STORAGE
P = Path(__file__).resolve().parent
R = P.parents[3]

S = json.loads((P / 'architecture-map-source-snapshot.json').read_text())
M = json.loads((P / 'architecture-map-migration-metrics.json').read_text())
C = json.loads((P / 'architecture-map-slice0-command-receipts.json').read_text())

def esc(x): return html.escape(str(x))
def source(path, needle, before=2, after=5):
    x = S['files'][path]
    lines = x['content'].splitlines()
    i = next(i for i, l in enumerate(lines) if needle in l)
    lo = max(0, i - before)
    hi = min(len(lines), i + after)
    return {
        'path': path,
        'from': lo + 1,
        'to': hi,
        'sha256': x['sha256'],
        'text': '\n'.join(f'{j+1:>4}  {lines[j]}' for j in range(lo, hi))
    }

findings = [
 {
   'id': 'fallback',
   'severity': 'P1',
   'title': 'В Core ещё есть синтетический accepted без engine',
   'evidence': [
     source('packages/core/src/session/coordinator.ts', 'engine?: IAgentEngine', 1, 4),
     source('packages/core/src/session/coordinator.ts', 'const id =', 4, 3)
   ],
   'impact': 'Стандартный assembly уже передаёт настоящий engine. Но публичный coordinator всё ещё допускает другой режим: принять prompt, придумать rec_… и ничего не исполнить. Старые unit-тесты этого пути могут оставаться зелёными. Это именно остаточная заглушка, а не доказательство исполнения.',
   'rule': 'AP-012 / AP-075 / AP-076; canonical plan: Assertion Integrity',
   'decision': 'Block acceptance while this production fallback exists; code remains owned by Slice 0. No new work launched.'
 },
 {
   'id': 'resources',
   'severity': 'P1',
   'title': 'Ресурсный адаптер создан, но не включён в DI-цепочку',
   'evidence': [
     source('packages/runner/src/composition.ts', 'const resourceExt', 1, 15)
   ],
   'impact': 'resourceExt создаётся, но его configProvider/resourceLoader не передаются в dependencies. Нативный loader может загрузить свои ресурсы по умолчанию — это не доказывает использование инжектированного адаптера. Нужна проверка, что подставленный ресурс реально меняет рабочий prompt/skills.',
   'rule': 'AP-074 / AP-076; canonical Dependency Assembly & Injection Boundaries',
   'decision': 'Block complete-DI acceptance until constructor → loader → native consumer trace and substitution are verified. No source edits in this assessment.'
 },
 {
   'id': 'stats',
   'severity': 'P2',
   'title': 'getStats пока возвращает константу вместо измерения',
   'evidence': [
     source('packages/adapter-pi-durable/src/engine/pi-durable-engine.ts', 'public async getStats', 0, 10)
   ],
   'impact': 'Метод есть, но tokens: null и contextWindow: 128000 не читаются из текущей модели или сессии. Его нельзя отмечать как сохранённую нативную метрику. Это незавершённая capability, даже если RPC отвечает успешно.',
   'rule': 'AP-012 / AP-026 / AP-076; preserve token metrics',
   'decision': 'Block full capability-parity acceptance; implement real metric or an explicit unavailable contract, never invented successful data.'
 },
 {
   'id': 'abort',
   'severity': 'P2',
   'title': 'После abort coordinator блокирует все следующие prompts',
   'evidence': [
     source('packages/core/src/session/coordinator.ts', 'if (this.isAborted)', 0, 4),
     source('packages/core/src/session/coordinator.ts', 'this.isAborted = true', 1, 7)
   ],
   'impact': 'Флаг isAborted проверяется до submit и не сбрасывается в start/prompt. Это наблюдаемое поведение исходников. Отдельный сценарий abort → новый prompt должен подтвердить требуемую семантику живой сессии; существующий happy-path этого не доказывает.',
   'rule': 'AP-021 / AP-028 / AP-076; lifecycle and capability preservation',
   'decision': 'Resolve lifecycle contract and verify abort/reuse before accepting session behavior. This is an unaccepted WIP finding, not a released-regression claim.'
 }
]

tasks = [
 {
   'task': '1 · Slice 0',
   'component': 'CLI → runner → Core → PiDurableEngine → native Harness',
   'status': 'В работе',
   'tone': 'warn',
   'proof': 'CLI переведён на runner/dist/main.js; реальный engine передан coordinator; runtime перенесён. Сборка проходила. Последний записанный E2E: таймаут, не PASS.',
   'remaining': 'Зелёный сквозной stream → settlement → SQLite → restart/readback; убрать обходную fake-admission ветку; независимая приёмка.',
   'permission': 'Разрешено'
 },
 {
   'task': '2A · часть Task 2',
   'component': 'IHostBridge + схемы + requester-адаптер',
   'status': 'Проверен компонент',
   'tone': 'good',
   'proof': '36 компонентных случаев; архитектурное ревью efc9eab — PASS в ограниченном scope. Исправлены kind override и качество RED-пруфа.',
   'remaining': 'Task 2 целиком: exports, composition, tools/register, actual model tool call → client result → continuation; убрать legacy globals.',
   'permission': 'Только 2A разрешён; полная интеграция отдельно'
 },
 {
   'task': '3 · Probe',
   'component': '--no-session, models/list без открытия сессии',
   'status': 'Остаётся',
   'tone': 'neutral',
   'proof': 'Продуктовой приёмки probe нет. Наличие модели в каталоге не доказывает отсутствие SQLite/lock side effects.',
   'remaining': 'Запуск с чистым временным каталогом; список моделей; ноль session DB, locks и watchers.',
   'permission': 'Не запускался как новый scope'
 },
 {
   'task': '4A · часть Task 4',
   'component': 'JSON-RPC dispatcher / response schema / error identity',
   'status': 'Проверен пакет',
   'tone': 'good',
   'proof': 'f3fff38: архитектурный re-review PASS и black-box публичного пакета PASS; проверены notifications, IDs, XOR, reverse RPC, ошибки и shutdown.',
   'remaining': 'Task 4 целиком: capability dispatcher, все нативные команды, images/root-child/steer/fork/model/policy/abortTask; endpoint-интеграция.',
   'permission': 'Только 4A разрешён; не весь Task 4'
 },
 {
   'task': '5 · Pure Core',
   'component': 'Импорты, manifests, exports, удаление legacy',
   'status': 'Частично затронут Task 1',
   'tone': 'warn',
   'proof': 'Механическая часть переноса уже идёт. Это не равно независимому AST/build/package acceptance чистого Core.',
   'remaining': 'AST: zero vendor/adapter/I/O imports в Core; ацикличный DAG; корректные public exports; чистая сборка без старого dist.',
   'permission': 'Полный Task 5 отдельно не запущен'
 },
 {
   'task': '6 · S9 и ledger',
   'component': 'Приёмка всего продукта, а не отдельных файлов',
   'status': 'Остаётся',
   'tone': 'neutral',
   'proof': 'Есть только ограниченные component/package PASS. Глобального Cycle-7 PASS нет.',
   'remaining': 'Независимое architecture + compiled-product review, реальные journeys и orchestrator diff gate на одном кандидате.',
   'permission': 'Не означает release / merge / plugin reload'
 }
]

criteria = [
 {'name': 'Реальный ход модели', 'status': 'Не подтверждено', 'detail': 'CLI bin → настоящий Harness; nonce в model output; canonical text_delta; native Submission.wait() завершён с тем же requestId.'},
 {'name': 'Durability, не «файл появился»', 'status': 'Не подтверждено', 'detail': 'Записи user/assistant читаются через native entries; процесс закрыт; после restart те же EntryId и текст; второй ответ действительно завершён.'},
 {'name': 'Нет умных заглушек', 'status': 'Есть открытые места', 'detail': 'Без engine — явная ошибка, не rec_…; метрики из runtime либо explicit unavailable; каждая внедрённая зависимость доходит до реального потребителя.'},
 {'name': 'Полнота capability', 'status': 'Остаётся', 'detail': 'Images-only, root/child, steer/followUp, abort/reuse, abortTask, compact, model/thinking, policy, bindings/fork и история проверяются отдельно.'},
 {'name': 'Настоящий host tool round-trip', 'status': 'Остаётся', 'detail': 'Модель сама вызывает инструмент; client отвечает reverse RPC; engine использует результат и продолжает генерацию. Один server.request не заменяет этот путь.'},
 {'name': 'Изоляция и lifecycle', 'status': 'Остаётся', 'detail': 'Два instance не делят host/global state; один владелец session lock; abort/failure/shutdown освобождают ресурсы; probe не открывает сессию.'},
 {'name': 'Один собранный кандидат', 'status': 'Остаётся', 'detail': 'Чистый build + отдельный typecheck + full tests + AST boundaries; потребитель читает public exports/реальный bin, а не случайный stale dist.'}
]

data = {
  'snapshot': S['capturedAt'],
  'head': S['head'],
  'scope': 'Source WIP snapshot; component/package evidence pinned separately; not global acceptance',
  'metrics': M,
  'tasks': tasks,
  'findings': findings,
  'acceptance': criteria,
  'commandReceipts': C,
  'judgment': 'Direction fits preservation + ports/adapters. Product completeness is unproven; concrete hollow/decorative behaviors remain in WIP.'
}
(P / 'durable-zero-architecture-status.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))

colors = {
  'good': ('#edf3ed', '#56765a'),
  'warn': ('#f8f0e0', '#9b7834'),
  'bad': ('#f8eae5', '#9b5744'),
  'neutral': ('#efeee9', '#77776c'),
  'info': ('#e9f0f1', '#54747b')
}

def node(x, y, w, title, lines, tone='neutral', tag='', href=''):
    bg, st = colors[tone]
    body = f'<rect x="{x}" y="{y}" width="{w}" height="106" rx="3" fill="{bg}" stroke="{st}"/>'
    body += f'<text x="{x+15}" y="{y+27}" class="nt">{esc(title)}</text>'
    for i, l in enumerate(lines):
        body += f'<text x="{x+15}" y="{y+51+i*18}" class="ns">{esc(l)}</text>'
    if tag:
        body += f'<text x="{x+15}" y="{y+91}" class="tag" fill="{st}">{esc(tag)}</text>'
    return f'<a href="{href}">{body}</a>' if href else body

def edge(d, tone='warn', label='', lx=0, ly=0, dashed=False):
    st = colors[tone][1]
    return f'<path d="{d}" fill="none" stroke="{st}" stroke-width="1.8" marker-end="url(#arr-{tone})"' + (' stroke-dasharray="6 5"' if dashed else '') + f'/><text x="{lx}" y="{ly}" class="el">{esc(label)}</text>'

def diagram(target=False):
    defs = ''.join(f'<marker id="arr-{t}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6" fill="none" stroke="{c[1]}"/></marker>' for t, c in colors.items())
    a = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1360 690" role="img" aria-label="{("Целевая архитектура" if target else "Текущий срез архитектуры")}"><defs>{defs}</defs>']
    a += ['<rect x="220" y="45" width="1110" height="620" rx="3" fill="#faf9f5" stroke="#d6d3c9" stroke-dasharray="5 6"/>', '<text x="238" y="69" class="el">ПРОДУКТ DURABLE-ZERO · native runtime сохраняется</text>']
    for d in ['M195,165 H235', 'M435,165 H480', 'M710,165 H750', 'M980,165 H1020']:
        a.append(edge(d, 'info' if target else 'warn'))
    a.append(edge('M1160,218 V360', 'info' if target else 'warn', 'native calls', 1174, 287))
    a.append(edge('M1160,466 V550', 'info' if target else 'warn', 'generate', 1175, 513))
    a.append(edge('M1020,414 H710', 'info' if target else 'warn', 'tool execution', 804, 396))
    a.append(edge('M480,413 H435', 'info' if target else 'neutral', '', 0, 0, not target))
    a.append(edge('M335,360 V218', 'info' if target else 'neutral', 'reverse RPC', 246, 295, not target))
    a.append(edge('M235,414 H110 V218', 'info' if target else 'neutral', 'client result', 38, 326, not target))
    a.append(node(20, 112, 175, 'Внешний клиент', ['BB / другой host', 'пишет и читает stdio'], 'neutral', 'один wire connection'))
    a.append(node(235, 112, 200, 'Protocol', ['StdioJsonRpcServer', 'request / notification'], 'info' if target else 'good', 'T4 · полный контракт' if target else '4A · пакет проверен', '#task-map'))
    a.append(node(480, 112, 230, 'Runner', ['main + composition', 'собирает зависимости'], 'info' if target else 'warn', 'T1 / T3 / T4 / T5', '#task-map'))
    a.append(node(750, 112, 230, 'Core', ['SessionCoordinator', 'IAgentEngine / порты'], 'info' if target else 'warn', 'чистый домен · T1 / T5', '#task-map'))
    a.append(node(1020, 112, 280, 'PiDurableEngine', ['реальная native обёртка', 'не новый agent loop'], 'info' if target else 'warn', 'T1 · нужна E2E-приёмка', '#criteria'))
    a.append(node(1020, 360, 280, 'Native runtime', ['openDurable / Harness', 'controller / watchers / models'], 'neutral' if not target else 'info', 'существующий Pi SDK'))
    a.append(node(750, 470, 230, 'SQLite + lock', ['native entries / tasks', 'сессия и восстановление'], 'neutral' if not target else 'info', 'один владелец: engine'))
    a.append(edge('M1100,466 V523 H980', 'info' if target else 'warn'))
    a.append(node(1020, 550, 280, 'Модель', ['native ModelRuntime', 'тест: публичная extension'], 'neutral', 'не production mock-ветка'))
    a.append(node(480, 360, 230, 'Tools / resources', ['codemode / execution', 'settings / skills / prompts'], 'info' if target else 'warn', 'реальный DI · T1 / T2 / T5', '#proof-resources'))
    a.append(node(235, 360, 200, 'HostBridge', ['host/toolCall', 'host/interaction'], 'info' if target else 'good', 'T2 · замкнутый путь' if target else '2A · только компонент', '#task-map'))
    if target:
        a.append('<text x="750" y="276" class="ns">Нет engine → явная ошибка.</text><text x="750" y="297" class="ns">Нет поддержки → explicit unavailable.</text><text x="750" y="318" class="ns">Никакого синтетического accepted.</text>')
        a.append('<text x="235" y="504" class="ns">Запрос инструмента → ответ клиента →</text><text x="235" y="526" class="ns">продолжение native generation.</text>')
    else:
        a.append(edge('M866,218 V260', 'bad', dashed=True))
        a.append('<a href="#proof-fallback"><rect x="750" y="260" width="230" height="87" rx="3" fill="#f8eae5" stroke="#9b5744"/><text x="765" y="286" class="nt">Остаточный обход</text><text x="765" y="309" class="ns">без engine → rec_…</text><text x="765" y="330" class="tag" fill="#9b5744">ОТКРЫТО · AP-076</text></a>')
        a.append('<text x="235" y="504" class="ns">Пунктир: не подключено к</text><text x="235" y="526" class="ns">рабочему model/tool пути.</text><text x="235" y="558" class="ns">В перенесённом runtime ещё есть</text><text x="235" y="580" class="ns">legacy host-rpc globals · убрать в T2.</text>')
    a.append('<text x="20" y="668" class="el">Линии показывают связи исходников / целевой контракт, НЕ успешную end-to-end работу.</text></svg>')
    result = ''.join(a).replace('arr-', 'arr-target-' if target else 'arr-now-')
    styles = '<style>.nt{font:600 16px system-ui;fill:#34332c}.ns{font:13px system-ui;fill:#656054}.tag{font:600 11px monospace}.el{font:12px monospace;fill:#7a7366}</style>'
    return result.replace('<defs>', styles + '<defs>', 1)

now = diagram()
goal = diagram(True)
(P / 'durable-zero-architecture-asis.svg').write_text(now)
(P / 'durable-zero-architecture-tobe.svg').write_text(goal)

rows = ''.join(f'<tr id="task-{i}"><td><b>{esc(t["task"])}</b><small>{esc(t["permission"])}</small></td><td>{esc(t["component"])}</td><td><span class="badge {t["tone"]}">{esc(t["status"])}</span><p>{esc(t["proof"])}</p></td><td>{esc(t["remaining"])}</td></tr>' for i, t in enumerate(tasks, 1))

proofs = ''
for f in findings:
    snippets = ''.join(f'<div class="path">{esc(e["path"])}:{e["from"]}–{e["to"]} · sha256 {e["sha256"][:12]}</div><pre>{esc(e["text"])}</pre>' for e in f['evidence'])
    proofs += f'<article class="proof" id="proof-{f["id"]}"><h3><span class="badge {"bad" if f["severity"]=="P1" else "warn"}">{f["severity"]}</span> {esc(f["title"])}</h3><p>{esc(f["impact"])}</p><details><summary>Исходники среза и архитектурное правило</summary>{snippets}<p class="path">Rule: {esc(f["rule"])}</p></details></article>'

checks = ''.join(f'<li><div><b>{esc(x["name"])}</b><span class="badge neutral">{esc(x["status"])}</span></div><p>{esc(x["detail"])}</p></li>' for x in criteria)
receipt_rows = ''.join(f'<tr><td>{esc(x["time"][11:19])}</td><td><code>{esc(x["command"].split(" && ")[-1])}</code></td><td>{"прошла сборка / suite" if x["exit"]==0 else "не прошёл; E2E = timeout" if "--test" in x["command"] else "ошибка сборки"}</td></tr>' for x in C[-5:])

source_links = [
    ('protocol-architecture-rereview-r1.md', '../reviews/protocol-architecture-rereview-r1.md'),
    ('protocol-product-rereview-r1.md', '../reviews/protocol-product-rereview-r1.md'),
    ('hostbridge-architecture-review.md', '../reviews/hostbridge-architecture-review.md'),
    ('architecture-map-source-snapshot.json', 'architecture-map-source-snapshot.json'),
    ('durable-zero-architecture-status.json', 'durable-zero-architecture-status.json'),
    ('architecture-map-slice0-command-receipts.json', 'architecture-map-slice0-command-receipts.json'),
    ('durable-zero-architecture-status.md', 'durable-zero-architecture-status.md'),
]
links = ''.join(f'<li><a href="{esc(href)}">{esc(name)}</a></li>' for name, href in source_links)

stamp = datetime.fromisoformat(S['capturedAt']).strftime('%d.%m.%Y · %H:%M:%S %z')

css = '''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f3ec;color:#302f29;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1480px;width:100%;margin:auto;padding:32px 24px 64px}h1,h2,h3{font-weight:600;letter-spacing:-.025em;line-height:1.2}h1{font-size:36px;margin:0 0 16px}h2{font-size:26px;margin:0 0 16px}h3{font-size:19px;margin:0 0 12px}p{margin:10px 0}.lead{font-size:19px;max-width:1000px;color:#5c5a50}.meta,.path,small{font-size:12px;color:#767266}.meta{font-family:ui-monospace,monospace;margin:18px 0}.path{font-family:ui-monospace,monospace;overflow-wrap:anywhere}nav{position:sticky;top:0;z-index:3;background:#f5f3ecf5;backdrop-filter:blur(8px);display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid #d9d5ca}a{color:#526b70;text-decoration:none}a:hover,summary:hover{background:#eae7dc}nav a{padding:6px 12px;border-radius:3px;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.card,.panel{border:1px solid #d8d4c8;background:#fcfbf6;border-radius:3px;padding:20px}.card p{color:#686458;font-size:15px}.card h3{font-size:18px}.good{color:#4e7151;background:#edf3ed}.warn{color:#906f30;background:#f8f0e0}.bad{color:#96503f;background:#f8eae5}.neutral{color:#6f6c62;background:#eeece4}.badge{display:inline-block;font:600 11px/1.5 ui-monospace,monospace;letter-spacing:.02em;padding:3px 8px;border-radius:2px;vertical-align:middle}section{margin:40px 0;scroll-margin-top:70px}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:#756e61;margin:12px 0}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}.legend .yes{background:#789272}.legend .wip{background:#ba9957}.legend .risk{background:#b17560}.legend .todo{background:#b2afa4}.diagram{padding:10px;background:#fcfbf6;border:1px solid #d8d4c8;border-radius:3px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;max-width:100%}.diagram svg{width:100%;min-width:960px;height:auto;display:block}.nt{font:600 16px -apple-system,BlinkMacSystemFont,sans-serif;fill:#34332c}.ns{font:13px -apple-system,BlinkMacSystemFont,sans-serif;fill:#656054}.tag{font:600 11px ui-monospace,monospace}.el{font:12px ui-monospace,monospace;fill:#7a7366}.note{border-left:2px solid #b19055;padding:4px 18px;margin:18px 0;color:#69614e}.note.critical{border-color:#aa6a53;background:#f7eee7;padding:14px 18px}.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel ul{padding-left:20px}.panel li{margin:12px 0}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:#777164;padding:14px 12px;border-bottom:1px solid #aaa394}td{vertical-align:top;padding:16px 12px;border-bottom:1px solid #dedace;min-width:130px}td p{margin-top:10px;font-size:13px;color:#70685b}td small{display:block;margin-top:9px;max-width:160px}td:nth-child(3),td:nth-child(4){min-width:240px}code{font-size:12px;overflow-wrap:anywhere}.proof{padding:25px 0;border-top:1px solid #d8d4c8;scroll-margin-top:70px}.proof>p{max-width:1050px;color:#665e50}.proof h3{display:flex;align-items:baseline;gap:12px}.proofs{background:#fcfbf6;border:1px solid #d8d4c8;border-radius:3px;padding:0 24px}.proof:first-child{border-top:0}details{margin-top:14px}summary{cursor:pointer;font-size:13px;color:#587076;padding:5px 0}pre{font:12px/1.65 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#eeece5;border-radius:2px;padding:14px;color:#4f4b41}.path{margin:12px 0 5px}.checks{list-style:none;margin:0;padding:0}.checks li{padding:18px 0;border-bottom:1px solid #ddd7ca}.checks li>div{display:flex;justify-content:space-between;gap:15px}.checks p{font-size:14px;color:#726858;max-width:1120px}.capabilities{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.capabilities .card{padding:18px}.capabilities h3{font-size:17px}.closing{font-size:22px;line-height:1.5;max-width:1120px;margin:24px 0}.count{font:600 42px/1 ui-monospace,monospace;color:#77613d}.scope{display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:center}.refs{font-size:13px}.refs li{margin:7px 0}footer{border-top:1px solid #cbc4b6;margin-top:50px;padding-top:20px;color:#817565;font-size:12px}@media(max-width:900px){main{padding:20px 12px 40px}h1{font-size:28px}h2{font-size:22px}.lead{font-size:17px}.summary,.two,.capabilities{grid-template-columns:1fr}.proof h3{display:block}.badge{margin:4px 0}.checks li>div{display:block}.scope{grid-template-columns:1fr;gap:4px}}@media(max-width:600px){main{padding:14px 8px 30px}h1{font-size:24px}.card,.panel{padding:14px}.proofs{padding:0 14px}}@media print{nav{position:static}main{max-width:none;padding:10px}.diagram svg{min-width:0}section{break-inside:avoid}.proof{break-inside:avoid}details{display:block}details>*{display:block}a{color:inherit}}'''

page = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>durable-zero · AS IS → TO BE · Cycle 7</title><style>{css}</style></head><body><main>
<header><h1>Куда идёт durable-zero</h1><p class="lead">Архитектура AS IS → TO BE, связь с планом и честная граница между «компонент проверен» и «продукт работает целиком».</p><p class="meta">Срез исходников: {stamp} · HEAD {S['head'][:12]} + незакоммиченный WIP<br>Компоненты привязаны к отдельным commits / artifacts. Страница не live-dashboard.</p></header>
<nav aria-label="Разделы"><a href="#verdict">Вывод</a><a href="#now">AS IS</a><a href="#target">TO BE</a><a href="#task-map">План → компоненты</a><a href="#risks">Заглушки и риски</a><a href="#criteria">Граница готовности</a><a href="#evidence">Пруфы</a></nav>
<section id="verdict"><h2>Направление разумное. Целое пока не доказано.</h2><div class="summary"><div class="card"><h3>Что правильно в замысле</h3><p>Не пишем собственный agent loop. Сохраняем native Harness, контроллер, event bridge, subagents и SQLite, вынося конкретную реализацию из чистого Core.</p><span class="badge neutral">Оценка архитектуры, не PASS продукта</span></div><div class="card"><h3>Что уже имеет независимый пруф</h3><p>Protocol 4A проверен и по исходникам, и внешним потребителем собранного пакета. HostBridge 2A прошёл ограниченное компонентное архитектурное ревью.</p><span class="badge good">Два разных, ограниченных scope</span></div><div class="card"><h3>Что пока не готово</h3><p>Сквозной CLI → native execution → persistence → restart не принят. Последний записанный E2E закончился таймаутом; в текущем WIP ещё есть конкретные заглушки.</p><span class="badge bad">Глобального S9 PASS нет</span></div></div>
<div class="two"><div class="panel scope"><div class="count">{M['newEngineTsFiles']}</div><div><b>TS-файл в новом runtime-замыкании</b><p>Slice 0 — не маленькая новая функция: это перенос связанной реализации плюс CLI, DI, build и контрактов. Количество файлов показывает ширину переноса, а не процент готовности.</p></div></div><div class="panel"><h3>Почему маленькие зелёные куски не дают готовый рантайм</h3><p>2A и 4A — независимые компоненты, а не законченные пользовательские срезы. Они снижают риск будущей интеграции, но не заменяют основной критический путь Task 1.</p></div></div>
<p class="note">Не запускаю новые работы и не ускоряю исполнителей. Эта карта — read-only оценка уже разрешённых scope. Полные Tasks 2–6 не считаются автоматически запущенными.</p></section>
<section id="now"><h2>AS IS · что действительно есть в коде</h2><p>Главный entry point уже переведён на новый runner, а composition создаёт реальный PiDurableEngine. Но наличие связей в исходниках не означает успешный запуск всей цепочки.</p><div class="legend"><span><i class="yes"></i>Проверен ограниченный компонент / пакет</span><span><i class="wip"></i>Код / перенос в работе</span><span><i class="risk"></i>Остаточный обход / blocker</span><span><i class="todo"></i>Существующая инфраструктура / ещё без нового интеграционного пруфа</span></div><div class="diagram">{now}</div><p class="note critical"><b>Важное различие:</b> зелёный HostBridge с пунктирными связями — готовый отдельный узел, а не работающий host-tool сценарий. Красный rec_… обход условный: default composition передаёт настоящий engine, но Core всё ещё разрешает «принять без исполнения» другим потребителям.</p></section>
<section id="target"><h2>TO BE · один рабочий путь, без обходных успехов</h2><p>Весь пользовательский поток проходит через настоящий engine. Порты отделяют доменные решения от конкретных SDK, а не подменяют работу «похожими» DTO.</p><div class="diagram">{goal}</div><div class="two"><div class="panel"><h3>Путь запроса во время работы</h3><p>Клиент → JSON-RPC → dispatch → coordinator → engine → native Harness → модель / инструмент. Назад — canonical stream и terminal settlement настоящего Submission.</p><p>Host-инструмент: engine → внедрённый HostBridge → server.request → клиент → результат → продолжение генерации.</p></div><div class="panel"><h3>Направление импортов — другое</h3><p>Runner знает concrete adapters. Адаптер реализует Core-порт. Core знает только доменные контракты; он не импортирует Pi SDK, runner, SQLite или host RPC.</p><p>Codemode может импортировать native extension types из adapter-pi-durable; обратная concrete-зависимость запрещена. Runtime dependencies собирает composition.</p></div></div><p class="note">Pi как провайдер рабочих BB-субтредов и Pi Durable SDK внутри создаваемого продукта — разные уровни. Смена исполнителей на pi не означает замену native движка продукта.</p></section>
<section id="task-map"><h2>План → компоненты → остаток</h2><p>Три разрешённых scope: Task 1, Task 2A и Task 4A. Полная интеграция HostBridge и полный capability-dispatch не скрыты за их зелёными компонентными статусами.</p><div class="table-wrap panel"><table><thead><tr><th>Scope / разрешение</th><th>Область архитектуры</th><th>Что подтверждено</th><th>Что ещё не доказано / осталось</th></tr></thead><tbody>{rows}</tbody></table></div><p class="note">Канонический файл плана всё ещё помечен Candidate DRAFT. Отдельные разрешения выбранных scope зафиксированы в ledger. Это не общий S7/S9 PASS и не разрешение на релиз.</p></section>
<section id="risks"><h2>Риск «умных заглушек» не только теоретический</h2><p>Ниже — наблюдения по сохранённому срезу исходников, а не обвинения в сломанном готовом релизе. Автор Task 1 ещё работает. Эти места нельзя пронести через финальную приёмку под видом реализации.</p><div class="proofs">{proofs}</div>
<div class="two" style="margin-top:20px"><div class="panel"><h3>Что защищает от неполной реализации</h3><p>Walking-skeleton тест не ограничивается accepted: в нём есть text_delta, correlated turn_complete, реальные user/assistant entries и совпадение EntryId после нового процесса. Это правильный тип доказательства — когда он действительно пройдёт.</p><p>Стандартный test-script уже включает <code>packages/*/test/*.test.ts</code>, то есть runner-тесты не живут только в чате.</p></div><div class="panel"><h3>Чего один такой тест не докажет</h3><p>Он не покрывает всю совместимость, host tools, probe, abort/reuse и отсутствие globals. Его harness пока скрывает stderr и не отклоняет pending request при раннем exit дочернего процесса; таймаут не объясняет причину сбоя.</p><p>Успешный esbuild не заменяет typecheck. Нельзя принимать «зелёные старые units» или новый файл за доказательство полного рабочего поведения.</p></div></div></section>
<section id="criteria"><h2>Когда можно будет сказать «не осталось недоделанного целого»</h2><p>Не гарантия по обещанию, а набор проверяемых условий. Падение любого обязательного сценария блокирует общий PASS, даже если отдельные пакеты зелёные.</p><div class="panel"><ul class="checks">{checks}</ul></div><p class="closing">Моя оценка: <b>целевая конструкция соответствует задаче сохранения зрелого runtime.</b> Но сказать «всё уже ок» сейчас было бы неверно. Главный риск — закончить перенос файлов и интерфейсов раньше, чем замкнуть и независимо доказать реальный пользовательский путь. В текущем WIP ещё есть именно те обходы и placeholders, которые такая приёмка обязана не пропустить.</p></section>
<section id="evidence"><h2>На чём основана карта</h2><div class="two"><div class="panel"><h3>Последние записанные build / E2E milestones</h3><div class="table-wrap"><table><thead><tr><th>МСК</th><th>Команда</th><th>Результат</th></tr></thead><tbody>{receipt_rows}</tbody></table></div><p class="path">Receipt time — завершение команды. Сборка и E2E предшествуют сохранённому срезу исходников: более поздние изменения не объявляются автоматически проверенными. E2E: timeout / cancelled, не установленная причина и не утверждение об ошибке модели.</p></div><div class="panel refs"><h3>Фиксированные evidence-пакеты</h3><ul>{links}</ul><p><b>Protocol:</b> f3fff38a8415<br>artifact SHA256: <code>24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514</code></p><p><b>HostBridge:</b> efc9eab7ddfb, component scope only.</p><p><b>План:</b> <a href="../../../superpowers/plans/2026-11-04-cycle-7-runtime-adapter-ioc-migration.md">2026-11-04-cycle-7-runtime-adapter-ioc-migration.md</a><br><b>Оркестрация:</b> <a href="../../ledger.md">docs/arch-improvement/ledger.md</a></p></div></div><p class="note">Сбой рабочего агента «no response headers within 180000ms» — отдельный инфраструктурный факт. Он не равен результату продуктового E2E, который отдельно завершался на 60-секундном timeout.</p></section>
<footer>Read-only AS IS / TO BE review · {stamp} · HEAD {S['head'][:12]} + WIP. Исходники сохранены с SHA256; состав branch продолжает изменяться. Ни source edits, ни новые агенты, ни release/install не входят в эту оценку.</footer>
</main></body></html>'''
(P / 'durable-zero-architecture-status.html').write_text(page)

# Knowledge asset uses evidence attribution and labels conclusions as assessment.
md = f'''---
title: "durable-zero Cycle 7: AS IS → TO BE and completeness assessment"
type: analysis
date: 2026-11-04
---

# durable-zero Cycle 7 — architecture / completeness assessment

Snapshot: {S['capturedAt']}; HEAD `{S['head']}` + active WIP. Not global acceptance. [Source: BB Pi thread thr_9yjb93iwmn; architecture-map-source-snapshot.json]

## Architectural judgment (assessment)

The target direction fits preserving the mature native runtime while isolating sovereign Core. Native Harness/controller/event bridge/subagents/SQLite are retained behind PiDurableEngine, not replaced by a custom agent loop. This is a design assessment, NOT a claim that the integrated runtime works. [Source: canonical Cycle-7 plan: Goal, Architecture, Canonical Design Amendment; captured CLI/composition/engine sources]

The main completeness risk is horizontal migration and green component results being mistaken for a vertically working product. Task 1 is broad: {M['newEngineTsFiles']} TypeScript files are currently under the relocated runtime closure; file counts are NOT completion percentages. [Source: architecture-map-migration-metrics.json]

## Evidence and bounded status

- Protocol 4A: fixed candidate `f3fff38a8415`, artifact `24e9a99fb89f6383390c19998d3df1e50b0fb05a244b7d627e08f260105e1514`; independent architecture and compiled-public-package product re-reviews PASS. This does not accept the entire production runner or all capability methods. [Source: ../reviews/protocol-architecture-rereview-r1.md; ../reviews/protocol-product-rereview-r1.md]
- HostBridge 2A: candidate `efc9eab7ddfb`, component architecture PASS, 36 author component tests; public package/composition/Harness/full model tool-loop acceptance remains pending. [Source: ../reviews/hostbridge-architecture-review.md]
- Task 1: CLI points at new runner and composition creates the actual engine. A recorded build succeeded, but last recorded CLI walking-skeleton E2E timed out; later WIP is not automatically covered by that build. No global Cycle-7 S9 acceptance. [Source: captured CLI/composition; architecture-map-slice0-command-receipts.json; slice0 event log seq 935/939]

## Current WIP findings (not released-regression claims)

'''
for f in findings:
    refs = '; '.join(f'{e["path"]}:{e["from"]}-{e["to"]}, sha256 {e["sha256"]}' for e in f['evidence'])
    md += f'### [{f["severity"]}] {f["title"]}\n\nEvidence: {refs}. [Source: architecture-map-source-snapshot.json]\n\nImpact: {f["impact"]}\n\nRule: {f["rule"]}.\n\nFix decision: {f["decision"]}\n\n'
md += '## Plan mapping\n\n'
for t in tasks:
    md += f'- **{t["task"]} — {t["status"]}.** {t["proof"]} Remaining: {t["remaining"]} [Source: canonical task transition matrix; bounded review reports; captured source/command receipts]\n'
md += '\n## Acceptance obligations\n\n'
for x in criteria:
    md += f'- **{x["name"]}: {x["status"]}.** {x["detail"]} [Source: canonical plan Global Constraints and Review Focus; assessment against captured source and existing reviews]\n'
md += '''
## Architecture verification

- Passed (bounded components): AP-010/AP-022/AP-028/AP-074/AP-076 as documented in the Protocol and HostBridge review scopes. These are NOT global architecture passes. [Source: ../reviews/protocol-architecture-rereview-r1.md; ../reviews/hostbridge-architecture-review.md]
- Global AP-075 (working entry point), AP-076 (no hollow implementations), full DI, lifecycle and capability parity remain unaccepted. [Source: current WIP findings above; last E2E receipt]
- Residual risk: incomplete integration, fake admission fallback, decorative resource DI, placeholder metrics, abort/reuse semantics, legacy host globals, unverified probe/isolation/teardown and stale-dist/typecheck blind spots. Some are intentional future scopes; none may be hidden behind a component PASS. [Source: evidence above; planned Tasks 2–6]

No new implementation or reviewer threads launched, no source edits/release/install performed for this assessment. The user asked for the overall picture, not acceleration. [Source: BB Pi thread thr_9yjb93iwmn, user request]
'''
(P / 'durable-zero-architecture-status.md').write_text(md)
print(json.dumps({'html': str(P / 'durable-zero-architecture-status.html'), 'bytes': len(page.encode()), 'findings': len(findings), 'tasks': len(tasks), 'snapshot': S['capturedAt']}, ensure_ascii=False))
