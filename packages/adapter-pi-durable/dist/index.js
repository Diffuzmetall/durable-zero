// packages/adapter-pi-durable/src/store.ts
import { basename, join as join3, resolve as resolve2 } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createSession,
  defineDocFamily
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

// packages/adapter-pi-durable/src/session-lock-eviction.ts
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";

// packages/core/src/shared/errors.ts
var DurableHarnessError = class extends Error {
  code;
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = new.target.name;
    this.code = code;
  }
};
var DurableStorageError = class extends DurableHarnessError {
  constructor(message, cause, code = "STORAGE_ERROR") {
    super(message, code, cause);
  }
};

// packages/adapter-pi-durable/src/session-lock-eviction.ts
function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function isVerifiedRunnerProcess(owner) {
  if (!isProcessAlive(owner.pid)) return false;
  try {
    const output = execFileSync("ps", ["-p", String(owner.pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 1e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return output.includes("node") || output.includes("runner") || output.includes("durable") || output.includes("bb");
  } catch {
    return false;
  }
}
function logUnexpectedErr(err, allowedCode, context) {
  if (err?.code !== allowedCode) {
    console.warn(`[SessionStorage] ${context}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function writeOwnerFile(directory, owner) {
  await writeFile(join(directory, "session.owner.json"), JSON.stringify(owner, null, 2), "utf8");
}
async function readOwnerFile(directory) {
  try {
    const content = await readFile(join(directory, "session.owner.json"), "utf8");
    return JSON.parse(content);
  } catch (err) {
    logUnexpectedErr(err, "ENOENT", `Corrupted or unreadable session.owner.json in ${directory}`);
    return null;
  }
}
async function removeOwnerFile(directory) {
  await rm(join(directory, "session.owner.json"), { force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `Failed to remove owner file in ${directory}`)
  );
}
async function forceUnlock(directory) {
  await lockfile.unlock(directory, { realpath: false }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `unlock warning for ${directory}`)
  );
  await rm(`${directory}.lock`, { recursive: true, force: true }).catch(
    (err) => logUnexpectedErr(err, "ENOENT", `lockfile cleanup warning for ${directory}`)
  );
}
async function acquireSessionLock(directory, cwd, id) {
  const lockOpts = { realpath: false, retries: { retries: 2, minTimeout: 100, maxTimeout: 200 } };
  let rawRelease;
  try {
    rawRelease = await lockfile.lock(directory, lockOpts);
  } catch (initialErr) {
    let owner = await readOwnerFile(directory);
    if (!owner) {
      await new Promise((r) => setTimeout(r, 100));
      owner = await readOwnerFile(directory);
    }
    if (!owner) throw new Error(`Session is already open in another process: ${directory}`, { cause: initialErr });
    const isAlive = isProcessAlive(owner.pid);
    const isRunner = isAlive && isVerifiedRunnerProcess(owner);
    if (!isAlive || !isRunner) {
      await forceUnlock(directory);
      await removeOwnerFile(directory);
      try {
        rawRelease = await lockfile.lock(directory, lockOpts);
      } catch (retryErr) {
        throw new DurableStorageError(`Session is already open in another process (PID: ${owner.pid}): ${directory}`, retryErr);
      }
    } else {
      throw new DurableStorageError(`Session is already open in another live process (PID: ${owner.pid}): ${directory}`, initialErr);
    }
  }
  await writeOwnerFile(directory, { pid: process.pid, id, cwd, startedAt: Date.now() });
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await removeOwnerFile(directory);
    } finally {
      await rawRelease();
    }
  };
}

// packages/adapter-pi-durable/src/session-fork.ts
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join as join2, resolve } from "node:path";
function forkSessionDatabase(options) {
  let sourceDir = resolve(options.sourceDir);
  if (sourceDir.endsWith(".sqlite")) {
    sourceDir = resolve(sourceDir, "..");
  }
  const sourceDb = join2(sourceDir, "session.sqlite");
  if (!existsSync(sourceDir) || !existsSync(sourceDb)) {
    throw new Error(`Cannot fork: source session database not found for "${options.sourceDir}"`);
  }
  let targetDir = resolve(options.targetDir);
  if (targetDir.endsWith(".sqlite")) {
    targetDir = resolve(targetDir, "..");
  }
  mkdirSync(targetDir, { recursive: true });
  const targetDb = join2(targetDir, "session.sqlite");
  for (const suffix of ["", "-wal", "-shm"]) {
    const targetFile = `${targetDb}${suffix}`;
    if (existsSync(targetFile)) rmSync(targetFile, { force: true });
  }
  const sourceConn = new DatabaseSync(sourceDb);
  try {
    try {
      sourceConn.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
    }
    const escapedTarget = targetDb.replace(/'/g, "''");
    sourceConn.exec(`VACUUM INTO '${escapedTarget}';`);
  } finally {
    sourceConn.close();
  }
  const db = new DatabaseSync(targetDb);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    if (options.checkpointId !== void 0) {
      const entryId = Number(options.checkpointId);
      if (Number.isFinite(entryId) && entryId > 0) {
        const hasEntries = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "entries");
        if (hasEntries) {
          db.prepare("DELETE FROM entries WHERE id > ?").run(entryId);
        }
        const hasTasks = db.prepare("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?").get("table", "tasks");
        if (hasTasks) {
          db.prepare("DELETE FROM tasks WHERE id > ?").run(entryId);
        }
      }
    }
  } finally {
    db.close();
  }
  const targetLockDir = `${targetDir}.lock`;
  if (existsSync(targetLockDir)) {
    rmSync(targetLockDir, { recursive: true, force: true });
  }
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.endsWith(".lock") || entry.name === ".lock" || entry.name === "session.owner.json") {
        rmSync(join2(targetDir, entry.name), { recursive: true, force: true });
      }
    }
  }
}

// packages/adapter-pi-durable/src/store.ts
var genericDocFamily = defineDocFamily({
  checkpointWhen: () => false,
  kind: "dz.document",
  version: 1,
  scope: "session",
  initial: () => ({})
});
var PiDurableSessionStore = class {
  sessionDir;
  cwd;
  releaseLockFn = null;
  sessionInstance = null;
  constructor(options) {
    this.sessionDir = resolve2(options.sessionDir);
    this.cwd = options.cwd ? resolve2(options.cwd) : process.cwd();
  }
  get isLocked() {
    return this.releaseLockFn !== null;
  }
  async getSession() {
    if (!this.sessionInstance) {
      const dbPath = join3(this.sessionDir, "session.sqlite");
      const storage = await openNodeSqliteStorage(dbPath);
      this.sessionInstance = createSession(storage);
    }
    return this.sessionInstance;
  }
  async acquireLock() {
    if (this.isLocked) throw new Error(`Lock already held for session: ${this.sessionDir}`);
    const id = basename(this.sessionDir);
    this.releaseLockFn = await acquireSessionLock(this.sessionDir, this.cwd, id);
  }
  async releaseLock() {
    if (this.releaseLockFn) {
      const release = this.releaseLockFn;
      this.releaseLockFn = null;
      await release();
    }
  }
  async saveDocument(collection, docId, data) {
    const session = await this.getSession();
    await session.commit(async (tx) => {
      const doc = await tx.doc(genericDocFamily, `${collection}:${docId}`);
      for (const key of Object.keys(doc)) {
        delete doc[key];
      }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        Object.assign(doc, structuredClone(data));
      } else {
        doc._value = structuredClone(data);
      }
    }, BACKGROUND_CONTEXT);
  }
  async readDocument(collection, docId) {
    const session = await this.getSession();
    const snap = await session.snapshot(genericDocFamily, `${collection}:${docId}`, BACKGROUND_CONTEXT);
    if (!snap || Object.keys(snap).length === 0) return void 0;
    if ("_value" in snap && Object.keys(snap).length === 1) {
      return snap._value;
    }
    return structuredClone(snap);
  }
  async forkSession(checkpointId, newSessionDir) {
    forkSessionDatabase({ sourceDir: this.sessionDir, targetDir: newSessionDir, checkpointId });
  }
  watchTasks(onUpdate) {
    onUpdate([]);
    return { close: () => {
    } };
  }
  async close() {
    if (this.sessionInstance) {
      const session = this.sessionInstance;
      this.sessionInstance = null;
      await session.close(BACKGROUND_CONTEXT);
    }
    await this.releaseLock();
  }
};

// packages/adapter-pi-durable/src/session-storage.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename as basename2, join as join4, resolve as resolve3 } from "node:path";
function getAgentDir() {
  const custom = process.env.PI_CODING_AGENT_DIR;
  if (custom) return resolve3(custom);
  return join4(homedir(), ".pi", "agent");
}
async function selectSession(cwdInput, continueSession, targetSession) {
  const cwd = await realpath(resolve3(cwdInput));
  const root = join4(getAgentDir(), "experimental", "durable-sessions", createHash("sha256").update(cwd).digest("hex").slice(0, 24));
  await mkdir(root, { recursive: true });
  let directory;
  let created = false;
  if (targetSession) {
    const clean = targetSession.endsWith(".sqlite") ? resolve3(targetSession, "..") : targetSession;
    directory = clean.includes("/") || clean.includes("\\") ? resolve3(clean) : join4(root, clean);
    try {
      await mkdir(directory, { recursive: true });
      const entries = await readdir(directory);
      if (!entries.includes("session.sqlite")) {
        created = true;
      }
    } catch (err) {
      if (err?.code !== "ENOENT") {
        console.warn(`[SessionStorage] Directory inspection failed in ${directory}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else if (continueSession) {
    const entries = await readdir(root, { withFileTypes: true });
    const newest = entries.filter((entry) => entry.isDirectory() && /^\d{13}-[0-9a-f-]{36}$/u.test(entry.name)).map((entry) => entry.name).sort().at(-1);
    if (!newest) throw new Error(`No durable session exists for ${cwd}`);
    directory = join4(root, newest);
  } else {
    directory = join4(root, `${String(Date.now()).padStart(13, "0")}-${randomUUID()}`);
    await mkdir(directory);
    created = true;
  }
  const id = basename2(directory);
  const release = await acquireSessionLock(directory, cwd, id);
  return { id, directory, database: join4(directory, "session.sqlite"), cwd, created, release };
}
function safeCloneRecord(record) {
  if (record === null || typeof record !== "object") {
    return record;
  }
  if (Array.isArray(record)) {
    return [...record];
  }
  return { ...record };
}
export {
  PiDurableSessionStore,
  acquireSessionLock,
  forceUnlock,
  forkSessionDatabase,
  getAgentDir,
  isProcessAlive,
  isVerifiedRunnerProcess,
  readOwnerFile,
  removeOwnerFile,
  safeCloneRecord,
  selectSession,
  writeOwnerFile
};
//# sourceMappingURL=index.js.map
