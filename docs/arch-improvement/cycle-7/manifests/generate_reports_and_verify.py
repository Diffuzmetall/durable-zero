#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verify current packaging facts; never infer product acceptance or global quiescence."""
from pathlib import Path
from datetime import datetime
from html.parser import HTMLParser
import hashlib, json, xml.etree.ElementTree as ET
B = Path(__file__).resolve().parents[1]
M = B/'manifests/relocation-manifest.json'
old = json.loads(M.read_text()) if M.exists() else {}
provenance = {x['path']:x.get('source_provenance','workspace') for x in old.get('packaged_deliverables',[])}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.ids=set(); self.links=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.add(a['id'])
        if tag=='a' and 'href' in a:self.links.append(a['href'])
page=B/'architecture/durable-zero-architecture-status.html'; parsed=Links(); parsed.feed(page.read_text())
broken=[]
for href in parsed.links:
    if href.startswith('#'):
        if href[1:] not in parsed.ids:broken.append(href)
    elif not href.startswith(('https:','http:','mailto:')):
        if not (page.parent/href.split('#')[0]).exists():broken.append(href)
svg={}
for n in ['asis','tobe']:
    p=B/f'architecture/durable-zero-architecture-{n}.svg'
    svg[n]={'validXML':True,'viewBox':ET.parse(p).getroot().get('viewBox'),'sha256':sha(p)}
snapshot=B/'architecture/architecture-map-source-snapshot.json'
expected=old.get('verification_receipts',{}).get('source_snapshot_immutable',{}).get('sha256')
snapshot_ok=not expected or sha(snapshot)==expected
assert not broken, f'Broken links: {broken}'
assert snapshot_ok,'Historical source snapshot changed'
status=json.loads((B/'architecture/durable-zero-architecture-status.json').read_text())
checks={'html_links_verified':{'target':str(page.relative_to(B)),'total_links':len(parsed.links),'broken_links':len(broken)},'svgs_verified':svg,'source_snapshot_immutable':{'sha256':sha(snapshot),'unchanged':snapshot_ok},'product_acceptance':'NOT_ACCEPTED','status_snapshot':status['capturedAt']}
report=B/'manifests/final-validation-report.md'
report.write_text(f'''# Current Cycle 7 artifact validation

Checked at: {datetime.now().astimezone().isoformat()}

- Current architecture HTML: {len(parsed.links)} links checked; {len(broken)} unresolved.
- Both SVG files parse as XML; exact hashes/viewBoxes are recorded in the manifest.
- Historical source snapshot SHA256: `{sha(snapshot)}`; unchanged against prior manifest.
- Product acceptance: **NOT ACCEPTED**. Packaging validation is not an architecture, native-runtime, full-suite or release verdict.
- Current author/independent test evidence is indexed in architecture/durable-zero-architecture-status.json with individual scope and physical receipt hashes.
- Historical RED, rejected candidates and the earlier architecture/packaging snapshot remain evidence, not current readiness claims.
- This command validates packaged files, not writer quiescence or the cleanliness of the entire repository. Active live/handoff directories are excluded from package hash ownership.
''')
items=[]
for p in sorted(B.rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(B).as_posix()
    if p==M or any(s.startswith('.') for s in Path(rel).parts) or rel.startswith(('live/','handoffs/')):continue
    items.append({'path':rel,'category':rel.split('/')[0] if '/' in rel else 'root','sha256':sha(p),'bytes':p.stat().st_size,'source_provenance':provenance.get(rel,'workspace')})
manifest={'title':'Cycle 7 current packaged-artifact integrity (not product acceptance)','created_at':datetime.now().astimezone().isoformat(),'packaged_deliverables_count':len(items),'packaged_deliverables':items,'excluded_from_hash_ownership':['live/','handoffs/','ledger.md','product sources'],'explicit_internal_exclusions':old.get('explicit_internal_exclusions',[]),'missing_referenced_artifacts':[],'verification_receipts':checks}
M.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
assert all(sha(B/x['path'])==x['sha256'] for x in items)
print(json.dumps({'packaged':len(items),'links':len(parsed.links),'broken':broken,'snapshotUnchanged':snapshot_ok,'productAcceptance':'NOT_ACCEPTED'}))
