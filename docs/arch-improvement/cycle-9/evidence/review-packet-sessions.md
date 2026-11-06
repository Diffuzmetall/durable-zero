# Frozen source review: sessions

Candidate: /tmp/pi-zero-session-commands-20261106-c

Base: 85afe89869e60b887703d215005d4c37bac3c177

All numbered source lines below come from the frozen candidate.

Reported checks: 74 scoped cases passed serially. Forty-eight installed checks passed.

The parent ran those checks. Your source review must not imply independent test execution.

Report evidenced defects. State coverage limits. Do not invent acceptance from missing evidence.

## packages/local-runtime/src/sessions.ts

```text
1: import { randomUUID } from "node:crypto";
2: import { mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
3: import { basename, dirname, isAbsolute, join, resolve } from "node:path";
4: import { z } from "zod";
5: 
6: export const sessionName = z.string().trim().min(1).max(120).regex(/^[^\p{Cc}\p{Cf}]*$/u, "Session name must not contain control characters");
7: const absolutePath = z.string().min(1).refine(isAbsolute, "Absolute path required");
8: export const sessionDescriptor = z.object({
9:   id: absolutePath, name: sessionName, cwd: absolutePath,
10:   createdAt: z.number().int().nonnegative(),
11:   extensions: z.array(absolutePath),
12:   provider: z.string().min(1).optional(), model: z.string().min(1).optional(),
13: }).strict();
14: export type SessionDescriptor = z.infer<typeof sessionDescriptor>;
15: export type SessionSummary = Pick<SessionDescriptor, "id" | "name" | "cwd">;
16: 
17: /** Host catalog metadata only. Native entries, models, tasks and locks remain in the Harness. */
18: export interface SessionCatalog {
19:   list(): Promise<SessionSummary[]>;
20:   describe(id: string): Promise<SessionDescriptor>;
21:   rename(name: string): Promise<string>;
22:   create(requestId: string, model?: { provider?: string | undefined; model?: string | undefined }): Promise<SessionDescriptor>;
23: }
24: 
25: export async function openSessionCatalog(directory: string, cwd: string, extensions: readonly string[] = []): Promise<SessionCatalog> {
26:   directory = await realpath(directory);
27:   cwd = await realpath(cwd);
28:   const root = dirname(directory);
29:   const path = (id: string) => join(id, ".terminal", "session.json");
30:   async function read(id: string): Promise<SessionDescriptor | undefined> {
31:     const text = await readFile(path(id), "utf8").catch((error: NodeJS.ErrnoException) => {
32:       if (error.code !== "ENOENT") throw error;
33:       return undefined;
34:     });
35:     if (text === undefined) return;
36:     const descriptor = sessionDescriptor.parse(JSON.parse(text));
37:     if (descriptor.id !== id) throw new Error("Session catalog identity mismatch");
38:     return descriptor;
39:   }
40:   async function save(value: SessionDescriptor) {
41:     await mkdir(dirname(path(value.id)), { recursive: true, mode: 0o700 });
42:     const temp = `${path(value.id)}.${randomUUID()}.tmp`;
43:     await writeFile(temp, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
44:     await rename(temp, path(value.id));
45:   }
46:   const previous = await read(directory);
47:   if (previous && previous.cwd !== cwd) throw new Error("Session catalog belongs to another working directory");
48:   let current: SessionDescriptor = {
49:     ...(previous ?? { id: directory, cwd, name: basename(directory), createdAt: Date.now() }),
50:     extensions: [...new Set(extensions.map(p => resolve(cwd, p)))],
51:   };
52:   await save(sessionDescriptor.parse(current));
53:   async function describe(id: string) {
54:     if (!isAbsolute(id) || dirname(resolve(id)) !== root) throw new Error("Session is outside this host catalog");
55:     const canonical = await realpath(id);
56:     if (canonical !== id || dirname(canonical) !== root) throw new Error("Session is outside this host catalog");
57:     const descriptor = await read(canonical);
58:     if (!descriptor) throw new Error("Session is not registered in this host catalog");
59:     return descriptor;
60:   }
61:   return {
62:     describe,
63:     async list() {
64:       const entries = await readdir(root, { withFileTypes: true });
65:       const rows: SessionDescriptor[] = [];
66:       for (const entry of entries) {
67:         if (!entry.isDirectory()) continue;
68:         const descriptor = await read(join(root, entry.name));
69:         if (descriptor) rows.push(descriptor);
70:       }
71:       return rows.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
72:         .map(({ id, name, cwd }) => ({ id, name, cwd }));
73:     },
74:     async rename(name) {
75:       const updated = { ...current, name: sessionName.parse(name) };
76:       await save(updated); current = updated;
77:       return current.name;
78:     },
79:     async create(requestId, model = {}) {
80:       z.uuid().parse(requestId);
81:       // The request key is the directory identity: a lost reply can be retried without another session.
82:       // Preserve all UUID bits in a shorter directory name for Unix socket paths.
83:       const id = join(root, Buffer.from(requestId.replaceAll("-", ""), "hex").toString("base64url"));
84:       const existing = await read(id);
85:       if (existing) return existing;
86:       const descriptor = sessionDescriptor.parse({ ...current, ...model, id, name: `Session ${new Date().toISOString()}`, createdAt: Date.now() });
87:       await mkdir(id, { mode: 0o700 });
88:       await save(descriptor);
89:       return descriptor;
90:     },
91:   };
92: }
```

## packages/local-terminal/src/main.ts

