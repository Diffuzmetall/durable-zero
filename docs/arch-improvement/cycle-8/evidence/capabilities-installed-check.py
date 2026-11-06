#!/usr/bin/env python3
"""Isolated installed-artifact acceptance. Requires Node >=24.19 and tmux.
Usage: python3 capabilities-installed-check.py PREFIX INSTALLED_PROVIDER_FIXTURE
Never attaches to existing tmux/Rex sessions. Keeps its temporary evidence directory.
"""
import json
import os
from pathlib import Path
import select
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import time

prefix = Path(sys.argv[1]).resolve()
fixture = Path(sys.argv[2]).resolve()
base = Path(tempfile.mkdtemp(prefix='zero-capabilities-installed-'))
work = base / 'workspace'
work.mkdir()
skill = work / '.pi/skills/example/SKILL.md'
skill.parent.mkdir(parents=True)
skill.write_text('---\nname: example\ndescription: Installed example skill\n---\nINSTALLED_SKILL_BODY\n')
session = base / 'session'
env = dict(os.environ, HOME=str(base / 'home'), PI_CODING_AGENT_DIR=str(base / 'agent'),
           XDG_CONFIG_HOME=str(base / 'config'), PI_ADDITIONAL_EXTENSIONS='', TERM='xterm-256color')
results = []
runtime = None
rpc = None
mux = str(base / 'tmux.sock')

def check(name, condition):
    results.append({'check': name, 'pass': bool(condition)})
    print(json.dumps(results[-1]), flush=True)
    assert condition, name

