import type { DurableView as NativeDurableView } from "@durable-zero/adapter-pi-durable";
import { connectRuntime, mcpTerminalOperation } from "@local-durable/runtime/client";
import { ProcessTerminal, type McpTerminalHost, type TerminalController, type TerminalView, type TerminalViewSource } from "@local-durable/terminal-ui";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { sessionDescriptor, type SessionDescriptor, type SessionSummary } from "@local-durable/runtime/sessions";

// Validate the transport envelope once. Native document and message values remain native values.
const envelopeSchema = z.object({ revision: z.number().int().nonnegative(), view: z.looseObject({
  session: z.looseObject({ id: z.string(), directory: z.string(), cwd: z.string() }),
  conversation: z.looseObject({
    conversation: z.looseObject({ id: z.number().int().positive() }),
    entries: z.array(z.looseObject({ id: z.number().int(), kind: z.string() })),
    docs: z.record(z.string(), z.unknown()),
  }),
  conversations: z.array(z.looseObject({ id: z.number().int().positive(), label: z.string() })),
  models: z.array(z.looseObject({ provider: z.string(), modelId: z.string(), name: z.string(), contextWindow: z.number() })),
  notices: z.array(z.looseObject({ id: z.number(), level: z.enum(["info", "warning", "error"]), message: z.string() })),
}), sessionName: z.string().optional(), resources: z.object({
  skills: z.array(z.object({ name: z.string().min(1), description: z.string(), filePath: z.string(), baseDir: z.string() })),
  enableSkillCommands: z.boolean(),
}).optional() });

export interface ViewEnvelope {
  readonly revision: number;
  readonly view: NativeDurableView;
  readonly sessionName?: string;
  readonly resources?: { readonly skills: TerminalView["skills"]; readonly enableSkillCommands: boolean };
}

export function parseViewEnvelope(value: unknown): ViewEnvelope {
  envelopeSchema.parse(value);
  // Keep the native view, including fields outside the renderer's minimum boundary schema.
  return value as ViewEnvelope;
}

export function presentView(view: NativeDurableView, connection: TerminalView["connection"], resources?: ViewEnvelope["resources"], sessionName?: string): TerminalView {
  return {
    ...view,
    session: { ...view.session, name: sessionName ?? view.session.id },
    // Nonselected activity comes from native summaries; selected documents are the current native view.
    conversations: view.conversations.map(row => row.id === view.conversation.conversation.id ? {
      ...row,
      ...(view.conversation.docs["pi.live"] === undefined ? {} : { live: view.conversation.docs["pi.live"] as NativeDurableView["conversations"][number]["live"] }),
      ...(view.conversation.docs["pi.inbox"] === undefined ? {} : { inbox: view.conversation.docs["pi.inbox"] as NativeDurableView["conversations"][number]["inbox"] }),
    } : row),
    connection,
    automation: { scheduled: 0, failed: 0, unavailable: true },
    attention: { requests: [], unavailable: true },
    skills: resources?.skills ?? [],
    enableSkillCommands: resources?.enableSkillCommands ?? false,
    tasksExpanded: view.tasks !== undefined,
  };
}

export type RuntimeConnection = Awaited<ReturnType<typeof connectRuntime>>;
export type RuntimeConnector = typeof connectRuntime;

/** A transport client only. It never opens a Harness, session database, or model loop. */
export class ZeroTerminalClient implements TerminalController, TerminalViewSource {
  #transport: RuntimeConnection;
  #native: NativeDurableView;
  #revision: number;
  #resources: ViewEnvelope["resources"];
  #sessionName: string | undefined;
  #view: TerminalView;
  #listeners = new Set<() => void>();
  #stopped = false;
  #failure: Error | undefined;
  #mcpTerminal: ProcessTerminal | undefined;
  #mcpReady = false;
  readonly closed: Promise<void>;

  private constructor(transport: RuntimeConnection, initial: ViewEnvelope) {
    this.#transport = transport;
    this.#native = initial.view;
    this.#revision = initial.revision;
    this.#resources = initial.resources;
    this.#sessionName = initial.sessionName;
    this.#view = presentView(initial.view, "online", this.#resources, this.#sessionName);
    this.closed = transport.closed.then(() => {
      this.#stopped = true;
      this.#view = presentView(this.#native, "offline", this.#resources, this.#sessionName);
      this.#emit();
    });
  }

  static async open(sessionDir: string, connect: RuntimeConnector = connectRuntime): Promise<ZeroTerminalClient> {
    let client: ZeroTerminalClient | undefined;
    let pending: ViewEnvelope | undefined;
    let failure: Error | undefined;
    let transport: RuntimeConnection | undefined;
    transport = await connect(sessionDir, (method, params) => {
      if (method === "session/mcpTerminal") {
        if (!client) throw new Error("MCP UI output before client initialization");
        return client.#terminalOperation(params);
      }
      if (method === "session/mcpNotice") {
        const notice = z.object({ message: z.string(), level: z.enum(["info", "warning", "error"]) }).parse(params);
        if (client) client.#mcpTerminal?.write(`\r\n${notice.level}: ${notice.message}\r\n`);
        return;
      }
      if (method !== "session/view") return;
      try {
        const envelope = parseViewEnvelope(params);
        if (client) client.#apply(envelope);
        else if (!pending || envelope.revision > pending.revision) pending = envelope;
      } catch (error) {
        failure = new Error("Invalid session/view notification", { cause: error });
        if (client) client.#failure = failure;
        transport?.close();
      }
    });
    try {
      const initial = parseViewEnvelope(await transport.request("session/getView"));
      if (failure) throw failure;
      // Either message can be newer. Revision orders both responses and notifications.
      client = new ZeroTerminalClient(transport, pending && pending.revision > initial.revision ? pending : initial);
      return client;
    } catch (error) {
      transport.close();
      throw error;
    }
  }

