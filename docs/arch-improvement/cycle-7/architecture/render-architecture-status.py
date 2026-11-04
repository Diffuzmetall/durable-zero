# -*- coding: utf-8 -*-
"""Render the current evidence-pinned status; historical source snapshot stays immutable."""
import json, html
from pathlib import Path
P = Path(__file__).resolve().parent
D = json.loads((P / 'durable-zero-architecture-status.json').read_text())
fixed_dispatch = next((r for r in D['testReceipts'] if r['name'] == 'Fixed compiled dispatcher'), {})
native_source = D.get('nativeSourceVerdict', 'NOT ACCEPTED')
native_product = D.get('nativeMinimumProductVerdict', 'NOT ACCEPTED')
native_tone = 'good' if native_source.startswith('PASS') and native_product.startswith('PASS') else 'warn'
def esc(value): return html.escape(str(value))
def link(path, label): return f'<a href="../{esc(path)}">{esc(label)}</a>'
def diagram(target=False):
    color = '#77715f' if target else '#58745d'
    defs = f'<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6" fill="none" stroke="{color}"/></marker></defs>'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1060 690" role="img" aria-label="{esc("Цель" if target else "Текущий подтверждённый путь")}">{defs}<style>text{{font:14px system-ui;fill:#34332c}}.sub{{font-size:12px;fill:#746c5f}}.name{{font-weight:600}}</style>']
    def edge(path, pending=False):
        out.append(f'<path d="{path}" fill="none" stroke="{color if not pending else "#a1844d"}" stroke-width="2" marker-end="url(#arrow)"'+(' stroke-dasharray="6 5"' if pending else '')+'/>')
    for path in ['M235 140H280','M495 140H540','M755 140H800','M908 195V300','M800 350H755','M908 405V510']:
        edge(path)
    edge('M800 390H775V460H388V405',True)
    edge('M388 300V195',True)
    edge('M280 350H128V195',True)
    def box(x,y,title,lines,kind='solid'):
        out.append(f'<rect x="{x}" y="{y}" width="215" height="115" rx="3" fill="#faf9f5" stroke="{color if kind == "solid" else "#a1844d"}"/>')
        out.append(f'<text x="{x+14}" y="{y+26}" class="name">{esc(title)}</text>')
        for n,line in enumerate(lines): out.append(f'<text x="{x+14}" y="{y+50+19*n}" class="sub">{esc(line)}</text>')
    box(20,80,'Внешний клиент',['JSON-RPC 2.0 / stdio','request + session/event','реальный процесс CLI'])
    box(280,80,'CLI + Runner',['main / composition','Protocol 4A: пакет PASS','4B: отдельный кандидат'])
    box(540,80,'Core',['SessionCoordinator','обязательный IAgentEngine','проверка чистоты не закрыта'])
    box(800,80,'PiDurableEngine',['конкретный SDK-адаптер','настоящий openDurable','не новый agent loop'])
    box(800,300,'Native Harness',['Pi SDK 1.5.0','Submission.wait()','native generation events'])
    box(540,300,'Модель',['public --extension','scripted provider в тесте','не реальный API-вызов'])
    box(800,510,'SQLite / transcript',['user + assistant entries','restart → те же EntryId','полные повторные ответы'])
    box(280,300,'HostBridge / tools',['2A: компонент PASS','model → client → result','полный цикл ещё не принят'],'pending')
    out.append(f'<text x="20" y="570" class="name">{esc("TO BE: все ветки и capability проверены на одном production-кандидате" if target else "AS IS: сплошная линия — авторский native E2E, не независимая приёмка")}</text>')
    out.append('<text x="20" y="596" class="sub">Пунктир — недоказанная интеграция инструментов. Import DAG и runtime call path — разные графы.</text>')
    out.append('<text x="20" y="622" class="sub">Полная цель также требует probe без сессии, bindings/fork, metrics, abort/reuse и lifecycle isolation.</text>')
    out.append('</svg>')
    return ''.join(out)