def until(fn, label, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(.03)
    raise AssertionError('Timeout: ' + label)

def tmux(*args, required=True):
    p = subprocess.run(['tmux', '-S', mux, *args], capture_output=True, text=True, env=env, timeout=8)
    if required:
        assert p.returncode == 0, p.stderr
    return p.stdout

def screen(label=None):
    text = tmux('capture-pane', '-p', '-S', '-150', '-t', pane)
    if label:
        (base / (label + '.txt')).write_text(text)
    return text

def enter(text):
    tmux('send-keys', '-t', pane, '-l', text)
    tmux('send-keys', '-t', pane, 'Enter')

class RPC:
    def __init__(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.connect(str(session / '.terminal/runtime.sock'))
        self.buffer = b''
        self.seq = 0
    def request(self, method, params=None):
        self.seq += 1
        self.sock.sendall((json.dumps({'jsonrpc': '2.0', 'id': self.seq, 'method': method, 'params': params or {}}) + '\n').encode())
        end = time.monotonic() + 8
        while time.monotonic() < end:
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                msg = json.loads(line)
                if msg.get('id') == self.seq:
                    if 'error' in msg:
                        raise RuntimeError(msg['error'])
                    return msg['result']
            if select.select([self.sock], [], [], .2)[0]:
                chunk = self.sock.recv(1048576)
                assert chunk, 'runtime closed connection'
                self.buffer += chunk
        raise AssertionError('RPC timeout: ' + method)
    def close(self):
        self.sock.close()

def transcript():
    # Native transcripts also contain system/tool entries without a message role.
    return [entry for entry in rpc.request('session/getTranscript')['entries']
            if entry.get('role') in ('user', 'assistant')]

def launch_terminal(name):
    command = ['node', str(prefix / 'bin/terminal.mjs'), '--session-dir', str(session)]
    target = tmux('new-session', '-d', '-P', '-F', '#{pane_id}', '-s', name, '-x', '140', '-y', '45', '-c', str(work), shlex.join(command)).strip()
    tmux('set-option', '-g', 'exit-empty', 'off')
    return target

try:
    links = list(prefix.rglob('*'))
    external = [str(p) for p in links if p.is_symlink() and not p.resolve().is_relative_to(prefix)]
    check('standalone symlink closure', not external)
    check('provider fixture belongs to installed prefix', fixture.is_relative_to(prefix))
    with (base / 'runtime.log').open('wb') as log:
        runtime = subprocess.Popen(['node', str(prefix / 'node_modules/@local-durable/runtime/bin/runtime.mjs'),
            '--session-dir', str(session), '--cwd', str(work), '--extension', str(fixture),
            '--provider', 'local-test', '--model', 'scripted'], env=env, stdout=log, stderr=log, start_new_session=True)
    until(lambda: '"status":"ready"' in (base / 'runtime.log').read_text(), 'runtime ready')
    rpc = RPC()
    resources = rpc.request('session/getView')['resources']
    check('installed native catalogue', resources['enableSkillCommands'] and any(s['name'] == 'example' for s in resources['skills']))
    pane = launch_terminal('skills')
    until(lambda: 'scripted' in screen(), 'rich UI ready')
    terminal_pid = int(tmux('display-message', '-p', '-t', pane, '#{pane_pid}').strip())
    fd0 = os.readlink('/proc/' + str(terminal_pid) + '/fd/0')
    check('installed rich UI has real PTY', fd0.startswith('/dev/pts/') and os.readlink('/proc/' + str(terminal_pid) + '/fd/1') == fd0)
    startup = screen('01-startup')
    check('optional warning panels hidden', 'Attention state unavailable' not in startup and 'Native automation state unavailable' not in startup)
    enter('/skill-selector example')
    until(lambda: 'Installed example skill' in screen(), 'skill picker')
    tmux('send-keys', '-t', pane, 'Enter')
    until(lambda: '/skill:example' in screen(), 'skill inserted')
    check('picker is insertion-only', not any(e['role'] == 'user' for e in transcript()))
    enter('installed arguments')
    until(lambda: any(e['role'] == 'assistant' and 'INSTALLED_SKILL_BODY' in e.get('text', '') for e in transcript()), 'expanded skill completion')
    inputs = [e for e in transcript() if e['role'] == 'user']
    check('rich Enter submits expanded skill and arguments', len(inputs) == 1 and 'installed arguments' in inputs[0]['text'] and '<skill name="example"' in inputs[0]['text'])
    screen('02-skill-completed')
    enter('/skill:missing retained-draft')
    until(lambda: 'Unknown skill' in screen(), 'genuine skill error')
    screen('03-error-dialog')
    tmux('send-keys', '-t', pane, 'Escape')
    until(lambda: '/skill:missing retained-draft' in screen(), 'draft restored after closing error dialog')
    screen('03-error-and-draft')
    check('skill rejection preserves editor and admits nothing', '/skill:missing retained-draft' in screen() and len([e for e in transcript() if e['role'] == 'user']) == 1)
    tmux('send-keys', '-t', pane, 'C-c')
    enter('slow: before-followup')
    until(lambda: any(e['role'] == 'user' and e.get('text', '').startswith('slow:') for e in transcript()), 'busy turn admitted')
    tmux('send-keys', '-t', pane, '-l', '/skill:example queued arguments')
    tmux('send-keys', '-t', pane, 'Escape', 'Enter')
    until(lambda: sum(e['role'] == 'assistant' and 'INSTALLED_SKILL_BODY' in e.get('text', '') for e in transcript()) == 2, 'queued skill follow-up')
    check('Alt+Enter queues expanded native follow-up', any(e['role'] == 'user' and 'queued arguments' in e.get('text', '') for e in transcript()))
    screen('04-followup')
    enter('tool: installed disconnect')
    until(lambda: 'sleep 1' in screen(), 'native Bash started')
    rpc.close()
    rpc = None
    check('native tool is still running before disconnect', not (work / 'continued.txt').exists())
    os.kill(terminal_pid, signal.SIGHUP)
    until(lambda: not tmux('list-panes', '-a', required=False).strip(), 'terminal disconnected')
    check('terminal detach leaves runtime alive', runtime.poll() is None)
    until(lambda: (work / 'continued.txt').exists(), 'native Bash with no connected clients')
    check('native Bash continues without any terminal or observer', (work / 'continued.txt').read_text() == 'native-work-continued')
    rpc = RPC()
    until(lambda: any(e['role'] == 'assistant' and 'native result:' in e.get('text', '') for e in transcript()), 'detached completion persisted')
    before = [e['id'] for e in transcript()]
    pane = launch_terminal('reconnected')
    until(lambda: 'queued arguments' in screen(), 'history restored')
    check('reconnect does not replay prompts', [e['id'] for e in transcript()] == before)
    screen('05-reconnected')
    enter('/detach')
    until(lambda: not tmux('list-panes', '-a', required=False).strip(), 'reconnected terminal detached')
finally:
    if rpc:
        rpc.close()
    tmux('kill-server', required=False)
    if runtime and runtime.poll() is None:
        runtime.send_signal(signal.SIGTERM)
        runtime.wait(timeout=8)
    (base / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print('EVIDENCE=' + str(base), flush=True)
