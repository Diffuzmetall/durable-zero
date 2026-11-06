import type { DurableView } from "@durable-zero/adapter-pi-durable";
import type { AutocompleteProvider, Component, TuiAltScreen, TuiStopOptions } from "@earendil-works/pi-tui";

export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly filePath: string;
  readonly baseDir: string;
}

/** Rendering contract only. The terminal client adds these fields to the native view. */
export type TerminalView = DurableView & {
  session: DurableView["session"] & { name: string };
  connection: "connecting" | "online" | "offline";
  automation: { scheduled: number; failed: number; unavailable: true };
  attention: { requests: readonly never[]; unavailable: true };
  skills: readonly SkillSummary[];
  enableSkillCommands: boolean;
  tasksExpanded?: boolean;
};
export interface TerminalViewSource {
  current(): TerminalView;
  subscribe(listener: () => void): () => void;
}
export interface McpTerminalHost {
  readonly colors: Record<string, string>;
  readonly keybindings: Record<string, string | string[]>;
  suspend(): void;
  resume(): void;
}
export interface TerminalController {
  mcpCommand(args: string, host: McpTerminalHost): Promise<void>;
  submit(content: string, deliverAs: "steer" | "followUp"): Promise<void>;
  compact(instructions?: string): Promise<void>;
  abort(): Promise<void>;
  cycleThinking(): Promise<void>;
  setModel(model: { provider: string; modelId: string }): Promise<void>;
  toggleTasks(): Promise<void>;
  switchConversation(id: number): Promise<void>;
  reload(path?: string): Promise<void>;
  listSessions(): Promise<readonly { id: string; name: string; cwd: string }[]>;
  renameSession(name: string): Promise<string>;
}
export interface TerminalSettings {
  getTerminalCapabilityOverrides(): Record<string, boolean>;
  getEnableSkillCommands(): boolean;
  getAutocompleteMaxVisible(): number;
  getThemeSetting(): string | undefined;
}
export function runDurableTui(source: TerminalViewSource, controller: TerminalController, settings: TerminalSettings,
  startupWarning?: string, options?: { signal?: AbortSignal }): Promise<string | null | undefined>;
export class DurableTui {
  constructor(cwd: string, sessionDirectory: string, handlers: {
    submit(text: string): void;
    followUp(text: string): void;
    abort(): void;
    openAgent(id: number): void;
    selectModel(): void;
    cycleThinking(): void;
    selectSkill?(query: string): void;
    extensionShortcut?(data: string): boolean;
  });
  readonly ui: TuiAltScreen;
  start(): void;
  stop(options?: TuiStopOptions): void;
  apply(view: TerminalView): void;
  setSessionTitle(title: string): void;
  showInputError(text: string, error: unknown): void;
  mount(component: Component, question?: string): void;
  restoreEditor(): void;
  insertSkill(name: string): void;
  setAutocomplete(provider: AutocompleteProvider, maxVisible: number): void;
}
export function createDurableAutocomplete(cwd: string, skills: readonly SkillSummary[], enableSkills?: boolean): AutocompleteProvider;
export { CustomEditor } from "../vendor/modes/interactive/components/custom-editor.js";
export { AssistantMessageComponent } from "../vendor/modes/interactive/components/assistant-message.js";
export { UserMessageComponent } from "../vendor/modes/interactive/components/user-message.js";
export { ToolExecutionComponent } from "../vendor/modes/interactive/components/tool-execution.js";
export { toolCardRenderer, resetToolCards } from "../vendor/extensions/tool-cards/renderers.mjs";
export { initTheme, theme, getResolvedThemeColors } from "../vendor/modes/interactive/theme/theme.js";
export { ProcessTerminal } from "@earendil-works/pi-tui";
