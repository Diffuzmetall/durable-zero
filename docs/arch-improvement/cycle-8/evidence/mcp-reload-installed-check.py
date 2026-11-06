#!/usr/bin/env python3
"""Installed short-command/rich-PTY acceptance; deterministic model, real MCP and Harness.
Usage: python3 mcp-reload-installed-check.py PREFIX INSTALLED_PROVIDER INSTALLED_MCP_PEER
Includes the original SDK /mcp manager controls, editor restoration and UI disconnect.
Creates only its own tmux server, workspace and session. Never attaches to a user's tab.
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

prefix, provider, peer = [Path(p).resolve() for p in sys.argv[1:4]]
base = Path(tempfile.mkdtemp(prefix='zero-mcp-installed-'))
work, session, agent = [base / name for name in ('workspace', 'session', 'agent')]
work.mkdir(); agent.mkdir()
env = dict(os.environ, HOME=str(base / 'home'), PI_CODING_AGENT_DIR=str(agent),
           PI_ADDITIONAL_EXTENSIONS='', XDG_CONFIG_HOME=str(base / 'config'), TERM='xterm-256color')
mux = str(base / 'tmux.sock')
results, rpc, runtime_pid = [], None, None

def check(name, ok):
    results.append({'check': name, 'pass': bool(ok)})
    print(json.dumps(results[-1]), flush=True)
    assert ok, name

def until(fn, label, timeout=18):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(.03)
    raise AssertionError('Timeout: ' + label)

def tmux(*args, required=True):
    p = subprocess.run(['tmux', '-S', mux, *args], env=env, capture_output=True, text=True, timeout=8)
    if required:
        assert p.returncode == 0, p.stderr
    return p.stdout

def screen(label=None):
    value = tmux('capture-pane', '-p', '-S', '-180', '-t', pane)
    if label:
        (base / (label + '.txt')).write_text(value)
    return value

def menu_screen():
    return tmux('capture-pane', '-p', '-t', pane)

def keys(*values):
    for value in values:
        tmux('send-keys', '-t', pane, value)
        time.sleep(.04)  # Let the real PTY/native selector paint before the next human key.

def choose(label):
    def selected():
        for line in menu_screen().splitlines():
            if line.strip().startswith('→ '):
                return line.strip()[2:].lstrip('✓ ').split('  ')[0].strip()
    until(selected, 'native menu selection')
    keys('PPage')
    for _ in range(8):
        current = selected()
        if current == label:
            keys('Enter')
            return
        keys('Down')
        until(lambda: selected() and selected() != current, 'native selection advances')
    raise AssertionError('Native menu item not found: ' + label)

def enter(value):
    tmux('send-keys', '-t', pane, '-l', value)
    tmux('send-keys', '-t', pane, 'Enter')

class RPC:
    def __init__(self):
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.connect(str(session / '.terminal/runtime.sock'))
        self.buffer, self.seq = b'', 0
    def request(self, method):
        self.seq += 1
        self.sock.sendall((json.dumps({'jsonrpc': '2.0', 'id': self.seq, 'method': method, 'params': {}}) + '\n').encode())
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            while b'\n' in self.buffer:
                line, self.buffer = self.buffer.split(b'\n', 1)
                msg = json.loads(line)
                if msg.get('id') == self.seq:
                    assert 'error' not in msg, msg.get('error')
                    return msg['result']
            if select.select([self.sock], [], [], .2)[0]:
                chunk = self.sock.recv(1048576)
                assert chunk, 'runtime disconnected'
                self.buffer += chunk
        raise AssertionError('RPC timeout: ' + method)
    def close(self):
        self.sock.close()

def transcript():
    return rpc.request('session/getTranscript')['entries']

def assistant_has(text):
    return any(e.get('role') == 'assistant' and text in e.get('text', '') for e in transcript())

def config(generation):
    (agent / 'mcp.json').write_text(json.dumps({'mcpServers': {'fixture': {
        'command': str(Path(subprocess.check_output(['which', 'node'], text=True).strip()).resolve()),
        'args': [str(peer), generation, '600'], 'exposure': 'codemode',
        'env': {'ZERO_MCP_TRACE': str(base / 'peer.trace')}
    }}}))

entry = prefix / 'bin/pi-durable-zero.mjs'
def launch(first):
    command = [str(entry), '--cwd', str(work), '--session-dir', str(session)]
    if first:
        command += ['--extension', str(provider), '--provider', 'local-test', '--model', 'scripted']
    target = tmux('new-session', '-d', '-P', '-F', '#{pane_id}', '-s', 'first' if first else 'reopen',
                  '-x', '140', '-y', '45', '-c', str(work), shlex.join(command)).strip()
    tmux('set-option', '-g', 'exit-empty', 'off')
    return target

invocation = 'invoke:' + json.dumps({'name': 'codemode', 'arguments': {
    'code': 'text(await searchTools("zero_probe")); text(await tools.mcp__fixture__zero_probe({}));'
}}, separators=(',', ':'))
try:
    links = [p for p in prefix.rglob('*') if p.is_symlink()]
    check('installed dependency closure', all(p.exists() and p.resolve().is_relative_to(prefix) for p in links))
    check('fixtures belong to installed prefix', provider.is_relative_to(prefix) and peer.is_relative_to(prefix))
    check('short command entry is executable', os.access(entry, os.X_OK))
    config('INSTALLED_MCP_V1')
    pane = launch(True)
    until(lambda: 'scripted' in screen(), 'launcher and rich terminal ready')
    rpc = RPC()
    info = rpc.request('runtime/info'); runtime_pid = info['pid']
    initial = rpc.request('session/getView')
    pane_pid = int(tmux('display-message', '-p', '-t', pane, '#{pane_pid}').strip())
    check('launcher uses actual rich PTY', os.readlink(f'/proc/{pane_pid}/fd/0').startswith('/dev/pts/'))
    check('runtime belongs to installed prefix', Path(info['entrypoint']).resolve().is_relative_to(prefix))
    enter('/mcp')
    until(lambda: 'MCP servers' in menu_screen() and 'fixture' in menu_screen(), 'original SDK root manager')
    screen('00a-manager-root')
    check('bare /mcp opens the original SDK manager in the actual rich PTY', True)
    keys('Enter')
    until(lambda: 'Reconnect' in menu_screen() and 'Disable' in menu_screen(), 'original SDK server manager')
    choose('Exposure')
    until(lambda: 'deferred' in menu_screen() and 'direct' in menu_screen(), 'native exposure selector')
    screen('00b-exposure')
    choose('direct')
    until(lambda: json.loads((agent / 'mcp.json').read_text())['mcpServers']['fixture'].get('exposure') == 'direct', 'saved direct exposure')
    check('native exposure control saves direct exposure', True)
    until(lambda: 'Reconnect' in menu_screen(), 'server menu after exposure change')
    choose('Exposure')
    until(lambda: 'deferred' in menu_screen(), 'exposure selector reopened')
    choose('codemode')
    until(lambda: json.loads((agent / 'mcp.json').read_text())['mcpServers']['fixture'].get('exposure', 'codemode') == 'codemode', 'restored codemode exposure')
    until(lambda: 'Reconnect' in menu_screen(), 'server menu after exposure reset')
    choose('Tools')
    until(lambda: 'zero_probe' in menu_screen(), 'original offered tools screen')
    screen('00c-offered-tools')
    check('native manager displays actual MCP tool schemas', True)
    keys('Escape')
    until(lambda: 'Reconnect' in menu_screen(), 'return from tools')
    reconnects = (base / 'peer.trace').read_text().count('initialize\n')
    choose('Reconnect')
    until(lambda: (base / 'peer.trace').read_text().count('initialize\n') > reconnects and 'State: connected' in menu_screen(), 'manager reconnect settled')
    check('native reconnect reopens the actual peer', True)
    choose('Disable')
    until(lambda: json.loads((agent / 'mcp.json').read_text())['mcpServers']['fixture'].get('enabled') is False and 'Enable' in menu_screen(), 'native server disable')
    screen('00d-disabled')
    check('native disable saves configuration and refreshes manager', True)
    choose('Enable')
    until(lambda: json.loads((agent / 'mcp.json').read_text())['mcpServers']['fixture'].get('enabled') is not False and 'connected' in menu_screen() and 'Tools' in menu_screen(), 'native server enable')
    check('native enable reconnects the actual peer', True)
    tmux('resize-window', '-t', pane, '-x', '100', '-y', '38')
    until(lambda: 'fixture' in menu_screen(), 'manager resize')
    check('manager remains usable after actual PTY resize', True)
    keys('Escape')
    until(lambda: 'MCP servers' in menu_screen(), 'manager returns to root')
    keys('Escape')
    until(lambda: 'scripted' in menu_screen() and 'MCP servers' not in menu_screen(), 'Escape restores the rich editor')
    tmux('resize-window', '-t', pane, '-x', '140', '-y', '45')
    check('manager commands do not become native user prompts', not any(e.get('role') == 'user' for e in transcript()))
    enter(invocation)
    until(lambda: assistant_has('INSTALLED_MCP_V1'), 'real installed MCP call')
    check('native MCP call reached real server', (base / 'peer.trace').read_text().count('tools/call\n') == 1)
    screen('01-mcp')
    check('editor resumes after manager Escape and admits a real native MCP call', True)
    enter('/mcp')
    until(lambda: 'MCP servers' in menu_screen(), 'manager before terminal disconnection')
    keys('Enter')
    until(lambda: 'Reconnect' in menu_screen(), 'nested manager before disconnection')
    tmux('kill-pane', '-t', pane)
    def reload_after_disconnect():
        try:
            rpc.request('session/reload')
            return True
        except AssertionError as error:
            if 'close the MCP manager' in str(error):
                return False
            raise
    until(reload_after_disconnect, 'disconnected manager released its native UI')
    check('nested manager disconnect releases only UI and preserves runtime PID', rpc.request('runtime/info')['pid'] == runtime_pid)
    pane = launch(False)
    until(lambda: 'scripted' in menu_screen(), 'rich editor reconnects after manager disconnect')
    check('manager reconnect does not replay prompt', sum(e.get('role') == 'user' for e in transcript()) == 1)
    config('INSTALLED_MCP_V2')
    skill = work / '.pi/skills/reloaded/SKILL.md'
    skill.parent.mkdir(parents=True)
    skill.write_text('---\nname: reloaded\ndescription: Installed reloaded skill\n---\nINSTALLED_RELOADED_BODY\n')
    enter('/reload')
    until(lambda: any(s['name'] == 'reloaded' for s in rpc.request('session/getView')['resources']['skills']), 'rich /reload')
    updated = rpc.request('session/getView')
    check('rich reload preserves native session and runtime PID', updated['view']['session']['id'] == initial['view']['session']['id'] and rpc.request('runtime/info')['pid'] == runtime_pid)
    check('reload publishes a newer view revision', updated['revision'] > initial['revision'])
    enter('/skill:reloaded')
    until(lambda: assistant_has('INSTALLED_RELOADED_BODY'), 'new skill through rich input')
    check('rich UI accepts the refreshed skill catalogue', True)
    enter(invocation)
    until(lambda: assistant_has('INSTALLED_MCP_V2'), 'new MCP generation after reload')
    check('reload reconnected the actual MCP peer', (base / 'peer.trace').read_text().count('tools/call\n') == 2)
    screen('02-reloaded')
    enter('slow: installed busy reload')
    until(lambda: any(e.get('role') == 'user' and e.get('text') == 'slow: installed busy reload' for e in transcript()), 'busy native input')
    enter('/reload')
    until(lambda: 'Cannot reload: active work' in screen(), 'busy reload error')
    screen('03-busy-error')
    check('rich reload refuses active work', True)
    tmux('send-keys', '-t', pane, 'Escape')
    until(lambda: 'Cannot submit:' not in screen(), 'error dialog closed')
    # Error recovery deliberately restores /reload. Move to the end and remove its seven characters.
    tmux('send-keys', '-t', pane, 'End', *(['BSpace'] * 7))
    until(lambda: '\n> /reload' not in screen(), 'restored test draft cleared')
    tmux('send-keys', '-t', pane, 'C-c')
    until(lambda: not rpc.request('session/getView')['view']['conversation']['docs'].get('pi.live', {}).get('generation'), 'native abort')
    enter('tool: installed detached launcher')
    until(lambda: 'sleep 1' in screen(), 'native Bash running')
    rpc.close(); rpc = None
    tmux('kill-pane', '-t', pane)
    until(lambda: (work / 'continued.txt').exists(), 'work completed without terminal or observer')
    check('Bash continues after launcher terminal disconnect', (work / 'continued.txt').read_text() == 'native-work-continued')
    pane = launch(False)
    until(lambda: 'scripted' in screen(), 'short command reconnect')
    rpc = RPC()
    until(lambda: assistant_has('native-work-continued'), 'committed Bash completion')
    check('same command reuses runtime PID without prompt replay', rpc.request('runtime/info')['pid'] == runtime_pid and sum(e.get('role') == 'user' for e in transcript()) == 5)
    screen('04-reconnected')
except Exception:
    try:
        screen('99-failure')
    except AssertionError:
        pass
    if rpc:
        (base / 'failure-transcript.json').write_text(json.dumps(transcript(), indent=2))
    raise
finally:
    if rpc:
        rpc.close()
    tmux('kill-server', required=False)
    if runtime_pid:
        proc = Path(f'/proc/{runtime_pid}/cmdline')
        if proc.exists():
            args = proc.read_bytes().split(b'\0')
            expected = (prefix / 'node_modules/@local-durable/runtime/bin/runtime.mjs').resolve()
            if any(arg.endswith(b'/bin/runtime.mjs') and Path(os.fsdecode(arg)).resolve() == expected for arg in args) and str(session).encode() in args:
                os.kill(runtime_pid, signal.SIGTERM)
                until(lambda: not proc.exists() or (Path(f'/proc/{runtime_pid}/stat').read_text().split()[2] == 'Z'), 'owned runtime stops after acceptance')
    (base / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print('EVIDENCE=' + str(base), flush=True)
