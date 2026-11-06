import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

export const sessionName = z.string().trim().min(1).max(120).regex(/^[^\p{Cc}\p{Cf}]*$/u, "Session name must not contain control characters");
const absolutePath = z.string().min(1).refine(isAbsolute, "Absolute path required");
export const sessionDescriptor = z.object({
  id: absolutePath, name: sessionName, cwd: absolutePath,
  createdAt: z.number().int().nonnegative(),
  extensions: z.array(absolutePath),
  provider: z.string().min(1).optional(), model: z.string().min(1).optional(),
}).strict();
export type SessionDescriptor = z.infer<typeof sessionDescriptor>;
export type SessionSummary = Pick<SessionDescriptor, "id" | "name" | "cwd">;

/** Host catalog metadata only. Native entries, models, tasks and locks remain in the Harness. */
export interface SessionCatalog {
  list(): Promise<SessionSummary[]>;
  describe(id: string): Promise<SessionDescriptor>;
  rename(name: string): Promise<string>;
  create(requestId: string, model?: { provider?: string | undefined; model?: string | undefined }): Promise<SessionDescriptor>;
}

export async function openSessionCatalog(directory: string, cwd: string, extensions?: readonly string[]): Promise<SessionCatalog> {
  directory = await realpath(directory);
  cwd = await realpath(cwd);
  const root = dirname(directory);
  const path = (id: string) => join(id, ".terminal", "session.json");
  async function read(id: string): Promise<SessionDescriptor | undefined> {
    const text = await readFile(path(id), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (text === undefined) return;
    const descriptor = sessionDescriptor.parse(JSON.parse(text));
    if (descriptor.id !== id) throw new Error("Session catalog identity mismatch");
    return descriptor;
  }
  async function save(value: SessionDescriptor, destination = value.id) {
    await mkdir(dirname(path(destination)), { recursive: true, mode: 0o700 });
    const temp = `${path(destination)}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temp, path(destination));
  }
  const previous = await read(directory);
  if (previous && previous.cwd !== cwd) throw new Error("Session catalog belongs to another working directory");
  let current: SessionDescriptor = {
    ...(previous ?? { id: directory, cwd, name: basename(directory), createdAt: Date.now() }),
    extensions: extensions === undefined ? previous?.extensions ?? [] : [...new Set(extensions.map(p => resolve(cwd, p)))],
  };
  await save(sessionDescriptor.parse(current));
  async function describe(id: string) {
    if (!isAbsolute(id) || dirname(resolve(id)) !== root) throw new Error("Session is outside this host catalog");
    const canonical = await realpath(id);
    if (canonical !== id || dirname(canonical) !== root) throw new Error("Session is outside this host catalog");
    const descriptor = await read(canonical);
    if (!descriptor) throw new Error("Session is not registered in this host catalog");
    return descriptor;
  }
  return {
    describe,
    async list() {
      const entries = await readdir(root, { withFileTypes: true });
      const rows: SessionDescriptor[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const descriptor = await read(join(root, entry.name));
        if (descriptor) rows.push(descriptor);
      }
      return rows.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
        .map(({ id, name, cwd }) => ({ id, name, cwd }));
    },
    async rename(name) {
      const updated = { ...current, name: sessionName.parse(name) };
      await save(updated); current = updated;
      return current.name;
    },
    async create(requestId, model = {}) {
      z.uuid().parse(requestId);
      // The request key is the directory identity: a lost reply can be retried without another session.
      // Preserve all UUID bits in a shorter directory name for Unix socket paths.
      const id = join(root, Buffer.from(requestId.replaceAll("-", ""), "hex").toString("base64url"));
      const existing = await read(id);
      if (existing) return existing;
      const descriptor = sessionDescriptor.parse({ ...current, ...model, id, name: `Session ${new Date().toISOString()}`, createdAt: Date.now() });
      // Publish a complete directory atomically. An interrupted save stays inside this
      // catalog's metadata, never at the stable session identity or in the session list.
      const pending = await mkdtemp(join(directory, ".terminal", "new-"));
      try {
        await save(descriptor, pending);
        return await rename(pending, id).then(() => descriptor).catch(async (error: NodeJS.ErrnoException) => {
          if (!["EEXIST", "ENOTEMPTY"].includes(error.code ?? "")) throw error;
          const completed = await read(id);
          if (!completed) throw error; // Never replace an occupied, unregistered directory.
          return completed;
        });
      } finally { await rm(pending, { recursive: true, force: true }); }
    },
  };
}