```text
1: import { parseArgs } from "node:util";
2: import { ZeroTerminalClient } from "./client.ts";
3: import { ensureRuntime } from "./launch.ts";
4: import type { SessionDescriptor } from "@local-durable/runtime/sessions";
5: 
6: export async function main(args = process.argv.slice(2)): Promise<void> {
7:   const { values } = parseArgs({ args, options: {
8:     "session-dir": { type: "string" }, probe: { type: "boolean" }, help: { type: "boolean" },
9:   } });
10:   if (values.help) {
11:     console.log("pi-zero-terminal --session-dir PATH [--probe]\nThe installed rich UI is the normal TTY interface. Piped input uses the readline probe.\n/quit or /detach disconnects this terminal only. Start pi-zero-runtime separately.\nRich UI commands: /new, /clear, /name NAME, /resume, /model, /thinking, /compact [instructions], /tasks, /agents, /abort, /reload [extension].\nSession switching detaches the old runtime without stopping active work. Reload refuses active work.");
12:     return;
13:   }
14:   if (!values["session-dir"]) throw new Error("--session-dir is required. Start pi-zero-runtime with the same path first.");
15:   if (values.probe || !process.stdin.isTTY || !process.stdout.isTTY) {
16:     const { main: probe } = await import("./probe.ts");
17:     await probe(["--session-dir", values["session-dir"]]);
18:     return;
19:   }
20:   // Load only the public UI entry. The terminal remains independent of the runtime owner.
21:   const { runDurableTui } = await import("@local-durable/terminal-ui");
22:   let sessionDir = values["session-dir"];
23:   for (;;) {
24:     const client = await ZeroTerminalClient.open(sessionDir);
25:     const detached = new AbortController();
26:     const detach = () => detached.abort();
27:     process.once("SIGTERM", detach);
28:     process.once("SIGHUP", detach);
29:     void client.closed.then(() => detached.abort(client.failure ?? new Error("Runtime disconnected. Reconnect to inspect the session. No prompt was replayed.")));
30:     let next: SessionDescriptor | undefined;
31:     let create = false;
32:     try {
33:       const selected = await runDurableTui(client, client, {
34:         getTerminalCapabilityOverrides: () => ({}),
35:         getEnableSkillCommands: () => client.current().enableSkillCommands,
36:         getAutocompleteMaxVisible: () => 10,
37:         getThemeSetting: () => undefined,
38:       }, undefined, { signal: detached.signal });
39:       if (!detached.signal.aborted && selected !== undefined) {
40:         create = selected === null;
41:         next = create ? await client.createSession() : await client.describeSession(selected!);
42:       }
43:     } finally {
44:       process.off("SIGTERM", detach);
45:       process.off("SIGHUP", detach);
46:       client.close();
47:       await client.closed;
48:     }
49:     if (!next) return;
50:     await ensureRuntime({ cwd: next.cwd, sessionDir: next.id, extensions: next.extensions,
51:       ...(create ? { provider: next.provider, model: next.model } : {}) });
52:     sessionDir = next.id;
53:   }
54: }
```

## packages/local-terminal/src/launch.ts

```text
1: import { spawn } from "node:child_process";
2: import { createHash } from "node:crypto";
3: import { constants } from "node:fs";
4: import { mkdir, open, realpath, stat } from "node:fs/promises";
5: import { homedir } from "node:os";
6: import { dirname, join, resolve } from "node:path";
7: import { setTimeout as delay } from "node:timers/promises";
8: import { fileURLToPath } from "node:url";
9: import { parseArgs } from "node:util";
10: import { z } from "zod";
11: import { connectRuntime, runtimeSocketPath } from "@local-durable/runtime/client";
12: 
13: const infoSchema = z.object({ pid: z.number().int().positive(), entrypoint: z.string(), cwd: z.string() });
14: 
15: export interface RuntimeLaunchOptions {
16:   cwd: string;
17:   sessionDir: string;
18:   provider?: string | undefined;
19:   model?: string | undefined;
20:   extensions?: readonly string[] | undefined;
21: }
22: 
23: /** Composition/launch only: the detached runtime still owns the single native Harness. */
24: export async function ensureRuntime(options: RuntimeLaunchOptions) {
25:   const cwd = await realpath(options.cwd);
26:   if (!(await stat(cwd)).isDirectory()) throw new Error("--cwd must be a directory");
27:   const sessionDir = resolve(options.sessionDir);
28:   if (Buffer.byteLength(runtimeSocketPath(sessionDir)) > 103) throw new Error("Unix socket path is too long. Use a shorter --session-dir path.");
29:   const runtimeFile = fileURLToPath(new URL("../bin/runtime.mjs", import.meta.resolve("@local-durable/runtime")));
30:   const expectedRuntime = await realpath(runtimeFile);
31:   const logPath = join(sessionDir, ".terminal/runtime.log");
32:   async function inspect() {
33:     const client = await connectRuntime(sessionDir);
34:     const timer = setTimeout(() => client.close(), 3000);
35:     try {
36:       const info = infoSchema.parse(await client.request("runtime/info"));
37:       if (await realpath(info.entrypoint) !== expectedRuntime) throw new Error(`Session uses another installation (runtime PID ${info.pid}). Use another --session-dir or stop that runtime explicitly; it was not replaced.`);
38:       if (info.cwd !== cwd) throw new Error("This session belongs to another working directory. Use its --cwd or another --session-dir.");
39:       return info;
40:     } finally { clearTimeout(timer); client.close(); await client.closed; }
41:   }
42:   let info: z.infer<typeof infoSchema> | undefined;
43:   try { info = await inspect(); }
44:   catch (error) {
45:     if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
46:   }
47:   const created = !info;
48:   if (!info) {
49:     await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
50:     const log = await open(logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
51:     const runtimeArgs = [runtimeFile, "--session-dir", sessionDir, "--cwd", cwd];
52:     for (const key of ["provider", "model"] as const) if (options[key]) runtimeArgs.push(`--${key}`, options[key]!);
53:     for (const extension of options.extensions ?? []) runtimeArgs.push("--extension", resolve(cwd, extension));
54:     let startupError: Error | undefined;
55:     let runtime;
56:     try {
57:       runtime = spawn(process.execPath, runtimeArgs, { cwd, detached: true, stdio: ["ignore", log.fd, log.fd] });
58:       runtime.on("error", error => { startupError = error; });
59:       runtime.unref();
60:     } finally { await log.close(); }
61:     const deadline = Date.now() + 90000;
62:     while (!info && Date.now() < deadline) {
63:       try { info = await inspect(); }
64:       catch (error) {
65:         if (startupError) throw startupError;
66:         if (runtime.exitCode !== null || runtime.signalCode !== null) throw new Error(`Runtime failed to start. Log: ${logPath}`, { cause: error });
67:         if (!(["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "") || /closed|Disconnected|Server stopped/i.test((error as Error).message))) throw error;
68:         await delay(50);
69:       }
70:     }
71:     if (!info) throw new Error(`Runtime startup timed out; it was not restarted. PID ${runtime.pid}. Log: ${logPath}`);
72:   }
73:   console.error(`Zero session: ${sessionDir}\nRuntime PID: ${info.pid} · log: ${logPath}`);
74:   return { ...info, sessionDir, created };
75: }
76: 
77: export async function main(args = process.argv.slice(2)): Promise<void> {
78:   const { values } = parseArgs({ args, options: {
79:     cwd: { type: "string" }, "session-dir": { type: "string" },
80:     provider: { type: "string" }, model: { type: "string" },
81:     extension: { type: "string", multiple: true }, help: { type: "boolean" },
82:   } });
83:   if (values.help) {
84:     console.log("pi-durable-zero [--cwd PATH] [--session-dir PATH] [--provider ID --model ID] [--extension PATH]\nStarts an independent runtime and the rich terminal. The default session is reused per working directory.\n/new starts a separate session; /name NAME persists its display name; /resume opens the host session picker.\n/detach closes only the terminal; /reload refreshes resources when idle.\nExisting runtimes from a different installation are never silently replaced.");
85:     return;
86:   }
87:   const cwd = await realpath(values.cwd ?? process.cwd());
88:   const key = createHash("sha256").update(cwd).digest("hex").slice(0, 16);
89:   const sessionDir = resolve(values["session-dir"] ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "pi-durable-zero", "sessions", key));
90:   const info = await ensureRuntime({ cwd, sessionDir, provider: values.provider, model: values.model, extensions: values.extension });
91:   if (!info.created && (values.provider || values.model || values.extension?.length)) throw new Error("Runtime already exists. Use /model or /reload, or specify a new --session-dir for startup options.");
92:   const terminal = spawn(process.execPath, [fileURLToPath(new URL("../bin/terminal.mjs", import.meta.url)), "--session-dir", sessionDir], { cwd, stdio: "inherit" });
93:   // Signals belong to the visible client, never the detached runtime.
94:   const stop = () => terminal.kill("SIGTERM");
95:   process.once("SIGTERM", stop);
96:   try {
97:     process.exitCode = await new Promise<number>((resolve, reject) => {
98:       terminal.once("error", reject);
99:       terminal.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
100:     });
101:   } finally { process.off("SIGTERM", stop); }
102: }
```

