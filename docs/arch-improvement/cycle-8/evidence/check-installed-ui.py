from pathlib import Path
import hashlib,json
p=Path('/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone')
u=p/'node_modules/@local-durable/terminal-ui'
provenance=json.loads((u/'PROVENANCE.json').read_text())
for entry in provenance['files']+provenance['replacements']:
    assert hashlib.sha256((u/'vendor'/entry['path']).read_bytes()).hexdigest() == entry.get('candidateSha256',entry.get('sha256')), entry['path']
assert (u/'NOTICE.md').is_file()
manifest=json.loads((p/'INSTALLATION.json').read_text())
manifest['uiProvenanceRecordsChecked']=len(provenance['files'])
manifest['deploymentSelfLink']='node_modules/.pnpm/node_modules/@local-durable/terminal -> ../../../..'
(p/'INSTALLATION.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f"PASS installed UI: {len(provenance['files'])} provenance records, all declared replacement hashes, NOTICE.md.")
