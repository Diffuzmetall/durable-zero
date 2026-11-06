import json, os, socket, subprocess, tempfile, time, pathlib, sys
C = pathlib.Path(sys.argv[1])
base = pathlib.Path(tempfile.mkdtemp(prefix='zero-pressure-'))
os.chmod(base, 0o700)
env = dict(os.environ, HOME=str(base/'home'), PI_AGENT_DIR=str(base/'agent'), XDG_CONFIG_HOME=str(base/'config'), PI_ADDITIONAL_EXTENSIONS='')
log = open(base/'runtime.log', 'w+')
args = ['node', str(C/'packages/local-runtime/bin/runtime.mjs'), '--session-dir', str(base/'session'), '--cwd', str(base), '--extension', str(C/'packages/local-runtime/test/fixtures/provider.ts'), '--provider', 'local-test', '--model', 'scripted']
p = subprocess.Popen(args, env=env, stdout=log, stderr=log)
good = bad = flood = None
try:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        log.flush(); log.seek(0)
        if '"status":"ready"' in log.read(): break
        if p.poll() is not None: raise RuntimeError('Runtime startup failed')
        time.sleep(.02)
    else: raise TimeoutError('Runtime ready')
    path = str(base/'session/.terminal/runtime.sock')
    bad = socket.socket(socket.AF_UNIX); bad.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024); bad.connect(path)
    good = socket.socket(socket.AF_UNIX); good.settimeout(10); good.connect(path)
    reader = good.makefile('rb')
    seq = 0
    def request(method, params={}):
        global seq
        seq += 1
        good.sendall((json.dumps(dict(jsonrpc='2.0',id=seq,method=method,params=params))+'\n').encode())
        while True:
            line = reader.readline()
            if not line: raise RuntimeError('Healthy client disconnected')
            msg = json.loads(line)
            if msg.get('id') == seq:
                if 'error' in msg: raise RuntimeError(str(msg['error']))
                return msg.get('result')
    request('session/prompt', {'content':'tool: pressure '+('x'*600000)})
    deadline = time.monotonic() + 10
    while not (base/'continued.txt').exists() and time.monotonic() < deadline:
        request('session/getState'); time.sleep(.02)
    assert (base/'continued.txt').read_text() == 'native-work-continued'
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        transcript = request('session/getTranscript', {'limit':1000})
        if any('native result:' in e.get('text','') for e in transcript['entries']): break
        time.sleep(.02)
    else: raise TimeoutError('Native completion')
    expected = request('session/getView')['revision']
    bad.settimeout(10)
    stalled_reader = bad.makefile('rb')
    views = 0
    drained = 0
    events = []
    while True:
        line = stalled_reader.readline()
        assert line, 'The stalled reader must resume without disconnection'
        drained += len(line)
        msg = json.loads(line)
        if msg.get('method') == 'session/event': events.append(msg['params']['event']['type'])
        if msg.get('method') == 'session/view':
            views += 1
            if msg['params']['revision'] >= expected: break
    assert views < expected, (views, expected)
    assert drained < 20 * 1024 * 1024, drained
    assert p.poll() is None
    request('session/getState')
    flood = socket.socket(socket.AF_UNIX); flood.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024); flood.connect(path)
    flood.sendall(b''.join((json.dumps(dict(jsonrpc='2.0',id=i,method='session/getView',params={}))+'\n').encode() for i in range(1,31)))
    time.sleep(.3)
    flood.settimeout(5)
    flood_bytes = 0
    while True:
        chunk = flood.recv(65536)
        if not chunk: break
        flood_bytes += len(chunk)
    assert flood_bytes < 4 * 1024 * 1024, flood_bytes
    request('session/getState')
    result = {'pass':True,'candidate':str(C),'latestRevision':expected,'stalledViewsReceived':views,'drainedBytes':drained,'causalEvents':events,'nativeBash':'completed','healthyReader':'connected','stalledReader':'resumed','responseFlood':'bounded-disconnect','responseFloodWireBytes':flood_bytes}
    (base/'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result)); print('Evidence:', base)
finally:
    if good: good.close()
    if bad: bad.close()
    if flood: flood.close()
    if p.poll() is None:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill(); p.wait()
    log.close()