## packages/local-terminal/src/client.ts

```text
1: import type { DurableView as NativeDurableView } from "@durable-zero/adapter-pi-durable";
2: import { connectRuntime, mcpTerminalOperation } from "@local-durable/runtime/client";
3: import { ProcessTerminal, type McpTerminalHost, type TerminalController, type TerminalView, type TerminalViewSource } from "@local-durable/terminal-ui";
4: import { z } from "zod";
5: import { randomUUID } from "node:crypto";
6: import { sessionDescriptor, type SessionDescriptor, type SessionSummary } from "@local-durable/runtime/sessions";
7: 
8: // Validate the transport envelope once. Native document and message values remain native values.
9: const envelopeSchema = z.object({ revision: z.number().int().nonnegative(), view: z.looseObject({
10:   session: z.looseObject({ id: z.string(), directory: z.string(), cwd: z.string() }),
11:   conversation: z.looseObject({
12:     conversation: z.looseObject({ id: z.number().int().positive() }),
13:     entries: z.array(z.looseObject({ id: z.number().int(), kind: z.string() })),
14:     docs: z.record(z.string(), z.unknown()),
15:   }),
16:   conversations: z.array(z.looseObject({ id: z.number().int().positive(), label: z.string() })),
17:   models: z.array(z.looseObject({ provider: z.string(), modelId: z.string(), name: z.string(), contextWindow: z.number() })),
18:   notices: z.array(z.looseObject({ id: z.number(), level: z.enum(["info", "warning", "error"]), message: z.string() })),
19: }), sessionName: z.string().optional(), resources: z.object({
20:   skills: z.array(z.object({ name: z.string().min(1), description: z.string(), filePath: z.string(), baseDir: z.string() })),
21:   enableSkillCommands: z.boolean(),
22: }).optional() });
23: 
24: export interface ViewEnvelope {
25:   readonly revision: number;
26:   readonly view: NativeDurableView;
27:   readonly sessionName?: string;
28:   readonly resources?: { readonly skills: TerminalView["skills"]; readonly enableSkillCommands: boolean };
29: }
30: 
31: export function parseViewEnvelope(value: unknown): ViewEnvelope {
32:   envelopeSchema.parse(value);
33:   // Keep the native view, including fields outside the renderer's minimum boundary schema.
34:   return value as ViewEnvelope;
35: }
36: 
37: export function presentView(view: NativeDurableView, connection: TerminalView["connection"], resources?: ViewEnvelope["resources"], sessionName?: string): TerminalView {
38:   return {
39:     ...view,
40:     session: { ...view.session, name: sessionName ?? view.session.id },
41:     // Nonselected activity comes from native summaries; selected documents are the current native view.
42:     conversations: view.conversations.map(row => row.id === view.conversation.conversation.id ? {
43:       ...row,
44:       ...(view.conversation.docs["pi.live"] === undefined ? {} : { live: view.conversation.docs["pi.live"] as NativeDurableView["conversations"][number]["live"] }),
45:       ...(view.conversation.docs["pi.inbox"] === undefined ? {} : { inbox: view.conversation.docs["pi.inbox"] as NativeDurableView["conversations"][number]["inbox"] }),
46:     } : row),
47:     connection,
48:     automation: { scheduled: 0, failed: 0, unavailable: true },
49:     attention: { requests: [], unavailable: true },
50:     skills: resources?.skills ?? [],
51:     enableSkillCommands: resources?.enableSkillCommands ?? false,
52:     tasksExpanded: view.tasks !== undefined,
53:   };
54: }
55: 
56: export type RuntimeConnection = Awaited<ReturnType<typeof connectRuntime>>;
57: export type RuntimeConnector = typeof connectRuntime;
58: 
59: /** A transport client only. It never opens a Harness, session database, or model loop. */
60: export class ZeroTerminalClient implements TerminalController, TerminalViewSource {
61:   #transport: RuntimeConnection;
62:   #native: NativeDurableView;
63:   #revision: number;
64:   #resources: ViewEnvelope["resources"];
65:   #sessionName: string | undefined;
66:   #view: TerminalView;
67:   #listeners = new Set<() => void>();
68:   #stopped = false;
69:   #failure: Error | undefined;
70:   #mcpTerminal: ProcessTerminal | undefined;
71:   #mcpReady = false;
72:   readonly closed: Promise<void>;
73: 
74:   private constructor(transport: RuntimeConnection, initial: ViewEnvelope) {
75:     this.#transport = transport;
76:     this.#native = initial.view;
77:     this.#revision = initial.revision;
78:     this.#resources = initial.resources;
79:     this.#sessionName = initial.sessionName;
80:     this.#view = presentView(initial.view, "online", this.#resources, this.#sessionName);
81:     this.closed = transport.closed.then(() => {
82:       this.#stopped = true;
83:       this.#view = presentView(this.#native, "offline", this.#resources, this.#sessionName);
84:       this.#emit();
85:     });
86:   }
87: 
88:   static async open(sessionDir: string, connect: RuntimeConnector = connectRuntime): Promise<ZeroTerminalClient> {
89:     let client: ZeroTerminalClient | undefined;
90:     let pending: ViewEnvelope | undefined;
91:     let failure: Error | undefined;
92:     let transport: RuntimeConnection | undefined;
93:     transport = await connect(sessionDir, (method, params) => {
94:       if (method === "session/mcpTerminal") {
95:         if (!client) throw new Error("MCP UI output before client initialization");
96:         return client.#terminalOperation(params);
97:       }
98:       if (method === "session/mcpNotice") {
99:         const notice = z.object({ message: z.string(), level: z.enum(["info", "warning", "error"]) }).parse(params);
100:         if (client) client.#mcpTerminal?.write(`\r\n${notice.level}: ${notice.message}\r\n`);
101:         return;
102:       }
103:       if (method !== "session/view") return;
104:       try {
105:         const envelope = parseViewEnvelope(params);
106:         if (client) client.#apply(envelope);
107:         else if (!pending || envelope.revision > pending.revision) pending = envelope;
108:       } catch (error) {
109:         failure = new Error("Invalid session/view notification", { cause: error });
110:         if (client) client.#failure = failure;
111:         transport?.close();
112:       }
113:     });
114:     try {
115:       const initial = parseViewEnvelope(await transport.request("session/getView"));
116:       if (failure) throw failure;
117:       // Either message can be newer. Revision orders both responses and notifications.
118:       client = new ZeroTerminalClient(transport, pending && pending.revision > initial.revision ? pending : initial);
119:       return client;
120:     } catch (error) {
121:       transport.close();
122:       throw error;
123:     }
124:   }
125: 
126:   #terminalOperation(value: unknown): void | Promise<void> {
127:     if (!this.#mcpTerminal) throw new Error("No active MCP terminal");
128:     const event = mcpTerminalOperation.parse(value);
129:     switch (event.op) {
130:       case "write": this.#mcpReady = true; return this.#mcpTerminal.write(event.data);
131:       case "setTitle": return this.#mcpTerminal.setTitle(event.title);
132:       case "setProgress": return this.#mcpTerminal.setProgress(event.active);
133:       case "setProgramStatus": return this.#mcpTerminal.setProgramStatus(event.status);
134:       case "drainInput": return this.#mcpTerminal.drainInput(event.maxMs, event.idleMs);
135:     }
136:   }
137:   async mcpCommand(args: string, host: McpTerminalHost): Promise<void> {
138:     if (this.#stopped) throw new Error("Terminal disconnected");
139:     if (this.#mcpTerminal) throw new Error("An MCP manager is already open");
140:     host.suspend();
141:     const terminal = new ProcessTerminal();
142:     this.#mcpTerminal = terminal;
143:     const viewport = () => ({ columns: terminal.columns, rows: terminal.rows, kittyProtocolActive: terminal.kittyProtocolActive });
144:     this.#mcpReady = false;
145:     const resize = () => { if (this.#mcpReady) void this.#request("session/mcpResize", viewport()).catch(() => this.close()); };
146:     try {
147:       terminal.start(data => {
148:         if (this.#mcpReady) void this.#request("session/mcpInput", { data }).catch(() => this.close());
149:       }, resize);
150:       // The first frame means the remote manager has admitted this terminal; negotiation replies before it are local.
151:       await this.#transport.request("session/mcpCommand", { args, colors: host.colors, keybindings: host.keybindings, ...viewport() });
152:     } finally {
153:       this.#mcpReady = false;
154:       terminal.stop();
155:       this.#mcpTerminal = undefined;
156:       if (!this.#stopped) host.resume();
157:     }
158:   }
159:   get failure(): Error | undefined { return this.#failure; }
160:   current(): TerminalView { return this.#view; }
161:   subscribe(listener: () => void): () => void {
162:     this.#listeners.add(listener);
163:     return () => { this.#listeners.delete(listener); };
164:   }
165:   #emit(): void { for (const listener of this.#listeners) listener(); }
166:   #apply(envelope: ViewEnvelope): void {
167:     if (this.#stopped || envelope.revision <= this.#revision) return;
168:     this.#revision = envelope.revision;
169:     this.#native = envelope.view;
170:     this.#resources = envelope.resources;
171:     this.#sessionName = envelope.sessionName;
172:     this.#view = presentView(envelope.view, "online", this.#resources, this.#sessionName);
173:     this.#emit();
174:   }
175:   async #request<T = void>(method: string, params: Record<string, unknown> = {}): Promise<T> {
176:     if (this.#stopped) throw new Error("Terminal disconnected. Reconnect to inspect the session. No prompt was replayed.");
177:     return await this.#transport.request(method, params) as T;
178:   }
179:   async submit(content: string, deliverAs: "steer" | "followUp" = "steer"): Promise<void> {
180:     z.string().trim().min(1).parse(content);
181:     z.enum(["steer", "followUp"]).parse(deliverAs);
182:     await this.#request("session/prompt", {
183:       content, options: { deliverAs, conversationId: String(this.#native.conversation.conversation.id) },
184:     });
185:   }
186:   abort(): Promise<void> {
187:     return this.#request("session/abort", { conversationId: String(this.#native.conversation.conversation.id) });
188:   }
189:   compact(instructions?: string): Promise<void> {
190:     z.string().optional().parse(instructions);
191:     return this.#request("session/compact", instructions === undefined ? {} : { instructions });
192:   }
193:   setModel(model: { provider: string; modelId: string }): Promise<void> {
194:     const params = z.object({ provider: z.string().min(1), modelId: z.string().min(1) }).parse(model);
195:     return this.#request("models/set", {
196:       ...params, conversationId: String(this.#native.conversation.conversation.id),
197:     });
198:   }
199:   cycleThinking(): Promise<void> { return this.#request("models/cycleThinking"); }
200:   toggleTasks(): Promise<void> { return this.#request("session/toggleTasks"); }
201:   switchConversation(id: number): Promise<void> {
202:     z.number().int().positive().parse(id);
203:     return this.#request("session/switchConversation", { conversationId: String(id) });
204:   }
205:   reload(path?: string): Promise<void> {
206:     z.string().trim().min(1).optional().parse(path);
207:     return this.#request("session/reload", path === undefined ? {} : { path });
208:   }
209:   async listSessions(): Promise<SessionSummary[]> {
210:     return z.array(sessionDescriptor.pick({ id: true, name: true, cwd: true })).parse(await this.#request<unknown>("session/list"));
211:   }
212:   async renameSession(name: string): Promise<string> {
213:     return z.string().parse(await this.#request<unknown>("session/rename", { name }));
214:   }
215:   async createSession(): Promise<SessionDescriptor> {
216:     return sessionDescriptor.parse(await this.#request<unknown>("session/create", { requestId: randomUUID() }));
217:   }
218:   async describeSession(id: string): Promise<SessionDescriptor> {
219:     return sessionDescriptor.parse(await this.#request<unknown>("session/describe", { id }));
220:   }
221:   close(): void {
222:     if (this.#stopped) return;
223:     this.#stopped = true;
224:     this.#transport.close();
225:   }
226: }
```

