#!/usr/bin/env python3
"""Real rich-TTY session switching against an isolated installed Zero candidate."""
import json
import os
from pathlib import Path
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import time

prefix = Path(sys.argv[1]).resolve()
fixture = prefix / 'node_modules/@local-durable/runtime/test-fixtures/provider.ts'
entry = prefix / 'node_modules/@local-durable/runtime/bin/runtime.mjs'
base = Path(tempfile.mkdtemp(prefix='zs-'))
work = base / 'work'
work.mkdir()
catalog_root = base / 'state/pi-durable-zero/sessions'
original = catalog_root / 'original'
mux = str(base / 'tmux.sock')
env = dict(os.environ, HOME=str(base / 'home'), PI_CODING_AGENT_DIR=str(base / 'agent'), PI_ADDITIONAL_EXTENSIONS='', XDG_STATE_HOME=str(base / 'state'))
checks = []
runtimes = {}
pane = None


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)


def until(fn, label, timeout=15):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(.04)
    if pane is not None:
        screen('failure')
    raise AssertionError('Timeout: ' + label)


class RPC:
    def __init__(self, directory):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(5)
        self.sock.connect(str(Path(directory) / '.terminal/runtime.sock'))
        self.stream = self.sock.makefile('r')
        self.id = 0

    def call(self, method, params=None):
        self.id += 1
        self.sock.sendall((json.dumps(dict(jsonrpc='2.0', id=self.id, method=method, params=params or {})) + '\n').encode())
        while True:
            line = self.stream.readline()
            if not line:
                raise RuntimeError('RPC disconnected')
            msg = json.loads(line)
            if msg.get('id') != self.id:
                continue
            if 'error' in msg:
                raise RuntimeError(msg['error'])
            return msg.get('result')

    def close(self):
        self.stream.close()
        self.sock.close()


def call(directory, method, params=None):
    rpc = RPC(directory)
    try:
        return rpc.call(method, params)
    finally:
        rpc.close()


def ready(directory):
    try:
        return call(directory, 'runtime/info')
    except (OSError, RuntimeError):
        return None


def remember(directory):
    info = call(directory, 'runtime/info')
    check('owned runtime identity ' + Path(directory).name, Path(info['entrypoint']).resolve() == entry.resolve() and info['cwd'] == str(work))
    runtimes[str(directory)] = info['pid']
    return info


def tmux(*args, required=True):
    proc = subprocess.run(['tmux', '-S', mux, *args], env=env, capture_output=True, text=True, timeout=8)
    if required and proc.returncode:
        raise RuntimeError(proc.stderr)
    return proc.stdout


def screen(label=None):
    text = tmux('capture-pane', '-p', '-t', pane)
    if label:
        (base / (label + '.txt')).write_text(text)
    return text


def enter(text):
    tmux('send-keys', '-t', pane, '-l', text)
    tmux('send-keys', '-t', pane, 'Enter')


def terminal(name, directory):
    command = ['node']
    command += [str(prefix / 'bin/terminal.mjs'), '--session-dir', str(directory)]
    return tmux('new-session', '-d', '-P', '-F', '#{pane_id}', '-s', name, '-x', '140', '-y', '45', '-c', str(work), shlex.join(command)).strip()


