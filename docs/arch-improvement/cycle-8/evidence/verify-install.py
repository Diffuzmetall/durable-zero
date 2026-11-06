from pathlib import Path
import hashlib,json
p=Path('/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone').resolve()
c=Path('/tmp/pi-zero-ui-candidate-20261105T2146')
links=[q for q in p.rglob('*') if q.is_symlink()]
escaped=[str(q) for q in links if not q.resolve().is_relative_to(p)]
assert not escaped, escaped
checks={}
for installed,source in [('bin/terminal.mjs','packages/local-terminal/bin/terminal.mjs'),('dist/client.js','packages/local-terminal/dist/client.js'),('node_modules/@local-durable/runtime/dist/main.js','packages/local-runtime/dist/main.js'),('node_modules/@local-durable/runtime/dist/index.js','packages/local-runtime/dist/index.js'),('node_modules/@durable-zero/adapter-pi-durable/dist/index.js','packages/adapter-pi-durable/dist/index.js')]:
    a,b=p/installed,c/source
    checks[installed]=hashlib.sha256(a.read_bytes()).hexdigest()
    assert a.read_bytes()==b.read_bytes(), installed
assert (p/'LICENSE.Zero').read_bytes() == (c/'LICENSE').read_bytes()
result={'prefix':str(p),'candidate':str(c),'symlinksChecked':len(links),'escapingSymlinks':escaped,'checkedHashes':checks,'dependencyScriptsDenied':['@google/genai','protobufjs'],'globalSwitch':False}
(p/'INSTALLATION.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'PASS installed artifact: {len(links)} symlinks remain inside prefix, {len(checks)} entry hashes match; Zero license retained.')