## packages/local-runtime/test/session-catalog-native.test.ts

```text
1: import test from "node:test";
2: import assert from "node:assert/strict";
3: import { spawn } from "node:child_process";
4: import { once } from "node:events";
5: import { randomUUID } from "node:crypto";
6: import { mkdtemp, mkdir, rm } from "node:fs/promises";
7: import { tmpdir } from "node:os";
8: import { join } from "node:path";
9: import { fileURLToPath } from "node:url";
10: import { setTimeout as delay } from "node:timers/promises";
11: import { connectRuntime, runtimeSocketPath } from "../src/client.ts";
12: 
13: const entry = fileURLToPath(new URL("../bin/runtime.mjs", import.meta.url));
14: const fixture = fileURLToPath(new URL("fixtures/provider.ts", import.meta.url));
15: 
16: test("native session catalog: names persist, creation retries reuse one directory, resume stays scoped", { timeout: 20000 }, async t => {
17:   const base = await mkdtemp(join(tmpdir(), "zero-sessions-"));
18:   const cwd = join(base, "workspace"); await mkdir(cwd);
19:   const sessionDir = join(base, "state", "pi-durable-zero", "sessions", "original");
20:   const children: ReturnType<typeof spawn>[] = [];
21:   const connections: Awaited<ReturnType<typeof connectRuntime>>[] = [];
22:   t.after(async () => {
23:     for (const c of connections) c.close();
24:     for (const child of children) {
25:       if (child.exitCode === null && child.signalCode === null) {
26:         const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
27:       }
28:     }
29:     await rm(base, { recursive: true, force: true });
30:   });
31:   async function open(directory: string, fromEnvironment = false) {
32:     const child = spawn(process.execPath, [entry, "--cwd", cwd, "--session-dir", directory,
33:       ...(fromEnvironment ? [] : ["--extension", fixture]), "--provider", "local-test", "--model", "scripted"], {
34:       env: { ...process.env, HOME: join(base, "home"), PI_CODING_AGENT_DIR: join(base, "agent"), PI_ADDITIONAL_EXTENSIONS: fromEnvironment ? fixture : "" }, stdio: "pipe",
35:     });
36:     children.push(child);
37:     let out = "", err = "";
38:     child.stdout.on("data", chunk => { out += chunk; }); child.stderr.on("data", chunk => { err += chunk; });
39:     const deadline = Date.now() + 7000;
40:     while (!out.includes('"status":"ready"')) {
41:       assert.equal(child.exitCode, null, err);
42:       assert.ok(Date.now() < deadline, `runtime startup: ${out} ${err}`);
43:       let early: Awaited<ReturnType<typeof connectRuntime>> | undefined;
44:       try {
45:         early = await connectRuntime(directory);
46:         await early.request("runtime/info");
47:         const initial = await early.request("session/getView") as { sessionName?: string };
48:         assert.equal(typeof initial.sessionName, "string", "runtime discovery must wait for catalog readiness");
49:       } catch (error) {
50:         if (!["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes((error as NodeJS.ErrnoException).code ?? "") &&
51:             !/closed|Disconnected|Server stopped/i.test((error as Error).message)) throw error;
52:       } finally { early?.close(); }
53:       await delay(5);
54:     }
55:     const client = await connectRuntime(directory); connections.push(client);
56:     return { child, client };
57:   }
58:   const original = await open(sessionDir, true);
59:   const rows: any = await original.client.request("session/list");
60:   assert.equal(rows.length, 1); assert.equal(rows[0].id, sessionDir);
61:   await original.client.request("session/rename", { name: "  Проект Zero  " });
62:   const named: any = await original.client.request("session/getView");
63:   assert.equal(named.sessionName, "Проект Zero");
64:   assert.equal(named.view.session.id, "original", "display name must not replace native identity");
65:   await assert.rejects(original.client.request("session/rename", { name: "\u001b[31m" }), /Invalid|control|name/i);
66:   await assert.rejects(original.client.request("session/rename", { name: "   " }), /Invalid|name/i);
67:   const requestId = randomUUID();
68:   const first: any = await original.client.request("session/create", { requestId });
69:   const retried: any = await original.client.request("session/create", { requestId });
70:   assert.equal(first.id, retried.id); assert.notEqual(first.id, sessionDir); assert.equal(first.cwd, cwd);
71:   assert.ok(Buffer.byteLength(runtimeSocketPath(first.id)) <= 103, "new sessions must fit the default Unix socket layout");
72:   assert.deepEqual(first.extensions, [fixture]);
73:   const listed: any = await original.client.request("session/list");
74:   assert.equal(listed.length, 2);
75:   await assert.rejects(original.client.request("session/describe", { id: join(base, "unrelated") }), /outside|catalog/i);
76:   const next = await open(first.id);
77:   const empty: any = await next.client.request("session/getTranscript");
78:   assert.equal(empty.entries.filter((e: any) => e.role === "user").length, 0);
79:   const originalInfo: any = await original.client.request("runtime/info");
80:   const nextInfo: any = await next.client.request("runtime/info");
81:   assert.notEqual(nextInfo.pid, originalInfo.pid);
82:   original.client.close(); await original.client.closed;
83:   const exited = once(original.child, "exit"); original.child.kill("SIGTERM"); await exited;
84:   const reopened = await open(sessionDir);
85:   const restored: any = await reopened.client.request("session/getView");
86:   assert.equal(restored.sessionName, "Проект Zero");
87:   assert.equal((await next.client.request("runtime/info") as any).pid, nextInfo.pid, "reopening another session must not stop this runtime");
88: });
```

