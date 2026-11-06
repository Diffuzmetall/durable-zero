import os,pathlib,subprocess,socket,json,time,select,signal,shlex,traceback,sqlite3,hashlib
P=pathlib.Path('/home/ubuntu/.local/share/pi-durable-zero/candidates/20261105T2146-standalone')
B=pathlib.Path('/tmp/zero-installed.xV2OKa');NODE='/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node'
TERMINAL=P/'bin/terminal.mjs';RUNTIME=P/'node_modules/@local-durable/runtime/bin/runtime.mjs';FIXTURE=P/'node_modules/@durable-zero/adapter-pi-durable/test-fixtures/provider.ts'
SOCKET=str(B/'tmux.sock');COMMANDS=[];CHECKS=[];CHILDREN=[];CLIENTS=[];PANES=[];runtime=None
ENV={'PATH':str(pathlib.Path(NODE).parent)+':/usr/bin:/bin','HOME':str(B/'home'),'XDG_CONFIG_HOME':str(B/'config'),'PI_AGENT_DIR':str(B/'agent'),'PI_ADDITIONAL_EXTENSIONS':'','TMPDIR':str(B),'TERM':'xterm-256color','LANG':'C.UTF-8','COLORTERM':'truecolor'}
work=B/'work';work.mkdir();session=B/'session'
manifest={str(p):{'resolved':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [TERMINAL,RUNTIME,FIXTURE]}
assert all(str(pathlib.Path(v['resolved'])).startswith(str(P)+'/') for v in manifest.values())
(B/'installed-identity.json').write_text(json.dumps(manifest,indent=2))
def record(name,ok,detail=''):
 CHECKS.append({'check':name,'pass':bool(ok),'detail':detail});print(json.dumps(CHECKS[-1]),flush=True)
def until(fn,label,timeout=12):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if fn():return
  time.sleep(.025)
 raise AssertionError('Timeout: '+label)
def tmux(*args,check=True):
 cmd=['tmux','-S',SOCKET,*args];COMMANDS.append(shlex.join(cmd));p=subprocess.run(cmd,env=ENV,text=True,capture_output=True,timeout=8)
 if check and p.returncode:raise RuntimeError(p.stderr)
 return p.stdout
class RPC:
 def __init__(self,name):
  self.sock=socket.socket(socket.AF_UNIX);self.sock.connect(str(session/'.terminal/runtime.sock'));self.sock.setblocking(False);self.buffer=b'';self.messages=[];self.seq=0;self.log=open(B/(name+'.jsonl'),'w');CLIENTS.append(self)
 def pump(self,seconds=.025):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   ready,_,_=select.select([self.sock],[],[],max(0,end-time.monotonic()))
   if not ready:continue
   chunk=self.sock.recv(1048576)
   if not chunk:return
   self.buffer+=chunk
   while b'\n' in self.buffer:
    line,self.buffer=self.buffer.split(b'\n',1)
    if line:
     msg=json.loads(line);self.messages.append(msg);self.log.write(json.dumps(msg)+'\n');self.log.flush()
 def request(self,method,params={}):
  self.seq+=1;seq=self.seq;msg={'jsonrpc':'2.0','id':seq,'method':method,'params':params};self.log.write(json.dumps({'sent':msg})+'\n');self.log.flush();self.sock.sendall((json.dumps(msg)+'\n').encode())
  until(lambda:(self.pump() or any(m.get('id')==seq for m in self.messages)),method)
  response=next(m for m in self.messages if m.get('id')==seq)
  if 'error' in response:raise RuntimeError(response['error'])
  return response['result']
 def events(self):return [m['params']['event'] for m in self.messages if m.get('method')=='session/event']
 def close(self):
  if self.sock.fileno()>=0:self.sock.close();self.log.close()
def screen(pane,label):
 text=tmux('capture-pane','-p','-S','-200','-t',pane);(B/(label+'.screen.txt')).write_text(text);(B/(label+'.screen.ansi')).write_text(tmux('capture-pane','-e','-p','-S','-200','-t',pane));return text
def current(pane):return tmux('capture-pane','-p','-t',pane)
def type_text(pane,text):tmux('send-keys','-t',pane,'-l',text);tmux('send-keys','-t',pane,'Enter')
def pane_dead(pane):return tmux('display-message','-p','-t',pane,'#{pane_dead}').strip()=='1'
def launch_terminal(name):
 cmd=['env','-i',*[k+'='+v for k,v in ENV.items()],NODE,str(TERMINAL),'--session-dir',str(session)];COMMANDS.append(shlex.join(cmd))
 pane=tmux('new-session','-d','-P','-F','#{pane_id}','-s',name,'-x','120','-y','40','-c',str(work),shlex.join(cmd)).strip();PANES.append(pane)
 tmux('set-option','-g','exit-empty','off');tmux('set-window-option','-t',pane,'remain-on-exit','on');tmux('pipe-pane','-o','-t',pane,'tee '+shlex.quote(str(B/(name+'.pty.raw')))+' >/dev/null')
 until(lambda:'scripted' in current(pane),'installed rich UI startup');return pane
def launch_runtime(number):
 args=[NODE,str(RUNTIME),'--session-dir',str(session),'--cwd',str(work),'--extension',str(FIXTURE),'--provider','local-test','--model','scripted'];COMMANDS.append(shlex.join(args));path=B/('runtime-'+str(number)+'.log');log=open(path,'wb')
 child=subprocess.Popen(args,cwd=work,env=ENV,stdout=log,stderr=log,start_new_session=True);log.close();CHILDREN.append(child)
 def ready():
  assert child.poll() is None,path.read_text()
  return '"status":"ready"' in path.read_text()
 until(ready,'installed runtime ready');return child
def users(transcript):return [(e['id'],e.get('text')) for e in transcript['entries'] if e.get('role')=='user']
def save(name,value):(B/name).write_text(json.dumps(value,indent=2))
def wait_turn(r,start,status=None):
 until(lambda:(r.pump() or any(e['type']=='turn_complete' and (status is None or e.get('status')==status) for e in r.events()[start:])),'native turn completion')
try:
 record('only installed entry paths',True,json.dumps(manifest))
 runtime=launch_runtime(1);r=RPC('phase-1-wire');initial=r.request('session/getView');save('initial-view.json',initial);state0=r.request('session/getState');save('initial-state.json',state0)
 record('getView revision envelope',isinstance(initial.get('revision'),int) and 'view' in initial)
 pane=launch_terminal('installed-first');startup=screen(pane,'01-startup');info=tmux('display-message','-p','-t',pane,'#{pane_pid} #{pane_tty} #{pane_current_command}').strip();pid=int(info.split()[0]);fd0=os.readlink('/proc/'+str(pid)+'/fd/0');fd1=os.readlink('/proc/'+str(pid)+'/fd/1')
 record('installed rich UI on real PTY',fd0.startswith('/dev/pts/') and fd0==fd1 and '─' in startup and 'Connected. /abort' not in startup,info+' fd0='+fd0+' fd1='+fd1)
 start=len(r.events());type_text(pane,'plain: installed-short-unique');wait_turn(r,start)
 until(lambda:'started:plain: installed-short-unique' in current(pane),'installed short output');screen(pane,'02-short-final');record('short final output and completion',True)
 start=len(r.events());type_text(pane,'slow: installed-live-abort-unique')
 until(lambda:(r.pump() or any(e['type']=='message_update' for e in r.events()[start:])),'installed live output')
 until(lambda:'installed-live-abort-unique' in current(pane) and current(pane).count('started:')>=2,'installed live screen')
 screen(pane,'03-live-before-abort');record('live output before completion',not any(e['type']=='turn_complete' for e in r.events()[start:]))
 abort_start=time.monotonic();tmux('send-keys','-t',pane,'Escape');wait_turn(r,start,'aborted');screen(pane,'04-aborted');record('Escape abort',True,'latency_ms='+str(round((time.monotonic()-abort_start)*1000,1)))
 start=len(r.events());type_text(pane,'tool: installed-bash-card-unique');until(lambda:(r.pump() or any(e['type']=='tool_execution_start' and e.get('toolName')=='bash' for e in r.events()[start:])),'installed native bash')
 until(lambda:'sleep 1' in current(pane) and 'Running' in current(pane),'installed native Bash card');screen(pane,'05-bash-running');record('native Bash running card',True)
 wait_turn(r,start);until(lambda:'native-work-continued' in current(pane) and 'Exit 0' in current(pane),'installed Bash completed card');screen(pane,'06-bash-completed');record('native Bash completion and Exit 0 card',True)
 (work/'continued.txt').unlink()
 start=len(r.events());type_text(pane,'tool: installed-detached-unique');until(lambda:(r.pump() or any(e['type']=='tool_execution_start' for e in r.events()[start:])),'installed detached bash start')
 assert not (work/'continued.txt').exists();r.close();os.kill(pid,signal.SIGHUP);until(lambda:pane_dead(pane),'installed terminal disconnect',5);detached=time.monotonic()
 assert not (work/'continued.txt').exists(),'marker already exists at terminal exit'
 record('terminal exit leaves runtime alive with zero clients',runtime.poll() is None)
 until(lambda:(work/'continued.txt').exists(),'installed native work with zero clients');record('native Bash continues with zero clients',(work/'continued.txt').read_text()=='native-work-continued','marker_after_exit_ms='+str(round((time.monotonic()-detached)*1000,1)));screen(pane,'07-disconnected')
 r2=RPC('phase-2-wire')
 def detached_complete():
  transcript=r2.request('session/getTranscript');tail=transcript['entries'][-1]
  return tail.get('role')=='assistant' and 'native result:' in tail.get('text','')
 until(detached_complete,'detached final message persisted');before=r2.request('session/getTranscript');save('before-reopen-transcript.json',before)
 pane2=launch_terminal('installed-reopened');until(lambda:'native-work-continued' in current(pane2),'installed reopened history');screen(pane2,'08-reopened');after=r2.request('session/getTranscript');save('after-reopen-transcript.json',after)
 record('reopen preserves all four user entries without duplicates',users(before)==users(after) and len(users(after))==4,str(users(after)))
 type_text(pane2,'/detach');until(lambda:pane_dead(pane2),'installed /detach',5);screen(pane2,'09-detached');record('/detach exits rich terminal only',runtime.poll() is None)
 baseline=r2.request('session/getTranscript');baseline_state=r2.request('session/getState');save('before-graceful-restart.json',baseline);r2.close();runtime.send_signal(signal.SIGTERM);record('graceful runtime stop',runtime.wait(timeout=8)==0)
 runtime=launch_runtime(2);r3=RPC('phase-3-wire');restored=r3.request('session/getTranscript');restored_state=r3.request('session/getState');save('after-graceful-restart.json',restored)
 record('graceful restart preserves session and entry identities',baseline_state['sessionId']==restored_state['sessionId'] and [e['id'] for e in baseline['entries']]==[e['id'] for e in restored['entries']] and users(restored)==users(baseline))
 pane3=launch_terminal('installed-after-restart');until(lambda:'native-work-continued' in current(pane3),'installed rich UI after graceful restart');screen(pane3,'10-after-graceful-restart');record('rich UI reopens after graceful restart',True)
 start=len(r3.events());type_text(pane3,'slow: installed-kill-recovery-unique');until(lambda:(r3.pump() or any(e['type']=='message_update' for e in r3.events()[start:])),'owned active turn before SIGKILL');screen(pane3,'11-before-sigkill')
 crash_before=r3.request('session/getTranscript');save('before-sigkill-transcript.json',crash_before);r3.close();runtime.kill();record('owned runtime receives SIGKILL during active turn',runtime.wait(timeout=5)==-signal.SIGKILL)
 until(lambda:pane_dead(pane3),'rich UI detects killed runtime',8);screen(pane3,'12-runtime-lost');record('rich UI exits when owned runtime disappears',True)
 runtime=launch_runtime(3);r4=RPC('phase-4-wire');recovered=r4.request('session/getTranscript');recovered_state=r4.request('session/getState');save('after-sigkill-transcript.json',recovered);save('after-sigkill-state.json',recovered_state)
 record('SIGKILL recovery keeps session and user identities',recovered_state['sessionId']==baseline_state['sessionId'] and users(recovered)==users(crash_before) and len(users(recovered))==5,str(users(recovered)))
 pane4=launch_terminal('installed-after-sigkill');until(lambda:'installed-kill-recovery-unique' in current(pane4),'recovered rich transcript');screen(pane4,'13-after-sigkill-recovery')
 start=len(r4.events());type_text(pane4,'plain: installed-postkill-unique');wait_turn(r4,start)
 until(lambda:'started:plain: installed-postkill-unique' in current(pane4),'postkill rich answer');screen(pane4,'14-postkill-final');final=r4.request('session/getTranscript');save('final-transcript.json',final)
 record('recovered runtime accepts new rich PTY prompt without replay',users(final)[:5]==users(crash_before) and len(users(final))==6 and users(final)[-1][1]=='plain: installed-postkill-unique')
 type_text(pane4,'/detach');until(lambda:pane_dead(pane4),'postkill /detach',5);screen(pane4,'15-final-detach');record('post-recovery /detach leaves runtime alive',runtime.poll() is None)
 r4.close();runtime.send_signal(signal.SIGTERM);record('final owned runtime graceful shutdown',runtime.wait(timeout=8)==0)
 with sqlite3.connect('file:'+str(session/'session.sqlite')+'?mode=ro',uri=True) as db:integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
 record('real SQLite integrity after recovery',integrity=='ok',integrity)
except Exception as e:
 record('installed acceptance failure',False,str(e));(B/'error.txt').write_text(traceback.format_exc())
 try:
  if PANES:screen(PANES[-1],'failure')
 except Exception:pass
finally:
 for client in CLIENTS:client.close()
 tmux('kill-server',check=False)
 for child in CHILDREN:
  if child.poll() is None:
   child.send_signal(signal.SIGTERM)
   try:child.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=5)
 save('results.json',CHECKS);(B/'commands.txt').write_text('\n'.join(COMMANDS)+'\n');print('ARTIFACTS',B,flush=True)
