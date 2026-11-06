// Read-only catalogue probe: initializes configured servers, never calls an external MCP tool.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const prefix = process.argv[2];
if (!prefix) throw Error('Usage: node mcp-reload-configured-check.mjs INSTALLED_PREFIX');
const { connectRuntime } = await import(pathToFileURL(join(prefix, 'node_modules/@local-durable/runtime/dist/client.js')).href);
const base = await mkdtemp('/tmp/zero-configured-mcp-');
const cwd = join(base, 'workspace'); await mkdir(cwd);
const child = spawn(process.execPath, [join(prefix, 'node_modules/@local-durable/runtime/bin/runtime.mjs'),
  '--session-dir', join(base, 'session'), '--cwd', cwd,
  '--extension', join(prefix, 'node_modules/@local-durable/runtime/test-fixtures/provider.ts'),
  '--provider', 'local-test', '--model', 'scripted'], {
  env: { ...process.env, PI_CODING_AGENT_DIR: join(process.env.HOME, '.pi/agent'), PI_ADDITIONAL_EXTENSIONS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = ''; child.stdout.on('data', c => { stdout += c; });
// Do not export configured-server diagnostics, which may contain private headers/URLs.
child.stderr.on('data', () => {});
const exited = once(child, 'exit'); let client;
async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    if (child.exitCode !== null) throw Error('Isolated runtime exited');
    await delay(40);
  }
  throw Error('Read-only MCP catalogue probe timed out');
}
try {
  await until(() => stdout.includes('"status":"ready"'), 110000);
  client = await connectRuntime(join(base, 'session'));
  const first = await client.request('session/getView');
  const servers = new Map();
  for (const notice of first.view.notices) for (const line of notice.message.split('\n')) {
    const m = line.match(/^\s*([\w-]+): (connected|failed|needs sign-in|disabled)(?:, (\d+) tools)?/);
    if (m) servers.set(m[1], { server: m[1], state: m[2], ...(m[3] ? { tools: Number(m[3]) } : {}) });
  }
  await client.request('session/prompt', { content: 'invoke:' + JSON.stringify({ name: 'codemode', arguments: {
    code: 'text((await searchTools("codegraph")).map(t=>t.name)); text((await searchTools("web_search_exa")).map(t=>t.name));',
  } }) });
  let transcript;
  await until(async () => {
    transcript = await client.request('session/getTranscript');
    return transcript.entries.some(e => e.role === 'assistant' && e.text?.includes('native result:'));
  }, 15000);
  const answer = transcript.entries.filter(e => e.role === 'assistant').at(-1).text;
  console.log(JSON.stringify({ prefix, isolatedUnindexedWorkspace: true,
    provider: 'deterministic local-test (no paid model call)', externalToolCalls: 0,
    status: [...servers.values()], codegraphVisible: answer.includes('mcp__codegraph__'),
    exaVisible: answer.includes('mcp__exa__'),
    scope: 'Catalogue only; connected does not prove real external tool execution. CodeGraph intentionally lists no tools in an unindexed workspace.',
  }, null, 2));
  // This probe reports external authentication/server failures, rather than declaring them passed.
  if (!answer.includes('mcp__exa__')) process.exitCode = 1;
} finally {
  client?.close();
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
  await rm(base, { recursive: true, force: true });
}
