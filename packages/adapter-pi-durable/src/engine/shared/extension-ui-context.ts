import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { requestHostInteraction, type ExtensionUIDialogRequester } from "../host-rpc.ts";

export function createExtensionUIContext(
	onNotice?: (type: "info" | "warning" | "error", message: string) => void,
	requestInteraction: ExtensionUIDialogRequester = requestHostInteraction,
): ExtensionUIContext {
	return {
		select: async (title, options) => {
			const res = await requestInteraction("select", { title, data: { options } });
			return typeof res === "string" ? res : undefined;
		},
		confirm: async (title, message) => {
			const res = await requestInteraction("confirm", { title, message });
			return Boolean(res);
		},
		input: async (title, placeholder) => {
			const res = await requestInteraction("input", {
				title,
				...(placeholder !== undefined ? { message: placeholder } : {}),
			});
			return typeof res === "string" ? res : undefined;
		},
		notify: (message: string, type: "info" | "warning" | "error" = "info") => {
			onNotice?.(type, message);
		},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async () => undefined as any,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		theme: {} as any,
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: true }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}