  #terminalOperation(value: unknown): void | Promise<void> {
    if (!this.#mcpTerminal) throw new Error("No active MCP terminal");
    const event = mcpTerminalOperation.parse(value);
    switch (event.op) {
      case "write": this.#mcpReady = true; return this.#mcpTerminal.write(event.data);
      case "setTitle": return this.#mcpTerminal.setTitle(event.title);
      case "setProgress": return this.#mcpTerminal.setProgress(event.active);
      case "setProgramStatus": return this.#mcpTerminal.setProgramStatus(event.status);
      case "drainInput": return this.#mcpTerminal.drainInput(event.maxMs, event.idleMs);
    }
  }
  async mcpCommand(args: string, host: McpTerminalHost): Promise<void> {
    if (this.#stopped) throw new Error("Terminal disconnected");
    if (this.#mcpTerminal) throw new Error("An MCP manager is already open");
    host.suspend();
    const terminal = new ProcessTerminal();
    this.#mcpTerminal = terminal;
    const viewport = () => ({ columns: terminal.columns, rows: terminal.rows, kittyProtocolActive: terminal.kittyProtocolActive });
    this.#mcpReady = false;
    const resize = () => { if (this.#mcpReady) void this.#request("session/mcpResize", viewport()).catch(() => this.close()); };
    try {
      terminal.start(data => {
        if (this.#mcpReady) void this.#request("session/mcpInput", { data }).catch(() => this.close());
      }, resize);
      // The first frame means the remote manager has admitted this terminal; negotiation replies before it are local.
      await this.#transport.request("session/mcpCommand", { args, colors: host.colors, keybindings: host.keybindings, ...viewport() });
    } finally {
      this.#mcpReady = false;
      terminal.stop();
      this.#mcpTerminal = undefined;
      if (!this.#stopped) host.resume();
    }
  }
  get failure(): Error | undefined { return this.#failure; }
  current(): TerminalView { return this.#view; }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }
  #emit(): void { for (const listener of this.#listeners) listener(); }
  #apply(envelope: ViewEnvelope): void {
    if (this.#stopped || envelope.revision <= this.#revision) return;
    this.#revision = envelope.revision;
    this.#native = envelope.view;
    this.#resources = envelope.resources;
    this.#sessionName = envelope.sessionName;
    this.#view = presentView(envelope.view, "online", this.#resources, this.#sessionName);
    this.#emit();
  }
  async #request<T = void>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.#stopped) throw new Error("Terminal disconnected. Reconnect to inspect the session. No prompt was replayed.");
    return await this.#transport.request(method, params) as T;
  }
  async submit(content: string, deliverAs: "steer" | "followUp" = "steer"): Promise<void> {
    z.string().trim().min(1).parse(content);
    z.enum(["steer", "followUp"]).parse(deliverAs);
    await this.#request("session/prompt", {
      content, options: { deliverAs, conversationId: String(this.#native.conversation.conversation.id) },
    });
  }
  abort(): Promise<void> {
    return this.#request("session/abort", { conversationId: String(this.#native.conversation.conversation.id) });
  }
  compact(instructions?: string): Promise<void> {
    z.string().optional().parse(instructions);
    return this.#request("session/compact", instructions === undefined ? {} : { instructions });
  }
  setModel(model: { provider: string; modelId: string }): Promise<void> {
    const params = z.object({ provider: z.string().min(1), modelId: z.string().min(1) }).parse(model);
    return this.#request("models/set", {
      ...params, conversationId: String(this.#native.conversation.conversation.id),
    });
  }
  cycleThinking(): Promise<void> { return this.#request("models/cycleThinking"); }
  toggleTasks(): Promise<void> { return this.#request("session/toggleTasks"); }
  switchConversation(id: number): Promise<void> {
    z.number().int().positive().parse(id);
    return this.#request("session/switchConversation", { conversationId: String(id) });
  }
  reload(path?: string): Promise<void> {
    z.string().trim().min(1).optional().parse(path);
    return this.#request("session/reload", path === undefined ? {} : { path });
  }
  async listSessions(): Promise<SessionSummary[]> {
    return z.array(sessionDescriptor.pick({ id: true, name: true, cwd: true })).parse(await this.#request<unknown>("session/list"));
  }
  async renameSession(name: string): Promise<string> {
    return z.string().parse(await this.#request<unknown>("session/rename", { name }));
  }
  async createSession(): Promise<SessionDescriptor> {
    return sessionDescriptor.parse(await this.#request<unknown>("session/create", { requestId: randomUUID() }));
  }
  async describeSession(id: string): Promise<SessionDescriptor> {
    return sessionDescriptor.parse(await this.#request<unknown>("session/describe", { id }));
  }
  close(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#transport.close();
  }
}
