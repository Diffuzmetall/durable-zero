# Frozen source review: mcp

Candidate: /tmp/pi-zero-session-commands-20261106-c

Base: 85afe89869e60b887703d215005d4c37bac3c177

All numbered source lines below come from the frozen candidate.

Reported checks: 74 scoped cases passed serially. Forty-eight installed checks passed.

The parent ran those checks. Your source review must not imply independent test execution.

Report evidenced defects. State coverage limits. Do not invent acceptance from missing evidence.

## packages/local-runtime/src/mcp-ui.ts

```text
1: import { TuiMainScreen, KeybindingsManager, TUI_KEYBINDINGS, getKeybindings, setKeybindings, type TUI, type Component, type Terminal } from "@earendil-works/pi-tui";
2: import { Theme, initTheme, ExtensionInputComponent, ExtensionSelectorComponent, type ExtensionUIContext, type KeybindingsManager as PiKeybindingsManager } from "@earendil-works/pi-coding-agent";
3: import { z } from "zod";
4: import type { McpTerminalOperation } from "./client.ts";
5: 
6: export const mcpViewport = z.object({
7:   columns: z.number().int().min(1).max(10000), rows: z.number().int().min(1).max(10000),
8:   kittyProtocolActive: z.boolean(),
9: });
10: export const mcpCommandRequest = mcpViewport.extend({
11:   args: z.string(), keybindings: z.record(z.string(), z.union([z.string(), z.array(z.string())])), colors: z.record(z.string(), z.string().regex(/^(?:#[0-9a-f]{6}|)$/i)),
12: }).strict();
13: 
14: /** An output device for Pi's real TUI. Rendering and input dispatch remain native Pi code. */
15: class RemoteTerminal implements Terminal {
16:   #input: ((data: string) => void) | undefined;
17:   #resize: (() => void) | undefined;
18:   #cancelled = false;
19:   #cancelQueued = false;
20:   constructor(public viewport: z.infer<typeof mcpViewport>,
21:     private send: (operation: McpTerminalOperation) => void,
22:     private request: (operation: McpTerminalOperation) => Promise<unknown>) {}
23:   get columns() { return this.viewport.columns; }
24:   get rows() { return this.viewport.rows; }
25:   get kittyProtocolActive() { return this.viewport.kittyProtocolActive; }
26:   start(input: (data: string) => void, resize: () => void) {
27:     this.#input = input; this.#resize = resize;
28:     if (this.#cancelled) this.#cancel();
29:   }
30:   stop() { this.#input = undefined; this.#resize = undefined; }
31:   input(data: string) { if (!this.#cancelled) this.#input?.(data); }
32:   resize(viewport: z.infer<typeof mcpViewport>) { this.viewport = viewport; this.#resize?.(); }
33:   disconnect() { this.#cancelled = true; this.#cancel(); }
34:   #cancel() {
35:     if (this.#cancelQueued || !this.#input) return;
36:     this.#cancelQueued = true;
37:     setImmediate(() => { this.#cancelQueued = false; this.#input?.("\x1b"); });
38:   }
39:   write(data: string) {
40:     if (this.#cancelled) {
41:       // Cancel each newly rendered nested menu, until the native manager exits itself.
42:       this.#cancel();
43:     } else this.send({ op: "write", data });
44:   }
45:   async drainInput(maxMs?: number, idleMs?: number) {
46:     if (!this.#cancelled) await this.request({ op: "drainInput", maxMs, idleMs });
47:   }
48:   moveBy(lines: number) { if (lines) this.write(`\x1b[${Math.abs(lines)}${lines > 0 ? "B" : "A"}`); }
49:   hideCursor() { this.write("\x1b[?25l"); }
50:   showCursor() { this.write("\x1b[?25h"); }
51:   clearLine() { this.write("\x1b[2K\r"); }
52:   clearFromCursor() { this.write("\x1b[J"); }
53:   clearScreen() { this.write("\x1b[2J\x1b[H"); }
54:   setTitle(title: string) { if (!this.#cancelled) this.send({ op: "setTitle", title }); }
55:   setProgress(active: boolean) { if (!this.#cancelled) this.send({ op: "setProgress", active }); }
56:   setProgramStatus(status: Parameters<Terminal["setProgramStatus"]>[0]) {
57:     if (!this.#cancelled) this.send({ op: "setProgramStatus", status });
58:   }
59: }
60: 
61: /** One command's UI, not a Harness, MCP client, or replacement manager. */
62: export function createMcpCommandUI(options: z.infer<typeof mcpCommandRequest>,
63:   send: (operation: McpTerminalOperation) => void,
64:   request: (operation: McpTerminalOperation) => Promise<unknown>,
65:   notice: (message: string, level: "info" | "warning" | "error") => void) {
66:   initTheme();
67:   const theme = new Theme(options.colors as ConstructorParameters<typeof Theme>[0],
68:     options.colors as ConstructorParameters<typeof Theme>[1], "truecolor");
69:   const definitions = { ...TUI_KEYBINDINGS, ...Object.fromEntries(Object.keys(options.keybindings).map(key => [key, { defaultKeys: [] }])) };
70:   // MCP uses the public TUI keybinding methods. Pi's additional file-loader class is not a runtime SDK export.
71:   const keybindings = new KeybindingsManager(definitions, options.keybindings as ConstructorParameters<typeof KeybindingsManager>[1]) as PiKeybindingsManager;
72:   const terminal = new RemoteTerminal(options, send, request);
73:   async function custom<T>(
74:     factory: (tui: TUI, theme: Theme, keys: PiKeybindingsManager, done: (value: T) => void) => ReturnType<Parameters<ExtensionUIContext["custom"]>[0]>,
75:     customOptions?: Parameters<ExtensionUIContext["custom"]>[1],
76:   ): Promise<T> {
77:     if (customOptions?.overlay) throw new Error("MCP command UI does not support overlay components");
78:     const previousKeys = getKeybindings();
79:     setKeybindings(keybindings);
80:     const tui = new TuiMainScreen(terminal);
81:     let done!: (value: T) => void;
82:     const result = new Promise<T>(resolve => { done = resolve; });
83:     let component: (Component & { dispose?(): void }) | undefined;
84:     try {
85:       component = await factory(tui, theme, keybindings, done);
86:       tui.addChild(component);
87:       tui.setFocus(component);
88:       tui.start();
89:       return await result;
90:     } finally {
91:       tui.stop();
92:       component?.dispose?.();
93:       setKeybindings(previousKeys);
94:     }
95:   }
96:   const ui: Pick<ExtensionUIContext, "custom" | "select" | "input" | "notify" | "theme"> = {
97:     theme, custom, notify: (message, level = "info") => notice(message, level),
98:     select: (title, choices, options) => custom((tui, _theme, _keys, done) =>
99:       new ExtensionSelectorComponent(title, choices, done, () => done(undefined), { tui, ...options })),
100:     input: (title, placeholder, options) => custom((tui, _theme, _keys, done) =>
101:       new ExtensionInputComponent(title, placeholder, done, () => done(undefined), { tui, ...options })),
102:   };
103:   return { ui, input: (data: string) => terminal.input(data),
104:     resize: (viewport: z.infer<typeof mcpViewport>) => terminal.resize(viewport),
105:     disconnect: () => {
106:       // The terminal is gone: restore a known cancel key on this command-owned manager only.
107:       // Native menus must unwind themselves, including their subscriptions and sign-in cancellation.
108:       keybindings.setUserBindings({ "tui.select.cancel": "escape" });
109:       terminal.disconnect();
110:     } };
111: }
```

## packages/local-runtime/src/client.ts

```text
1: import { createConnection } from "node:net";
2: import { once } from "node:events";
3: import { resolve } from "node:path";
4: import { StdioJsonRpcServer } from "@durable-zero/protocol";
5: import { z } from "zod";
6: 
7: export const mcpTerminalOperation = z.discriminatedUnion("op", [
8:   z.object({ op: z.literal("write"), data: z.string() }),
9:   z.object({ op: z.literal("setTitle"), title: z.string() }),
10:   z.object({ op: z.literal("setProgress"), active: z.boolean() }),
11:   z.object({ op: z.literal("setProgramStatus"), status: z.object({
12:     state: z.enum(["idle", "working", "blocked", "done", "error", "clear"]),
13:     app: z.string().optional(), kind: z.enum(["permission", "question", "auth"]).optional(), message: z.string().optional(),
14:   }).transform(status => ({ state: status.state,
15:     ...(status.app === undefined ? {} : { app: status.app }),
16:     ...(status.kind === undefined ? {} : { kind: status.kind }),
17:     ...(status.message === undefined ? {} : { message: status.message }),
18:   })) }),
19:   z.object({ op: z.literal("drainInput"), maxMs: z.number().optional(), idleMs: z.number().optional() }),
20: ]);
21: export type McpTerminalOperation = z.infer<typeof mcpTerminalOperation>;
22: 
23: export function runtimeSocketPath(sessionDir: string): string {
24:   return resolve(sessionDir, ".terminal", "runtime.sock");
25: }
26: 
27: export async function connectRuntime(
28:   sessionDir: string,
29:   onNotification: (method: string, params: Record<string, unknown>) => unknown | Promise<unknown> = () => {},
30: ) {
31:   const socket = createConnection(runtimeSocketPath(sessionDir));
32:   await once(socket, "connect");
33:   const rpc = new StdioJsonRpcServer({
34:     stdin: socket,
35:     stdout: socket,
36:     handler: async (method, params) => onNotification(method, params),
37:   });
38:   socket.on("error", () => socket.destroy());
39:   const closed = new Promise<void>((done) => socket.once("close", () => { rpc.stop(); done(); }));
40:   rpc.start();
41:   return {
42:     request: (method: string, params: Record<string, unknown> = {}) => {
43:       if (socket.destroyed) return Promise.reject(new Error("Disconnected. Reconnect to inspect the session; do not automatically resubmit."));
44:       return rpc.request(method, params);
45:     },
46:     closed,
47:     close: () => { rpc.stop(); socket.destroy(); },
48:   };
49: }
```

## packages/local-runtime/src/index.ts

```text
1: import { createServer, createConnection, type Socket } from "node:net";
2: import { chmod, mkdir, lstat, realpath, unlink } from "node:fs/promises";
3: import { dirname, resolve } from "node:path";
4: import { PassThrough } from "node:stream";
5: import { once } from "node:events";
6: import { runtimeSocketPath } from "./client.ts";
7: import { createClientOutput } from "./notifications.ts";
8: import { expandSkillCommand } from "./skills.ts";
9: import { openSessionCatalog, sessionName, type SessionCatalog } from "./sessions.ts";
10: import { createMcpCommandUI, mcpCommandRequest, mcpViewport } from "./mcp-ui.ts";
11: export { runtimeSocketPath } from "./client.ts";
12: import { z } from "zod";
13: import { assembleDurableZero, type AssembleDurableZeroOptions, type DurableZeroInstance } from "@durable-zero/runner";
14: import { acquireSessionLock, parseConversationId } from "@durable-zero/adapter-pi-durable";
15: import { StdioJsonRpcServer, JsonRpcInvalidParamsError, JsonRpcMethodNotFoundError } from "@durable-zero/protocol";
16: 
17: const conversation = z.object({ conversationId: z.string().min(1).optional() }).strict();
18: const requests = {
19:   "session/prompt": z.object({
20:     content: z.string().min(1).refine((content) => content.trim().length > 0),
21:     options: z.object({
22:       conversationId: z.string().min(1).optional(),
23:       deliverAs: z.enum(["steer", "followUp"]).optional(),
24:     }).strict().optional(),
25:   }).strict(),
26:   "session/abort": conversation,
27:   "session/getState": conversation,
28:   "session/getTranscript": conversation.extend({ limit: z.number().int().positive().optional() }),
29:   "session/getStats": conversation,
30:   "session/getView": z.object({}).strict(),
31:   "session/list": z.object({}).strict(),
32:   "session/describe": z.object({ id: z.string().min(1) }).strict(),
33:   "session/rename": z.object({ name: sessionName }).strict(),
34:   "session/create": z.object({ requestId: z.uuid() }).strict(),
35:   "runtime/info": z.object({}).strict(),
36:   "session/mcpCommand": mcpCommandRequest,
37:   "session/mcpInput": z.object({ data: z.string() }).strict(),
38:   "session/mcpResize": mcpViewport.strict(),
39:   "session/reload": z.object({ path: z.string().trim().min(1).optional() }).strict(),
40:   "session/compact": z.object({ instructions: z.string().optional() }).strict(),
41:   "models/set": z.object({
42:     provider: z.string().trim().min(1), modelId: z.string().trim().min(1),
43:     conversationId: z.string().regex(/^[1-9]\d*$/).optional(),
44:   }).strict(),
45:   "models/cycleThinking": z.object({}).strict(),
46:   "session/toggleTasks": z.object({}).strict(),
47:   "session/switchConversation": z.object({ conversationId: z.string().regex(/^[1-9]\d*$/) }).strict(),
48: };
49: 
50: export interface RuntimeOptions {
51:   sessionDir: string;
52:   cwd?: string;
53:   provider?: string;
54:   model?: string;
55:   extensions?: string[];
56: }
57: 
58: /** Owns one Zero assembly. A connection owns only its transport, never the Harness. */
59: export async function startRuntime(options: RuntimeOptions) {
60:   const socketPath = runtimeSocketPath(options.sessionDir);
61:   if (Buffer.byteLength(socketPath) > 103) {
62:     throw new Error("Unix socket path is too long. Use a shorter --session-dir path.");
63:   }
64:   await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
65:   // Reuse Zero's public process-owner lease for the endpoint directory, not a second Harness/session store.
66:   const releaseEndpoint = await acquireSessionLock(dirname(socketPath), options.cwd ?? process.cwd(), "terminal-transport");
67:   const input = new PassThrough();
68:   const output = new PassThrough();
69:   const clients = new Map<Socket, ReturnType<typeof createClientOutput>["notify"]>();
70:   let instance: DurableZeroInstance | undefined;
71:   let unsubscribeView: (() => void) | undefined;
72:   let viewRevision = 0;
73:   let catalog: SessionCatalog;
74:   let displayName: string;
75:   let commands: Promise<unknown> = Promise.resolve();
76:   let activeMcpUI: { socket: Socket; bridge: ReturnType<typeof createMcpCommandUI>; completion: Promise<void> } | undefined;
77:   let assemblyOptions: AssembleDurableZeroOptions = {
78:     ...options, sessionDir: resolve(options.sessionDir), noGlobalExtensions: true, stdin: input, stdout: output,
79:   };
80:   const attachAssembly = async () => {
81:     instance = await assembleDurableZero(assemblyOptions);
82:     if (!instance.view || !instance.controller) throw new Error("The terminal runtime requires native presentation and control ports");
83:     const session = instance.view.current().session;
84:     catalog = await openSessionCatalog(session.directory, session.cwd, [
85:       ...(assemblyOptions.extensions ?? (assemblyOptions.extension ? [assemblyOptions.extension] : [])),
86:       ...(process.env.PI_ADDITIONAL_EXTENSIONS?.split(",").map(path => path.trim()).filter(Boolean) ?? []),
87:     ]);
88:     displayName = (await catalog.describe(session.directory)).name;
89:     unsubscribeView = instance.view.subscribe(() => { ++viewRevision; notify("session/view", envelope()); });
90:   };
91:   const envelope = () => ({
92:     view: instance!.view!.current(), revision: viewRevision, sessionName: displayName,
93:     resources: {
94:       skills: (instance!.resources?.getSkills() ?? []).map(({ name, description, filePath, baseDir }) => ({ name, description, filePath, baseDir })),
95:       enableSkillCommands: instance!.resources?.getEnableSkillCommands() ?? false,
96:     },
97:   });
98:   const notify = (method: string, params: Record<string, unknown>) => {
99:     for (const send of clients.values()) send(method, params);
100:   };
101:   // Reuse Zero's dispatcher through its public stream interface, rather than copying its routing.
102:   const bridge = new StdioJsonRpcServer({
103:     stdin: output,
104:     stdout: input,
105:     handler: async (method, params) => { notify(method, params); },
106:   });
107:   bridge.start();
108:   const server = createServer((socket) => {
109:     // Assembly assignment precedes asynchronous catalog loading. Do not admit discovery
110:     // or initial views until the complete host envelope is ready.
111:     if (!instance || displayName === undefined) { socket.destroy(); return; }
112:     const transport = createClientOutput(socket);
113:     const client = new StdioJsonRpcServer({
114:       stdin: socket,
115:       stdout: transport.output,
116:       handler: async (method, params) => {
117:         if (!Object.hasOwn(requests, method)) throw new JsonRpcMethodNotFoundError(method);
118:         const schema = requests[method as keyof typeof requests];
119:         const parsed = schema.safeParse(params);
120:         if (!parsed.success) throw new JsonRpcInvalidParamsError(parsed.error.message);
121:         if (method === "session/mcpInput" || method === "session/mcpResize") {
122:           if (activeMcpUI?.socket !== socket) throw new Error("This connection does not own an MCP manager");
123:           if (method === "session/mcpInput") activeMcpUI.bridge.input((parsed.data as { data: string }).data);
124:           else activeMcpUI.bridge.resize(parsed.data as z.infer<typeof mcpViewport>);
125:           return { ok: true };
126:         }
127:         if (method === "session/mcpCommand") {
128:           // Serialize admission, not the menu's lifetime: other clients can still abort active work.
129:           const started = commands.then(() => {
130:             if (socket.destroyed) throw new Error("MCP terminal disconnected before admission");
131:             if (activeMcpUI) throw new Error("An MCP manager is already open. Close it first.");
132:             const request = parsed.data as z.infer<typeof mcpCommandRequest>;
133:             const ui = createMcpCommandUI(request,
134:               event => transport.notify("session/mcpTerminal", event),
135:               event => client.request("session/mcpTerminal", event),
136:               (message, level) => transport.notify("session/mcpNotice", { message, level }));
137:             const completion = Promise.resolve().then(() => instance!.controller!.executeMcpCommand(request.args, ui.ui))
138:               .finally(() => { if (activeMcpUI?.bridge === ui) activeMcpUI = undefined; });
139:             activeMcpUI = { socket, bridge: ui, completion };
140:             return { completion };
141:           });
142:           commands = started.then(() => undefined, () => undefined);
143:           return (await started).completion.then(() => ({ ok: true }));
144:         }
145:         // Serialize admission with reload so no prompt can slip between the idle check and close.
146:         const operation = commands.then(async () => {
147:         const engine = instance!.engine;
148:         switch (method) {
149:           case "session/reload": {
150:             if (activeMcpUI) throw new Error("Cannot reload: close the MCP manager first.");
151:             if (!await instance!.isIdle?.()) throw new Error("Cannot reload: active work is running. Wait for completion or abort it first.");
152:             const { path } = parsed.data as z.infer<typeof requests["session/reload"]>;
153:             const extensionPath = path ? await realpath(resolve(options.cwd ?? process.cwd(), path)) : undefined;
154:             const selected = instance!.view!.current().conversation.conversation.id;
155:             unsubscribeView?.();
156:             await instance!.close();
157:             assemblyOptions = { ...assemblyOptions };
158:             // Preserve the model selected in the persisted session instead of reapplying startup overrides.
159:             delete assemblyOptions.provider;
160:             delete assemblyOptions.model;
161:             if (extensionPath) assemblyOptions.extensions = [...(assemblyOptions.extensions ?? []), extensionPath];
162:             try {
163:               await attachAssembly();
164:               await instance!.controller!.switchConversation(selected);
165:             } catch (error) { await close(); throw error; }
166:             ++viewRevision;
167:             notify("session/view", envelope());
168:             return { ok: true };
169:           }
170:           case "session/list": return catalog.list();
171:           case "session/describe": return catalog.describe((parsed.data as { id: string }).id);
172:           case "session/rename": {
173:             displayName = await catalog.rename((parsed.data as { name: string }).name);
174:             ++viewRevision;
175:             notify("session/view", envelope());
176:             return displayName;
177:           }
178:           case "session/create": {
179:             const agent = instance!.view!.current().conversation.docs["pi.agent"] as { model?: { provider?: string; id?: string; modelId?: string } } | undefined;
180:             return catalog.create((parsed.data as { requestId: string }).requestId, {
181:               provider: agent?.model?.provider, model: agent?.model?.modelId ?? agent?.model?.id,
182:             });
183:           }
184:           case "session/getView": return envelope();
185:           case "runtime/info": return { pid: process.pid, entrypoint: resolve(process.argv[1]!), cwd: instance!.view!.current().session.cwd };
186:           case "session/prompt": {
187:             const prompt = parsed.data as z.infer<typeof requests["session/prompt"]>;
188:             const content = await expandSkillCommand(prompt.content, instance!.resources?.getSkills() ?? []);
189:             return bridge.request(method, { ...prompt, content });
190:           }
191:           case "session/compact": await engine.compact((parsed.data as z.infer<typeof requests["session/compact"]>).instructions); return { ok: true };
192:           case "models/set": {
193:             const { conversationId, ...model } = parsed.data as z.infer<typeof requests["models/set"]>;
194:             await instance!.controller!.setModel(model, conversationId === undefined ? undefined : parseConversationId(conversationId));
195:             return { ok: true };
196:           }
197:           case "models/cycleThinking": await instance!.controller!.cycleThinking(); return { ok: true };
198:           case "session/toggleTasks": await instance!.controller!.toggleTasks(); return { ok: true };
199:           case "session/switchConversation": await instance!.controller!.switchConversation(parseConversationId((parsed.data as z.infer<typeof requests["session/switchConversation"]>).conversationId)); return { ok: true };
200:           default: return bridge.request(method, parsed.data);
201:         }
202:         });
203:         commands = operation.then(() => undefined, () => undefined);
204:         return operation;
205:       },
206:     });
207:     clients.set(socket, transport.notify);
208:     socket.on("error", () => socket.destroy());
209:     socket.once("close", () => {
210:       if (activeMcpUI?.socket === socket) activeMcpUI.bridge.disconnect();
211:       client.stop(); clients.delete(socket);
212:     });
213:     client.start();
214:   });
215:   let closing: Promise<void> | undefined;
216:   const close = (): Promise<void> => closing ??= (async () => {
217:     const pendingMcpUI = activeMcpUI;
218:     pendingMcpUI?.bridge.disconnect();
219:     for (const socket of clients.keys()) socket.destroy();
220:     await pendingMcpUI?.completion.catch(() => {});
221:     if (server.listening) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
222:     unsubscribeView?.();
223:     bridge.stop();
224:     input.destroy();
225:     output.destroy();
226:     try { await instance?.close(); } finally { await releaseEndpoint(); }
227:   })();
228:   try {
229:     const endpoint = await lstat(socketPath).catch((error: NodeJS.ErrnoException) => {
230:       if (error.code !== "ENOENT") throw error;
231:       return undefined;
232:     });
233:     if (endpoint) {
234:       if (!endpoint.isSocket()) throw new Error(`Refusing to remove a non-socket endpoint: ${socketPath}`);
235:       const probe = createConnection(socketPath);
236:       probe.setTimeout(500, () => probe.destroy(new Error("Endpoint probe timed out; refusing socket removal")));
237:       try {
238:         await once(probe, "connect");
239:         throw new Error(`Session already has a live endpoint: ${socketPath}`);
240:       } catch (error) {
241:         if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
242:       } finally { probe.destroy(); }
243:       await unlink(socketPath);
244:     }
245:     const listening = once(server, "listening");
246:     server.listen(socketPath);
247:     await listening;
248:     await chmod(socketPath, 0o600);
249:     await attachAssembly();
250:     return { socketPath, close };
251:   } catch (error) {
252:     await close();
253:     throw error;
254:   }
255: }
```

## Diff: packages/adapter-pi-durable/src/engine/extension-mount.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/extension-mount.ts
+++ candidate/packages/adapter-pi-durable/src/engine/extension-mount.ts
@@ -1,9 +1,9 @@
 import { type DefaultResourceLoader, type ModelRuntime, ExtensionRunner } from "@earendil-works/pi-coding-agent";
-import { defineExtension, hook, ToolTask, type Registry } from "@earendil-works/pi-durable";
+import { defineExtension, hook, GenerationTask, ToolTask, type Registry } from "@earendil-works/pi-durable";
 import { adaptExtensionTool, installExtensionTools, type NestedToolExecutor } from "./tool-adapter.ts";
 import { setupExtensionRunner } from "./extension-bridge.ts";
 import type { SessionLocation } from "@durable-zero/adapter-pi-durable";
 import { runtimeContext } from "./runtime-types.ts";
 import type { DynamicSectionsHolder } from "./prompt.ts";
 import type { DynamicCodemodeNamespaces } from "./codemode-namespaces.ts";
 
@@ -171,29 +171,36 @@
 			onCompact: (i) => actionsDelegate?.onCompact?.(i),
 			getContextUsage: () => actionsDelegate?.getContextUsage?.(),
 			isIdle: () => (actionsDelegate?.isIdle ? actionsDelegate.isIdle() : true),
 			...(actionsDelegate?.onSubmitUserMessage ? { onSubmitUserMessage: (c: string, d?: "steer" | "followUp") => actionsDelegate.onSubmitUserMessage!(c, d) } : {}),
 		});
 
 		if (extensionRunner) {
-			// The SDK has no public readiness method. Its headless status command waits for initial
-			// connections, so settle those before Harness.open can pin a task's registry snapshot.
-			const mcpStatus = extensionRunner.getRegisteredCommands().find(command =>
-				command.name === "mcp" && command.sourceInfo.path === "<inline:mcp>");
-			if (mcpStatus) await mcpStatus.handler("", extensionRunner.createCommandContext());
-			syncToolsToRegistry();
+			// MCP startup belongs to Pi's background connections, cancelled by session_shutdown.
+			// Its status command can wait indefinitely; never make it an assembly readiness barrier.
 			extensionRunner.onError((err) => {
 				report(err);
 				onNotice?.("error", `[Extension Error] ${err.extensionPath} (${err.event}): ${err.error}`);
 			});
 			syncToolsToRegistry();
-			// Native discovery tools must run the same readiness and permission hooks as Pi tools.
+			const mcpReadiness = extensionsResult.extensions.find(extension => extension.path === "<inline:mcp>")?.handlers.get("tool_call") ?? [];
 			registry.install(defineExtension({
 				name: "pi-discovery-hooks",
-				hooks: [hook(ToolTask, {
+				hooks: [hook(GenerationTask, {
+					async afterResponse(message, _api, context) {
+						// Wait before tool tasks take their immutable registry snapshots, not during startup.
+						// Only the built-in MCP readiness handlers run here; permissions still run beforeTool.
+						for (const call of message.content) {
+							if (call.type !== "toolCall" || (call.name !== "codemode" && call.name !== "tool_search")) continue;
+							for (const ready of mcpReadiness) await ready({
+								type: "tool_call", toolName: call.name, toolCallId: call.id, input: call.arguments,
+							}, { ...extensionRunner!.createContext(), signal: context.abortSignal });
+						}
+					},
+				}), hook(ToolTask, {
 					async beforeTool(call) {
 						if (call.name !== "codemode" && call.name !== "tool_search") return;
 						// Preserve SDK discovery readiness and permission hooks for real native calls.
 						const decision = await extensionRunner!.emitToolCall({
 							type: "tool_call", toolName: call.name, toolCallId: call.id,
 							input: call.arguments as Record<string, unknown>,
 						});

```

## Diff: packages/adapter-pi-durable/src/engine/runtime-controller.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/runtime-controller.ts
+++ candidate/packages/adapter-pi-durable/src/engine/runtime-controller.ts
@@ -62,14 +62,22 @@
 		if (model === undefined) {
 			throw new Error(ref === undefined ? "No model selected" : "Current model is unavailable");
 		}
 		return model;
 	};
 
 	return {
+		async executeMcpCommand(args, ui) {
+			const runner = ctx.extensionRunner;
+			const registered = runner?.getRegisteredCommands().find(command => command.name === "mcp" && command.sourceInfo.path === "<inline:mcp>");
+			if (!runner || !registered) throw new Error("Native MCP command is unavailable");
+			// Keep the runtime's headless context unchanged. Only this command owns a terminal UI.
+			const context = runner.createCommandContext();
+			await registered.handler(args, { ...context, ui: { ...context.ui, ...ui }, mode: "tui", hasUI: true });
+		},
 		submit: (input, whenBusy, conversationId) =>
 			command(async () => {
 				const target = conversationId === undefined ? ctx.bindings.current : await ctx.opened.conversation(conversationId, runtimeContext);
 				if (!target) throw new Error(`Conversation ${conversationId} does not exist`);
 				const isStr = typeof input === "string";
 				const prompt = isStr ? input : input.filter((c) => c.type === "text").map((c: any) => c.text).join("\n");
 				const images = isStr ? undefined : (input.filter((c) => c.type === "image") as any[]);

```

## Diff: packages/adapter-pi-durable/src/engine/runtime-hydration.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/runtime-hydration.ts
+++ candidate/packages/adapter-pi-durable/src/engine/runtime-hydration.ts
@@ -1,8 +1,9 @@
-import type { Conversation, ConversationId, ConversationView, Cursor, Harness, TaskGraph } from "@earendil-works/pi-durable";
+import { LiveDoc, InboxDoc, type Conversation, type ConversationId, type ConversationView, type Cursor, type Harness, type TaskGraph } from "@earendil-works/pi-durable";
+import { SubagentsDoc, type SubagentsState } from "./subagent-docs.ts";
 import { firstInput, type ConversationSummary, type RuntimeReadBinding, runtimeContext } from "./runtime-types.ts";
 
 export function hydrateSessionActiveTools(
 	rootAgent: { readonly tools?: readonly { readonly name: string }[] | undefined },
 	activeEnvState: { readonly setActiveTools?: (tools: string[]) => void },
 ): void {
 	if (Array.isArray(rootAgent.tools)) {
@@ -62,17 +63,40 @@
 		},
 		dispose() {
 			void watch.stop();
 		},
 	};
 }
 
+export function applySubagentSummaries(input: readonly ConversationSummary[], parentId: ConversationId, doc: Readonly<SubagentsState>): ConversationSummary[] {
+	return input.map(row => {
+		const found = Object.entries(doc.agents).find(([, agent]) => agent.conversationId === row.id);
+		if (!found) return row;
+		const [key, agent] = found;
+		const sending = doc.sending?.reports.some(report => report.name === agent.name) ?? false;
+		return { ...row, key, parentId, label: agent.name, title: agent.task, role: agent.role,
+			ownerTaskId: agent.ownerTaskId, reporter: agent.reporter,
+			deliveryPending: sending || (doc.outbox?.some(report => report.name === agent.name) ?? false),
+			hold: sending ? doc.deliveryHold?.reason : undefined };
+	});
+}
+
 export async function loadSummaries(harness: Harness, rootId: ConversationId): Promise<ConversationSummary[]> {
-	const summaries: ConversationSummary[] = [];
+	let summaries: ConversationSummary[] = [];
+	const groups: Array<{ id: ConversationId; doc: Readonly<SubagentsState> }> = [];
 	let cursor: Cursor | undefined;
 	do {
 		const page = await harness.commit((tx) => tx.scanConversations({}, 256, cursor), runtimeContext);
-		for (const { id } of page.items) summaries.push({ id, label: id === rootId ? "main" : `subagent ${id}`, ...(await firstInput(harness, id)) });
+		for (const { id } of page.items) {
+			const [input, live, inbox, doc] = await Promise.all([
+				firstInput(harness, id), harness.snapshot(LiveDoc, id, runtimeContext),
+				harness.snapshot(InboxDoc, id, runtimeContext), harness.snapshot(SubagentsDoc, id, runtimeContext),
+			]);
+			summaries.push({ id, label: id === rootId ? "main" : `subagent ${id}`, ...input,
+				...(live === undefined ? {} : { live }), ...(inbox === undefined ? {} : { inbox }) });
+			if (doc) groups.push({ id, doc });
+		}
 		cursor = page.next;
 	} while (cursor !== undefined);
+	for (const { id, doc } of groups) summaries = applySubagentSummaries(summaries, id, doc);
 	return summaries;
 }

```

## Diff: packages/adapter-pi-durable/src/engine/runtime-types.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/runtime-types.ts
+++ candidate/packages/adapter-pi-durable/src/engine/runtime-types.ts
@@ -1,25 +1,25 @@
 import type { AttachedReplicatedState } from "@earendil-works/chord";
 import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
-import type { ModelThinkingLevel, ImageContent, TextContent } from "@earendil-works/pi-ai";
+import type { ModelThinkingLevel, ImageContent, TextContent, AssistantMessage } from "@earendil-works/pi-ai";
 import {
 	type AgentState,
 	type ConversationId,
 	type Conversation,
 	type ConversationView,
 	type Cursor,
 	type EntryRecord,
 	type Harness,
 	type ModelRef,
 	ROOT_CONVERSATION_ID,
 	type TaskGraph,
 } from "@earendil-works/pi-durable";
 export { ROOT_CONVERSATION_ID };
 export type { Cursor, ImageContent, TextContent };
-import type { ModelRuntime, SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
+import type { ExtensionUIContext, ModelRuntime, SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
 import type { Provider } from "@earendil-works/pi-ai";
 import type { SubagentPolicyHolder, ExecutionEnvFactory } from "@durable-zero/core";
 import type { PromptOptions, DynamicPromptSections } from "./prompt.ts";
 import type { BuiltinExtension } from "./builtin-extensions/types.ts";
 
 export interface IHostBridge {
 	// optional pure port in Slice 0
@@ -56,14 +56,24 @@
 	readonly message: string;
 }
 
 export interface ConversationSummary {
 	readonly id: ConversationId;
 	readonly label: string;
 	readonly title?: string;
+	readonly live?: Readonly<import("@earendil-works/pi-durable").LiveState> | undefined;
+	readonly inbox?: Readonly<import("@earendil-works/pi-durable").InboxState> | undefined;
+	readonly lastStop?: AssistantMessage["stopReason"];
+	readonly parentId?: ConversationId;
+	readonly key?: string;
+	readonly role?: string;
+	readonly ownerTaskId?: import("@earendil-works/pi-durable").TaskId;
+	readonly reporter?: import("@earendil-works/pi-durable").TaskId | undefined;
+	readonly deliveryPending?: boolean;
+	readonly hold?: string | undefined;
 }
 
 export interface DurableView {
 	readonly session: { readonly id: string; readonly directory: string; readonly cwd: string };
 	readonly conversation: ConversationView;
 	readonly conversations: readonly ConversationSummary[];
 	readonly models: readonly ModelSummary[];
@@ -95,14 +105,15 @@
 	readonly conversationId: string;
 	readonly status: "accepted";
 	readonly sequence?: number;
 	readonly submission?: import("@earendil-works/pi-durable").Submission;
 }
 
 export interface DurableController {
+	executeMcpCommand(args: string, ui: Pick<ExtensionUIContext, "custom" | "select" | "input" | "notify" | "theme">): Promise<void>;
 	submit(content: string | (import("@earendil-works/pi-ai").TextContent | import("@earendil-works/pi-ai").ImageContent)[], whenBusy: "steer" | "followUp", conversationId?: ConversationId): Promise<AdmissionReceipt>;
 	compact(instructions: string | undefined): Promise<void>;
 	abort(conversationId?: ConversationId): Promise<void>;
 	cycleThinking(): Promise<void>;
 	setThinkingLevel(level: ModelThinkingLevel): Promise<void>;
 	setModel(model: ModelRef, expectedConversationId?: ConversationId): Promise<void>;
 	toggleTasks(): Promise<void>;
@@ -158,19 +169,22 @@
 	const text =
 		typeof message.content === "string"
 			? message.content
 			: message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(" ");
 	return { title: text.replace(/\s+/g, " ").trim() };
 }
 
-export async function firstInput(harness: Harness, id: ConversationId): Promise<{ title?: string }> {
+export async function firstInput(harness: Harness, id: ConversationId): Promise<Pick<ConversationSummary, "title" | "lastStop">> {
 	if (id === ROOT_CONVERSATION_ID) return {};
 	const conversation = (await harness.conversation(id, runtimeContext))!;
 	let first: EntryRecord | undefined;
+	let lastStop: AssistantMessage["stopReason"] | undefined;
 	let cursor: Cursor | undefined;
 	do {
 		const page = await conversation.entries({}, 256, cursor, runtimeContext);
 		first = [...page.items].reverse().find((entry) => entry.kind === "pi.user") ?? first;
+		const assistant = page.items.find(entry => entry.kind === "pi.assistant")?.model?.[0];
+		if (lastStop === undefined && assistant?.role === "assistant") lastStop = assistant.stopReason;
 		cursor = page.next;
 	} while (cursor !== undefined);
-	return titleOf(first);
+	return { ...titleOf(first), ...(lastStop === undefined ? {} : { lastStop }) };
 }

```

## Diff: packages/adapter-pi-durable/src/engine/runtime.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/runtime.ts
+++ candidate/packages/adapter-pi-durable/src/engine/runtime.ts
@@ -8,15 +8,16 @@
 	agentOf, firstInput, titleOf, type ConversationSummary, type DurableView,
 	type ModelSummary, type Notice, type OpenDurableOptions, type OpenDurableResult, runtimeContext,
 } from "./runtime-types.ts";
 import { createDurableController } from "./runtime-controller.ts";
 import { RuntimeBindings } from "./runtime-bindings.ts";
 import { closeRuntimeResources } from "./runtime-cleanup.ts";
 import { loadHarnessEnvironment, type LoadedHarnessEnvironment } from "./runtime-loader.ts";
-import { hydrateSessionActiveTools, loadSummaries, createConversationBinding } from "./runtime-hydration.ts";
+import { hydrateSessionActiveTools, loadSummaries, createConversationBinding, applySubagentSummaries } from "./runtime-hydration.ts";
+import type { SubagentsState } from "./subagent-docs.ts";
 
 export { hydrateSessionActiveTools } from "./runtime-hydration.ts";
 
 export async function openDurable(options: OpenDurableOptions = {}): Promise<OpenDurableResult> {
 	const executionEnvFactory = options.dependencies?.executionEnvFactory ?? options.executionEnvFactory;
 	const nativeExecutionEnvFactory = options.dependencies?.nativeExecutionEnvFactory ?? options.nativeExecutionEnvFactory;
 
@@ -114,20 +115,33 @@
 		activeEnvState.setNoticeForwarder?.((level, message) => notice(level, message));
 
 		const bindings = new RuntimeBindings(root, conversation, update);
 
 		const handlePublication = (pub: any) => {
 			let convs = state.conversations;
 			for (const ch of pub.changes ?? []) {
-				if (ch.type === "conversation") {
+				if (ch.type === "conversation" && !convs.some(row => row.id === ch.value.id))
 					convs = [...convs, { id: ch.value.id, label: ch.value.id === root.id ? "main" : `subagent ${ch.value.id}` }];
-				} else if (ch.type === "entry" && ch.value.kind === "pi.user") {
+			}
+			for (const ch of pub.changes ?? []) {
+				if (ch.type === "entry" && ch.value.kind === "pi.user") {
 					const id = ch.value.conversationId;
 					convs = convs.map((s) => s.id === id && !s.title ? { ...s, ...titleOf(ch.value) } : s);
+				} else if (ch.type === "entry" && ch.value.kind === "pi.assistant") {
+					const message = ch.value.model?.[0];
+					if (message?.role === "assistant") convs = convs.map(row => row.id === ch.value.conversationId ? { ...row, lastStop: message.stopReason } : row);
+				} else if (ch.type === "document" && ch.kind === "change" && ch.conversationId !== undefined && ch.record.key === undefined) {
+					if (ch.record.kind === "pi.live") convs = convs.map(row => row.id === ch.conversationId ? { ...row, live: ch.value } : row);
+					if (ch.record.kind === "pi.inbox") convs = convs.map(row => row.id === ch.conversationId ? { ...row, inbox: ch.value } : row);
 				}
+			}
+			// A publication can create children and update their registry in any change order.
+			for (const ch of pub.changes ?? []) {
+				if (ch.type === "document" && ch.kind === "change" && ch.conversationId !== undefined && ch.record.kind === "durable.subagents" && ch.record.key === undefined)
+					convs = applySubagentSummaries(convs, ch.conversationId, ch.value as SubagentsState);
 			}
 			if (convs !== state.conversations) update({ conversations: convs });
 		};
 
 		const observation = typeof (harness as any).observeCommits === "function"
 			? (harness as any).observeCommits({ advance: handlePublication, end: () => {} })
 			: undefined;

```

## Diff: packages/adapter-pi-durable/src/engine/shared/extension-runner.ts

```diff
--- base/packages/adapter-pi-durable/src/engine/shared/extension-runner.ts
+++ candidate/packages/adapter-pi-durable/src/engine/shared/extension-runner.ts
@@ -28,28 +28,29 @@
 	return [createMcpExtension()];
 }
 
 import { createExtensionUIContext } from "./extension-ui-context.ts";
 export { createExtensionUIContext };
 
 export interface CreateExtensionActionsOptions {
-	getRegisteredTools?: () => Array<{ definition: { name: string; description?: string; parameters?: unknown; promptGuidelines?: string; exposure?: string; namespace?: string; annotations?: unknown }; sourceInfo?: unknown }>;
+	getRegisteredTools?: () => Array<{ definition: { name: string; description?: string; parameters?: unknown; promptGuidelines?: string; exposure?: string; defaultActive?: boolean; namespace?: string; annotations?: unknown }; sourceInfo?: unknown }>;
 	getCallableTools?: () => Array<{ name: string; description: string; parameters: unknown }>;
 	settingsManager?: SettingsManager;
 	onActiveToolsChanged?: (tools: string[]) => void;
 	onToolsChanged?: () => void;
 	sessionManager?: SessionManager;
 	onSubmitUserMessage?: (content: any, deliverAs?: "steer" | "followUp") => Promise<void> | void;
 }
 
 export function createExtensionActions(
 	options: CreateExtensionActionsOptions,
 	initialActiveTools: string[] = [],
 ): ExtensionActions {
 	let activeToolNames = [...initialActiveTools];
+	const registeredExposures = new Map<string, string>();
 	let sessionName: string | undefined;
 
 	const sendMessage: ExtensionActions["sendMessage"] = (message: any, sendOptions?: any) => {
 		if (sendOptions?.triggerTurn && message?.content) {
 			const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
 			void options.onSubmitUserMessage?.(text, sendOptions.deliverAs === "steer" ? "steer" : "followUp");
 		}
@@ -96,14 +97,27 @@
 		}),
 		setActiveTools: (toolNames: string[]) => {
 			activeToolNames = [...toolNames];
 			options.onActiveToolsChanged?.(activeToolNames);
 		},
 		refreshTools: () => {
 			options.onToolsChanged?.();
+			const active = new Set(activeToolNames);
+			for (const { definition } of options.getRegisteredTools?.() ?? []) {
+				const exposure = definition.exposure ?? "direct";
+				if (exposure === "hidden") active.delete(definition.name);
+				else if (registeredExposures.get(definition.name) !== exposure && definition.defaultActive !== false &&
+					(exposure === "direct" || exposure === "model-only")) active.add(definition.name);
+				registeredExposures.set(definition.name, exposure);
+			}
+			const next = [...active];
+			if (next.length !== activeToolNames.length || next.some((name, index) => name !== activeToolNames[index])) {
+				activeToolNames = next;
+				options.onActiveToolsChanged?.(next);
+			}
 		},
 		getThinkingLevel: () => (options.settingsManager?.getDefaultThinkingLevel?.() ?? "high") as "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
 		setThinkingLevel: () => {},
 		setModel: async () => false,
 		getCommands: () => [],
 		sendMessage,
 		sendUserMessage,
@@ -200,11 +214,12 @@
 						namespace: t.definition.namespace,
 						annotations: t.definition.annotations,
 						sourceInfo: t.sourceInfo,
 					})) as any),
 	};
 
 	runner.bindCore(actions, contextActions);
+	actions.refreshTools();
 
 	await runner.emit({ type: "session_start", reason: "startup" });
 	return runner;
 }

```
