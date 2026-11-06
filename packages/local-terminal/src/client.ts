import type { DurableView as NativeDurableView } from "@durable-zero/adapter-pi-durable";
import { connectRuntime } from "@local-durable/runtime/client";
import type { TerminalController, TerminalView, TerminalViewSource } from "@local-durable/terminal-ui";
import { z } from "zod";

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
}), resources: z.object({
  skills: z.array(z.object({ name: z.string().min(1), description: z.string(), filePath: z.string(), baseDir: z.string() })),
  enableSkillCommands: z.boolean(),
}).optional() });

export interface ViewEnvelope {
  readonly revision: number;
  readonly view: NativeDurableView;
  readonly resources?: { readonly skills: TerminalView["skills"]; readonly enableSkillCommands: boolean };
}

export function parseViewEnvelope(value: unknown): ViewEnvelope {
  envelopeSchema.parse(value);
  // Keep the native view, including fields outside the renderer's minimum boundary schema.
  return value as ViewEnvelope;
}

export function presentView(view: NativeDurableView, connection: TerminalView["connection"], resources?: ViewEnvelope["resources"]): TerminalView {
  return {
    ...view,
    session: { ...view.session, name: view.session.id },
    // Summaries contain identity, not activity. Enrich only the selected row with native documents.
    conversations: view.conversations.map(row => row.id === view.conversation.conversation.id ? {
      ...row,
      ...(view.conversation.docs["pi.live"] === undefined ? {} : { live: view.conversation.docs["pi.live"] }),
      ...(view.conversation.docs["pi.inbox"] === undefined ? {} : { inbox: view.conversation.docs["pi.inbox"] }),
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
  #view: TerminalView;
  #listeners = new Set<() => void>();
  #stopped = false;
  #failure: Error | undefined;
  readonly closed: Promise<void>;

  private constructor(transport: RuntimeConnection, initial: ViewEnvelope) {
    this.#transport = transport;
    this.#native = initial.view;
    this.#revision = initial.revision;
    this.#resources = initial.resources;
    this.#view = presentView(initial.view, "online", this.#resources);
    this.closed = transport.closed.then(() => {
      this.#stopped = true;
      this.#view = presentView(this.#native, "offline", this.#resources);
      this.#emit();
    });
  }

  static async open(sessionDir: string, connect: RuntimeConnector = connectRuntime): Promise<ZeroTerminalClient> {
    let client: ZeroTerminalClient | undefined;
    let pending: ViewEnvelope | undefined;
    let failure: Error | undefined;
    let transport: RuntimeConnection | undefined;
    transport = await connect(sessionDir, (method, params) => {
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
    this.#view = presentView(envelope.view, "online", this.#resources);
    this.#emit();
  }
  async #request(method: string, params: Record<string, unknown> = {}): Promise<void> {
    if (this.#stopped) throw new Error("Terminal disconnected. Reconnect to inspect the session. No prompt was replayed.");
    await this.#transport.request(method, params);
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
  async listSessions(): Promise<never> { throw new Error("Unsupported capability: session list"); }
  async renameSession(_name: string): Promise<never> { throw new Error("Unsupported capability: session rename"); }
  close(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#transport.close();
  }
}