## Diff: packages/terminal-ui/vendor/experimental/durable/tui.js

```diff
--- base/packages/terminal-ui/vendor/experimental/durable/tui.js
+++ candidate/packages/terminal-ui/vendor/experimental/durable/tui.js
@@ -10,15 +10,15 @@
 import { AssistantMessageComponent } from "../../modes/interactive/components/assistant-message.js";
 import { CustomEditor } from "../../modes/interactive/components/custom-editor.js";
 import { DynamicBorder } from "../../modes/interactive/components/dynamic-border.js";
 import { keyText } from "../../modes/interactive/components/keybinding-hints.js";
 import { WorkingStatusIndicator } from "../../modes/interactive/components/status-indicator.js";
 import { ToolExecutionComponent } from "../../modes/interactive/components/tool-execution.js";
 import { UserMessageComponent } from "../../modes/interactive/components/user-message.js";
-import { getEditorTheme, getMarkdownTheme, initTheme, theme } from "../../modes/interactive/theme/theme.js";
+import { getEditorTheme, getMarkdownTheme, getResolvedThemeColors, initTheme, theme } from "../../modes/interactive/theme/theme.js";
 import { InteractiveThemeController } from "../../modes/interactive/theme/theme-controller.js";
 import { DcgToolCard } from "../dcg-tool-card.js";
 import { agentOf } from "../../native-types.js";
 import { activityRowAt, activityStatus, clean, renderActivity } from "../../extensions/activity-panel/activity.js";
 import { renderMailLabel } from "../../extensions/activity-panel/mail-badge.js";
 import { formatGoalResult, goalOperatorInput, renderNativeGoalRow, visibleNativeGoal } from "../../extensions/automation-footer/goal-view.js";
 import { goalEntryText } from "../../extensions/automation-footer/goal-result.js";
@@ -51,15 +51,15 @@
     },
     { name: "name", description: "Set persistent session name · название сессии" },
     { name: "new", description: "Start a new session · новая сессия" },
     { name: "clear", description: "Start a new session (alias for /new) · очистить" },
     { name: "quit", description: "Exit Pi Durable · выйти" },
     { name: "compact", description: "Summarize context · сжать контекст" },
     { name: "reload", description: "Refresh terminal model/skill catalogues · обновить меню" },
-    { name: "mcp", description: "Show MCP connection status; on/off · подключения" },
+    { name: "mcp", description: "Open native MCP manager · управление подключениями" },
 ];
 export function createDurableAutocomplete(cwd, skills, enableSkills = true, extraCommands = []) {
     const commands = [
         ...DURABLE_COMMANDS,
         ...extraCommands,
         ...(enableSkills ? skills.map((skill) => ({ name: `skill:${skill.name}`, description: skill.description })) : []),
     ];
@@ -794,35 +794,42 @@
             const rows = await controller.listSessions();
             const items = rows.map((row) => ({
                 value: row.id,
                 label: row.name,
                 description: row.cwd,
             }));
             view.mount(new ListSelector(items.length ? "Resume session (Esc to cancel):" : "No sessions found (Esc to close)", items, (id) => {
-                if (id === source.current().session.id)
+                if (id === source.current().session.id || id === source.current().session.directory)
                     return view.restoreEditor();
                 selectedSession = id;
                 exit();
             }, () => view.restoreEditor()), "Resume session");
         }
         catch (error) {
             view.mount(new ListSelector(`Resume unavailable: ${String(error)} (Esc to close)`, [], () => view.restoreEditor(), () => view.restoreEditor()));
         }
     };
-    view = new DurableTui(process.cwd(), source.current().session.directory, {
+    view = new DurableTui(source.current().session.cwd, source.current().session.directory, {
         submit: (text) => {
             const trimmed = text.trim();
             if (!trimmed)
                 return;
             if (modelSwitch.command(trimmed))
                 return;
             if (/^\/skill-selector(?:\s|$)/.test(trimmed))
                 return selectSkill(trimmed.slice(15).trim());
             if (trimmed === "/model")
                 return selectModel();
+            if (trimmed === "/mcp" || trimmed.startsWith("/mcp "))
+                return command(text, () => controller.mcpCommand(trimmed.slice(4).trim(), {
+                    colors: getResolvedThemeColors(settings.getThemeSetting()),
+                    keybindings: getKeybindings().getResolvedBindings(),
+                    suspend: () => view.ui.stop(),
+                    resume: () => { view.ui.start(); view.restoreEditor(); view.ui.requestRender(true); },
+                }));
             if (trimmed === "/tasks")
                 return command(text, () => controller.toggleTasks());
             if (trimmed === "/agents")
                 return selectConversation();
             if (trimmed === "/terminal") {
                 view.mount(new ListSelector(terminalDiagnostics(settings.getTerminalCapabilityOverrides()), [], () => view.restoreEditor(), () => view.restoreEditor()));
                 return;
@@ -833,15 +840,16 @@
                 void controller.renameSession(trimmed.slice(5)).then((name) => view.setSessionTitle(name))
                     .catch((error) => view.showInputError(text, error));
                 return;
             }
             if (trimmed === "/quit" || trimmed === "/detach")
                 return exit();
             if (trimmed === "/new" || trimmed === "/clear") {
-                return view.showInputError(text, new Error("Unsupported capability: session creation. Start a runtime separately."));
+                selectedSession = null;
+                return exit();
             }
             if (trimmed === "/reload" || trimmed.startsWith("/reload ")) {
                 return void controller.reload(trimmed.slice("/reload".length).trim() || undefined).then(refreshAutocomplete)
                     .catch((error) => view.showInputError(text, error));
             }
             if (trimmed === "/compact" || trimmed.startsWith("/compact ")) {
                 const instructions = trimmed.slice("/compact".length).trim();

```

