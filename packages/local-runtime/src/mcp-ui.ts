import { TuiMainScreen, KeybindingsManager, TUI_KEYBINDINGS, getKeybindings, setKeybindings, type TUI, type Component, type Terminal } from "@earendil-works/pi-tui";
import { Theme, initTheme, ExtensionInputComponent, ExtensionSelectorComponent, type ExtensionUIContext, type KeybindingsManager as PiKeybindingsManager } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import type { McpTerminalOperation } from "./client.ts";

export const mcpViewport = z.object({
  columns: z.number().int().min(1).max(10000), rows: z.number().int().min(1).max(10000),
  kittyProtocolActive: z.boolean(),
});
export const mcpCommandRequest = mcpViewport.extend({
  args: z.string(), keybindings: z.record(z.string(), z.union([z.string(), z.array(z.string())])), colors: z.record(z.string(), z.string().regex(/^(?:#[0-9a-f]{6}|)$/i)),
}).strict();

/** An output device for Pi's real TUI. Rendering and input dispatch remain native Pi code. */
class RemoteTerminal implements Terminal {
  #input: ((data: string) => void) | undefined;
  #resize: (() => void) | undefined;
  #cancelled = false;
  #cancelQueued = false;
  constructor(public viewport: z.infer<typeof mcpViewport>,
    private send: (operation: McpTerminalOperation) => void,
    private request: (operation: McpTerminalOperation) => Promise<unknown>) {}
  get columns() { return this.viewport.columns; }
  get rows() { return this.viewport.rows; }
  get kittyProtocolActive() { return this.viewport.kittyProtocolActive; }
  start(input: (data: string) => void, resize: () => void) {
    this.#input = input; this.#resize = resize;
    if (this.#cancelled) this.#cancel();
  }
  stop() { this.#input = undefined; this.#resize = undefined; }
  input(data: string) { if (!this.#cancelled) this.#input?.(data); }
  resize(viewport: z.infer<typeof mcpViewport>) { this.viewport = viewport; this.#resize?.(); }
  disconnect() { this.#cancelled = true; this.#cancel(); }
  #cancel() {
    if (this.#cancelQueued || !this.#input) return;
    this.#cancelQueued = true;
    setImmediate(() => { this.#cancelQueued = false; this.#input?.("\x1b"); });
  }
  write(data: string) {
    if (this.#cancelled) {
      // Cancel each newly rendered nested menu, until the native manager exits itself.
      this.#cancel();
    } else this.send({ op: "write", data });
  }
  async drainInput(maxMs?: number, idleMs?: number) {
    if (!this.#cancelled) await this.request({ op: "drainInput", maxMs, idleMs });
  }
  moveBy(lines: number) { if (lines) this.write(`\x1b[${Math.abs(lines)}${lines > 0 ? "B" : "A"}`); }
  hideCursor() { this.write("\x1b[?25l"); }
  showCursor() { this.write("\x1b[?25h"); }
  clearLine() { this.write("\x1b[2K\r"); }
  clearFromCursor() { this.write("\x1b[J"); }
  clearScreen() { this.write("\x1b[2J\x1b[H"); }
  setTitle(title: string) { if (!this.#cancelled) this.send({ op: "setTitle", title }); }
  setProgress(active: boolean) { if (!this.#cancelled) this.send({ op: "setProgress", active }); }
  setProgramStatus(status: Parameters<Terminal["setProgramStatus"]>[0]) {
    if (!this.#cancelled) this.send({ op: "setProgramStatus", status });
  }
}

/** One command's UI, not a Harness, MCP client, or replacement manager. */
export function createMcpCommandUI(options: z.infer<typeof mcpCommandRequest>,
  send: (operation: McpTerminalOperation) => void,
  request: (operation: McpTerminalOperation) => Promise<unknown>,
  notice: (message: string, level: "info" | "warning" | "error") => void) {
  initTheme();
  const theme = new Theme(options.colors as ConstructorParameters<typeof Theme>[0],
    options.colors as ConstructorParameters<typeof Theme>[1], "truecolor");
  const definitions = { ...TUI_KEYBINDINGS, ...Object.fromEntries(Object.keys(options.keybindings).map(key => [key, { defaultKeys: [] }])) };
  // MCP uses the public TUI keybinding methods. Pi's additional file-loader class is not a runtime SDK export.
  const keybindings = new KeybindingsManager(definitions, options.keybindings as ConstructorParameters<typeof KeybindingsManager>[1]) as PiKeybindingsManager;
  const terminal = new RemoteTerminal(options, send, request);
  async function custom<T>(
    factory: (tui: TUI, theme: Theme, keys: PiKeybindingsManager, done: (value: T) => void) => ReturnType<Parameters<ExtensionUIContext["custom"]>[0]>,
    customOptions?: Parameters<ExtensionUIContext["custom"]>[1],
  ): Promise<T> {
    if (customOptions?.overlay) throw new Error("MCP command UI does not support overlay components");
    const previousKeys = getKeybindings();
    setKeybindings(keybindings);
    const tui = new TuiMainScreen(terminal);
    let done!: (value: T) => void;
    const result = new Promise<T>(resolve => { done = resolve; });
    let component: (Component & { dispose?(): void }) | undefined;
    try {
      component = await factory(tui, theme, keybindings, done);
      tui.addChild(component);
      tui.setFocus(component);
      tui.start();
      return await result;
    } finally {
      tui.stop();
      component?.dispose?.();
      setKeybindings(previousKeys);
    }
  }
  const ui: Pick<ExtensionUIContext, "custom" | "select" | "input" | "notify" | "theme"> = {
    theme, custom, notify: (message, level = "info") => notice(message, level),
    select: (title, choices, options) => custom((tui, _theme, _keys, done) =>
      new ExtensionSelectorComponent(title, choices, done, () => done(undefined), { tui, ...options })),
    input: (title, placeholder, options) => custom((tui, _theme, _keys, done) =>
      new ExtensionInputComponent(title, placeholder, done, () => done(undefined), { tui, ...options })),
  };
  return { ui, input: (data: string) => terminal.input(data),
    resize: (viewport: z.infer<typeof mcpViewport>) => terminal.resize(viewport),
    disconnect: () => {
      // The terminal is gone: restore a known cancel key on this command-owned manager only.
      // Native menus must unwind themselves, including their subscriptions and sign-in cancellation.
      keybindings.setUserBindings({ "tui.select.cancel": "escape" });
      terminal.disconnect();
    } };
}