now, target = diagram(), diagram(True)
(P/'durable-zero-architecture-asis.svg').write_text(now)
(P/'durable-zero-architecture-tobe.svg').write_text(target)
rows = ''.join(f'<tr><td><b>{esc(t["name"])}</b></td><td><span class="badge {esc(t["tone"])}">{esc(t["status"])}</span><p>{esc(t["proof"])}</p></td><td>{esc(t["remaining"])}</td></tr>' for t in D['tasks'])
remaining = ''.join(f'<li><b>{esc(t["title"])}</b><p>{esc(t["detail"])}</p></li>' for t in D['remaining'])
proofs = ''.join(f'<li>{link(e["path"], e["label"])}</li>' for e in D['evidence'])
testrows = ''.join(f'<tr><td>{esc(t["name"])}</td><td>{t["tests"]}</td><td>{t["failed"]}</td><td>{esc(t["scope"])}</td></tr>' for t in D['testReceipts'])
changes = ''.join(f'<li>{esc(t)}</li>' for t in D['changes'])
css = '''html,body{background:transparent;color:var(--foreground,#34332c);font:15px/1.55 var(--font-sans,system-ui);margin:0}main{max-width:1120px;margin:auto}h1{font-size:30px;font-weight:600;line-height:1.2;margin:8px 0 16px}h2{font-size:22px;margin:32px 0 14px}h3{font-size:17px;margin:0 0 10px}p{margin:8px 0;color:var(--muted-foreground,#746c5f)}a{color:inherit;text-underline-offset:3px}nav{display:flex;flex-wrap:wrap;gap:18px;margin:20px 0}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.panel{padding:20px;border:1px solid var(--border,#d8d2c7);border-radius:3px}.badge{font-size:12px;font-weight:600}.good{color:#58745d}.warn{color:#9b7834}.bad{color:#9b5744}.neutral{color:#746c5f}.meta{font:12px/1.6 var(--font-mono,monospace)}.diagram{background:#f5f3ec;border-radius:3px;padding:12px;overflow:auto}.diagram svg{width:100%;min-width:700px;height:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}th,td{padding:14px 12px;vertical-align:top;border-bottom:1px solid var(--border,#d8d2c7)}th{font-weight:600}li{margin:14px 0}.scroll{overflow:auto}details{margin:24px 0}footer{margin:30px 0;font-size:12px;color:var(--muted-foreground,#746c5f)}@media(max-width:700px){.cards{grid-template-columns:1fr}h1{font-size:25px}.panel{padding:16px}}'''
page = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>durable-zero · обновлённый статус Cycle 7</title><style>{css}</style></head><body><main>
<h1>Native-минимум проверен. Весь Cycle 7 ещё не закрыт.</h1>
<p>Независимый source-гейт: {esc(native_source)}. Независимый product-гейт: {esc(native_product)}. Эти результаты относятся к ограниченному Native CLI/Harness/SQLite пути; общий clean build/typecheck/regression и полная интеграция возможностей проверяются отдельно.</p>
<p class="meta">Срез исходников {esc(D['capturedAt'])} · {esc(D['head'][:12])} + WIP · не live-dashboard<br>Статус ревью обновлён: {esc(D.get('reviewUpdateAt', D['capturedAt']))}<br>Native-кандидат fc090960 · dispatcher fix ea21bf5 · отдельные scope не суммируются в общий PASS.</p>
<nav><a href="#now">AS IS</a><a href="#tasks">По задачам</a><a href="#remaining">Что осталось</a><a href="#proof">Доказательства</a></nav>
<div class="cards"><section class="panel"><h3>Native path</h3><span class="badge {native_tone}">Раздельные source / product гейты</span><p>{esc(native_source)}<br>{esc(native_product)}</p><p>Поток до завершения модели, полные ответы и EntryId после restart проверены внешним клиентом. Остаток общего прогона не скрыт за этим PASS.</p></section><section class="panel"><h3>Диспетчер 4B</h3><span class="badge good">Исправленный fixture-компонент PASS</span><p>Независимый compiled black-box: {fixed_dispatch.get('tests', '—')} cases, без падений. Source-review и исправленный evidence-harness подтверждают компонент; production wiring и Native Harness/SQLite этим не приняты.</p></section><section class="panel"><h3>Общая готовность</h3><span class="badge bad">Cycle 7 не принят</span><p>Остаются финальная consumer/test миграция, полный clean build/typecheck/regression и неподключённые runtime-возможности. Guards имеют отдельный scoped PASS; процент готовности по числу файлов не считаем.</p></section></div>
<section id="now"><h2>AS IS · подтверждённый путь и недоказанные ветки</h2><div class="diagram">{now}</div><h3 style="margin-top:20px">Что изменилось относительно прежней схемы</h3><ul>{changes}</ul></section>
<section id="tasks"><h2>Статус по задачам</h2><div class="scroll"><table><thead><tr><th>Область</th><th>Подтверждено сейчас</th><th>Остаток</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section id="remaining"><h2>Что остаётся до закрытия цикла</h2><ol>{remaining}</ol></section>
<details><summary>TO BE · полная целевая конструкция</summary><div class="diagram">{target}</div><p>Нужно не просто наличие узлов, а независимые сценарии для всех веток на одном чисто собранном кандидате. Реальный внешний LLM/API не использовался: в проверках подменён только публичный model-provider seam.</p></details>
<section id="proof"><h2>Пруфы и границы утверждений</h2><div class="scroll"><table><thead><tr><th>Реальный отчёт</th><th>Случаев</th><th>Падений</th><th>Что это значит</th></tr></thead><tbody>{testrows}</tbody></table></div><p>4 зелёных focused counterexample-probes доказывают 3 обхода checker, а не исправность checker. Зелёный исходный unit-набор не заменяет проверку публичного compiled-артефакта.</p><ul>{proofs}</ul></section>
<footer>Сохранённый срез, не релиз. Backup / author test / independent component review / native acceptance — разные уровни. Исторический срез и исходные RED/FAIL сохранены; новые статусы не переписывают их задним числом.</footer>
</main></body></html>'''
(P/'durable-zero-architecture-status.html').write_text(page)
md = f'# Cycle 7 — текущий статус\n\nСрез {D["capturedAt"]}; {D["head"]} + WIP. Global S9: NOT ACCEPTED.\n\n'
for t in D['tasks']:
    md += f'## {t["name"]} — {t["status"]}\n\n{t["proof"]}\n\nОсталось: {t["remaining"]}\n\n'
md += '## Evidence\n\n' + '\n'.join(f'- [{e["label"]}](../{e["path"]})' for e in D['evidence'])
(P/'durable-zero-architecture-status.md').write_text(md+'\n')
print(json.dumps({'htmlBytes':len(page.encode()),'tasks':len(D['tasks']),'capturedAt':D['capturedAt']}))