## Diff: packages/local-runtime/src/index.ts

```diff
--- base/packages/local-runtime/src/index.ts
+++ candidate/packages/local-runtime/src/index.ts
@@ -2,14 +2,16 @@
 import { chmod, mkdir, lstat, realpath, unlink } from "node:fs/promises";
 import { dirname, resolve } from "node:path";
 import { PassThrough } from "node:stream";
 import { once } from "node:events";
 import { runtimeSocketPath } from "./client.ts";
 import { createClientOutput } from "./notifications.ts";
 import { expandSkillCommand } from "./skills.ts";
+import { openSessionCatalog, sessionName, type SessionCatalog } from "./sessions.ts";
+import { createMcpCommandUI, mcpCommandRequest, mcpViewport } from "./mcp-ui.ts";
 export { runtimeSocketPath } from "./client.ts";
 import { z } from "zod";
 import { assembleDurableZero, type AssembleDurableZeroOptions, type DurableZeroInstance } from "@durable-zero/runner";
 import { acquireSessionLock, parseConversationId } from "@durable-zero/adapter-pi-durable";
 import { StdioJsonRpcServer, JsonRpcInvalidParamsError, JsonRpcMethodNotFoundError } from "@durable-zero/protocol";
 
 const conversation = z.object({ conversationId: z.string().min(1).optional() }).strict();
@@ -22,15 +24,22 @@
     }).strict().optional(),
   }).strict(),
   "session/abort": conversation,
   "session/getState": conversation,
   "session/getTranscript": conversation.extend({ limit: z.number().int().positive().optional() }),
   "session/getStats": conversation,
   "session/getView": z.object({}).strict(),
+  "session/list": z.object({}).strict(),
+  "session/describe": z.object({ id: z.string().min(1) }).strict(),
+  "session/rename": z.object({ name: sessionName }).strict(),
+  "session/create": z.object({ requestId: z.uuid() }).strict(),
   "runtime/info": z.object({}).strict(),
+  "session/mcpCommand": mcpCommandRequest,
+  "session/mcpInput": z.object({ data: z.string() }).strict(),
+  "session/mcpResize": mcpViewport.strict(),
   "session/reload": z.object({ path: z.string().trim().min(1).optional() }).strict(),
   "session/compact": z.object({ instructions: z.string().optional() }).strict(),
   "models/set": z.object({
     provider: z.string().trim().min(1), modelId: z.string().trim().min(1),
     conversationId: z.string().regex(/^[1-9]\d*$/).optional(),
   }).strict(),
   "models/cycleThinking": z.object({}).strict(),
@@ -57,25 +66,34 @@
   const releaseEndpoint = await acquireSessionLock(dirname(socketPath), options.cwd ?? process.cwd(), "terminal-transport");
   const input = new PassThrough();
   const output = new PassThrough();
   const clients = new Map<Socket, ReturnType<typeof createClientOutput>["notify"]>();
   let instance: DurableZeroInstance | undefined;
   let unsubscribeView: (() => void) | undefined;
   let viewRevision = 0;
+  let catalog: SessionCatalog;
+  let displayName: string;
   let commands: Promise<unknown> = Promise.resolve();
+  let activeMcpUI: { socket: Socket; bridge: ReturnType<typeof createMcpCommandUI>; completion: Promise<void> } | undefined;
   let assemblyOptions: AssembleDurableZeroOptions = {
     ...options, sessionDir: resolve(options.sessionDir), noGlobalExtensions: true, stdin: input, stdout: output,
   };
   const attachAssembly = async () => {
     instance = await assembleDurableZero(assemblyOptions);
     if (!instance.view || !instance.controller) throw new Error("The terminal runtime requires native presentation and control ports");
+    const session = instance.view.current().session;
+    catalog = await openSessionCatalog(session.directory, session.cwd, [
+      ...(assemblyOptions.extensions ?? (assemblyOptions.extension ? [assemblyOptions.extension] : [])),
+      ...(process.env.PI_ADDITIONAL_EXTENSIONS?.split(",").map(path => path.trim()).filter(Boolean) ?? []),
+    ]);
+    displayName = (await catalog.describe(session.directory)).name;
     unsubscribeView = instance.view.subscribe(() => { ++viewRevision; notify("session/view", envelope()); });
   };
   const envelope = () => ({
-    view: instance!.view!.current(), revision: viewRevision,
+    view: instance!.view!.current(), revision: viewRevision, sessionName: displayName,
     resources: {
       skills: (instance!.resources?.getSkills() ?? []).map(({ name, description, filePath, baseDir }) => ({ name, description, filePath, baseDir })),
       enableSkillCommands: instance!.resources?.getEnableSkillCommands() ?? false,
     },
   });
   const notify = (method: string, params: Record<string, unknown>) => {
     for (const send of clients.values()) send(method, params);
@@ -84,29 +102,56 @@
   const bridge = new StdioJsonRpcServer({
     stdin: output,
     stdout: input,
     handler: async (method, params) => { notify(method, params); },
   });
   bridge.start();
   const server = createServer((socket) => {
-    if (!instance) { socket.destroy(); return; }
+    // Assembly assignment precedes asynchronous catalog loading. Do not admit discovery
+    // or initial views until the complete host envelope is ready.
+    if (!instance || displayName === undefined) { socket.destroy(); return; }
     const transport = createClientOutput(socket);
     const client = new StdioJsonRpcServer({
       stdin: socket,
       stdout: transport.output,
       handler: async (method, params) => {
         if (!Object.hasOwn(requests, method)) throw new JsonRpcMethodNotFoundError(method);
         const schema = requests[method as keyof typeof requests];
         const parsed = schema.safeParse(params);
         if (!parsed.success) throw new JsonRpcInvalidParamsError(parsed.error.message);
+        if (method === "session/mcpInput" || method === "session/mcpResize") {
+          if (activeMcpUI?.socket !== socket) throw new Error("This connection does not own an MCP manager");
+          if (method === "session/mcpInput") activeMcpUI.bridge.input((parsed.data as { data: string }).data);
+          else activeMcpUI.bridge.resize(parsed.data as z.infer<typeof mcpViewport>);
+          return { ok: true };
+        }
+        if (method === "session/mcpCommand") {
+          // Serialize admission, not the menu's lifetime: other clients can still abort active work.
+          const started = commands.then(() => {
+            if (socket.destroyed) throw new Error("MCP terminal disconnected before admission");
+            if (activeMcpUI) throw new Error("An MCP manager is already open. Close it first.");
+            const request = parsed.data as z.infer<typeof mcpCommandRequest>;
+            const ui = createMcpCommandUI(request,
+              event => transport.notify("session/mcpTerminal", event),
+              event => client.request("session/mcpTerminal", event),
+              (message, level) => transport.notify("session/mcpNotice", { message, level }));
+            const completion = Promise.resolve().then(() => instance!.controller!.executeMcpCommand(request.args, ui.ui))
+              .finally(() => { if (activeMcpUI?.bridge === ui) activeMcpUI = undefined; });
+            activeMcpUI = { socket, bridge: ui, completion };
+            return { completion };
+          });
+          commands = started.then(() => undefined, () => undefined);
+          return (await started).completion.then(() => ({ ok: true }));
+        }
         // Serialize admission with reload so no prompt can slip between the idle check and close.
         const operation = commands.then(async () => {
         const engine = instance!.engine;
         switch (method) {
           case "session/reload": {
+            if (activeMcpUI) throw new Error("Cannot reload: close the MCP manager first.");
             if (!await instance!.isIdle?.()) throw new Error("Cannot reload: active work is running. Wait for completion or abort it first.");
             const { path } = parsed.data as z.infer<typeof requests["session/reload"]>;
             const extensionPath = path ? await realpath(resolve(options.cwd ?? process.cwd(), path)) : undefined;
             const selected = instance!.view!.current().conversation.conversation.id;
             unsubscribeView?.();
             await instance!.close();
             assemblyOptions = { ...assemblyOptions };
@@ -118,14 +163,28 @@
               await attachAssembly();
               await instance!.controller!.switchConversation(selected);
             } catch (error) { await close(); throw error; }
             ++viewRevision;
             notify("session/view", envelope());
             return { ok: true };
           }
+          case "session/list": return catalog.list();
+          case "session/describe": return catalog.describe((parsed.data as { id: string }).id);
+          case "session/rename": {
+            displayName = await catalog.rename((parsed.data as { name: string }).name);
+            ++viewRevision;
+            notify("session/view", envelope());
+            return displayName;
+          }
+          case "session/create": {
+            const agent = instance!.view!.current().conversation.docs["pi.agent"] as { model?: { provider?: string; id?: string; modelId?: string } } | undefined;
+            return catalog.create((parsed.data as { requestId: string }).requestId, {
+              provider: agent?.model?.provider, model: agent?.model?.modelId ?? agent?.model?.id,
+            });
+          }
           case "session/getView": return envelope();
           case "runtime/info": return { pid: process.pid, entrypoint: resolve(process.argv[1]!), cwd: instance!.view!.current().session.cwd };
           case "session/prompt": {
             const prompt = parsed.data as z.infer<typeof requests["session/prompt"]>;
             const content = await expandSkillCommand(prompt.content, instance!.resources?.getSkills() ?? []);
             return bridge.request(method, { ...prompt, content });
           }
@@ -143,20 +202,26 @@
         });
         commands = operation.then(() => undefined, () => undefined);
         return operation;
       },
     });
     clients.set(socket, transport.notify);
     socket.on("error", () => socket.destroy());
-    socket.once("close", () => { client.stop(); clients.delete(socket); });
+    socket.once("close", () => {
+      if (activeMcpUI?.socket === socket) activeMcpUI.bridge.disconnect();
+      client.stop(); clients.delete(socket);
+    });
     client.start();
   });
   let closing: Promise<void> | undefined;
   const close = (): Promise<void> => closing ??= (async () => {
+    const pendingMcpUI = activeMcpUI;
+    pendingMcpUI?.bridge.disconnect();
     for (const socket of clients.keys()) socket.destroy();
+    await pendingMcpUI?.completion.catch(() => {});
     if (server.listening) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
     unsubscribeView?.();
     bridge.stop();
     input.destroy();
     output.destroy();
     try { await instance?.close(); } finally { await releaseEndpoint(); }
   })();

```
