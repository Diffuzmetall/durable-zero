import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';

// Only the loopback launcher may attest a workspace. Generic remote clients stay unknown.
export class GitFooter {
  text = 'git unknown';
  #cwd;
  #busy = false;
  #closed = false;
  #timer;
  constructor(changed, binding = process.env.DPI_LOCAL_GIT_CWD) {
    this.changed = changed;
    this.binding = binding;
  }
  setWorkspace(cwd) {
    if (cwd === this.#cwd) return;
    this.#cwd = cwd;
    this.text = 'git unknown';
    clearInterval(this.#timer);
    if (!this.binding || cwd !== this.binding) return;
    void this.refresh();
    this.#timer = setInterval(() => void this.refresh(), 5000);
    this.#timer.unref();
  }
  async refresh() {
    const cwd = this.#cwd;
    if (this.#closed || this.#busy || !this.binding || cwd !== this.binding) return;
    this.#busy = true;
    try {
      // Resolve both sides; do not follow a stale attestation into another workspace.
      if (await realpath(cwd) !== this.binding) return;
      const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
      for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES']) delete env[key];
      const result = await new Promise(resolve => execFile('git', ['--no-optional-locks', '-C', cwd, 'status', '--porcelain=v2', '--branch', '--untracked-files=normal'],
        { encoding: 'utf8', timeout: 2000, maxBuffer: 1024 * 1024, env },
        (error, stdout, stderr) => resolve({ error, stdout, stderr })));
      let next;
      if (result.error) next = /not a git repository/.test(result.stderr) ? 'no git' : 'git unavailable';
      else {
        const lines = result.stdout.trimEnd().split('\n');
        const head = lines.find(line => line.startsWith('# branch.head '))?.slice(14);
        const oid = lines.find(line => line.startsWith('# branch.oid '))?.slice(13);
        const ab = lines.find(line => line.startsWith('# branch.ab '))?.match(/\+(\d+) -(\d+)/);
        const name = head === '(detached)' ? `detached ${oid?.slice(0, 7) ?? '?'}` : head;
        const dirty = lines.some(line => line && !line.startsWith('#'));
        // Git branch names are untrusted terminal text, never terminal control sequences.
        next = name ? `git ${name.replace(/[\x00-\x1f\x7f-\x9f]/g, '')}${dirty ? ' *' : ''}${ab && Number(ab[1]) ? ` ↑${ab[1]}` : ''}${ab && Number(ab[2]) ? ` ↓${ab[2]}` : ''}` : 'git unavailable';
      }
      if (!this.#closed && cwd === this.#cwd && next !== this.text) {
        this.text = next;
        this.changed();
      }
    } catch {
      if (!this.#closed && cwd === this.#cwd) this.text = 'git unavailable';
    } finally { this.#busy = false; }
  }
  close() { this.#closed = true; clearInterval(this.#timer); }
}