log = (base / 'runtime.log').open('w')
runtime = subprocess.Popen(['node', str(entry), '--session-dir', str(original), '--cwd', str(work), '--provider', 'local-test', '--model', 'scripted'], env=dict(env, PI_ADDITIONAL_EXTENSIONS=str(fixture)), stdout=log, stderr=log)
try:
    until(lambda: (original / '.terminal/runtime.sock').exists() and '"status":"ready"' in (base / 'runtime.log').read_text(), 'runtime ready')
    first = remember(original)
    pane = terminal('first', original)
    tmux('set-option', '-g', 'exit-empty', 'off')
    until(lambda: 'ctx ' in screen(), 'rich editor')
    enter('/name Original session')
    until(lambda: call(original, 'session/getView').get('sessionName') == 'Original session', 'name persisted by host')
    until(lambda: 'Original session' in screen(), 'named title in terminal')
    check('/name persists and renders without replacing native session id', call(original, 'session/getView')['view']['session']['id'] == 'original')
    enter('slow: keep original working')
    until(lambda: 'started:' in screen(), 'native streaming before /new')
    enter('/new')
    next_row = until(lambda: next((row for row in call(original, 'session/list') if row['id'] != str(original)), None), 'new catalog row')
    next_dir = Path(next_row['id'])
    until(lambda: ready(next_dir), 'new runtime ready')
    second = remember(next_dir)
    until(lambda: 'ctx ' in screen() and next_row['name'][:16] in screen(), 'new terminal attached')
    check('/new starts one distinct native runtime', second['pid'] != first['pid'])
    entries = call(next_dir, 'session/getTranscript')['entries']
    check('/new has no copied or replayed prompt', not [e for e in entries if e.get('role') == 'user'])
    check('old native work survives switching', bool(call(original, 'session/getView')['view']['conversation']['docs'].get('pi.live', {}).get('run')))
    enter('/name Second session')
    until(lambda: call(next_dir, 'session/getView').get('sessionName') == 'Second session', 'second rename')
    enter('/resume')
    until(lambda: 'Original session' in screen() and 'Second session' in screen() and 'Resume session' in screen(), 'real host picker')
    screen('01-resume-picker')
    tmux('send-keys', '-t', pane, 'Escape')
    until(lambda: 'Resume session' not in screen(), 'cancel picker')
    enter('/resume')
    until(lambda: 'Resume session' in screen(), 'picker reopened')
    # Host rows are newest first; the original is the second row.
    tmux('send-keys', '-t', pane, 'Down', 'Enter')
    until(lambda: 'Original session' in screen() and 'started:' in screen(), 'original transcript restored')
    screen('02-resumed-original')
    check('/resume reuses original runtime without abort or second Harness', call(original, 'runtime/info')['pid'] == first['pid'])
    check('other runtime remains alive', call(next_dir, 'runtime/info')['pid'] == second['pid'])
    users = [e for e in call(original, 'session/getTranscript')['entries'] if e.get('role') == 'user']
    check('session commands and resume never submit a prompt', len(users) == 1 and users[0]['text'] == 'slow: keep original working')
    call(original, 'session/abort')
    enter('/detach')
    until(lambda: not tmux('list-panes', '-a', required=False).strip(), 'terminal detached')
    pane = terminal('reopened', next_dir)
    until(lambda: 'Second session' in screen(), 'named session after reconnect')
    screen('03-reopened-second')
    check('reconnect restores persistent display name', call(next_dir, 'session/getView')['sessionName'] == 'Second session')
    enter('/detach')
    until(lambda: not tmux('list-panes', '-a', required=False).strip(), 'reopened terminal detached')
    check('detach does not stop either runtime', call(original, 'runtime/info')['pid'] == first['pid'] and call(next_dir, 'runtime/info')['pid'] == second['pid'])
    result = dict(prefix=str(prefix), checks=checks, passed=len(checks), failed=0)
    (base / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
finally:
    # Discover only catalog siblings created in this isolated temporary root, including a failed startup.
    for descriptor in catalog_root.glob('*/.terminal/session.json'):
        directory = descriptor.parent.parent
        try:
            if not (directory / '.terminal/runtime.sock').exists():
                continue
            info = until(lambda: ready(directory), 'owned runtime startup cleanup', timeout=8)
            if Path(info['entrypoint']).resolve() == entry.resolve() and info['cwd'] == str(work):
                runtimes[str(directory)] = info['pid']
        except (OSError, RuntimeError):
            pass
    tmux('kill-server', required=False)
    for directory, pid in runtimes.items():
        try:
            info = call(directory, 'runtime/info')
            if info['pid'] == pid and Path(info['entrypoint']).resolve() == entry.resolve():
                os.kill(pid, signal.SIGTERM)
        except (OSError, RuntimeError):
            pass
    if runtime.poll() is None:
        runtime.terminate()
    runtime.wait(timeout=10)
    log.close()
    print('EVIDENCE=' + str(base))
