export type DurableErrorCode =
	| "STORAGE_ERROR"
	| "SESSION_NOT_FOUND"
	| "STORAGE_CORRUPTED"
	| "COMMAND_ERROR"
	| "INVALID_COMMAND_PAYLOAD"
	| "PLUGIN_ERROR"
	| "SUBSYSTEM_ERROR"
	| "BUILTIN_EXTENSION_ERROR"
	| "SESSION_ERROR"
	| "INVALID_PROMPT"
	| "SESSION_CLOSED"
	| "SESSION_ABORTED"
	| "SESSION_NOT_STARTED"
	| "CONVERSATION_NOT_FOUND";

export class DurableHarnessError extends Error {
	readonly code: string;

	constructor(message: string, code: string, cause?: unknown) {
		super(message, { cause });
		this.name = new.target.name;
		this.code = code;
	}
}

export class DurableStorageError extends DurableHarnessError {
	constructor(message: string, cause?: unknown, code: string = "STORAGE_ERROR") {
		super(message, code, cause);
	}
}

export class SessionNotFoundError extends DurableStorageError {
	readonly sessionId: string;

	constructor(sessionId: string, message?: string, cause?: unknown) {
		super(message ?? `Session not found: ${sessionId}`, cause, "SESSION_NOT_FOUND");
		this.sessionId = sessionId;
	}
}

export class StorageCorruptionError extends DurableStorageError {
	constructor(message = "Storage corrupted", cause?: unknown) {
		super(message, cause, "STORAGE_CORRUPTED");
	}
}

export class DurableCommandError extends DurableHarnessError {
	constructor(message: string, cause?: unknown, code: string = "COMMAND_ERROR") {
		super(message, code, cause);
	}
}

export class InvalidCommandPayloadError extends DurableCommandError {
	readonly command: string;

	constructor(command: string, message?: string, cause?: unknown) {
		super(message ?? `Invalid payload for command: ${command}`, cause, "INVALID_COMMAND_PAYLOAD");
		this.command = command;
	}
}

export class BuiltinExtensionError extends DurableHarnessError {
	readonly extensionId: string;

	constructor(
		extensionId: string,
		message: string,
		options?: { cause?: unknown },
	) {
		super(`[Built-in Extension ${extensionId}] ${message}`, "BUILTIN_EXTENSION_ERROR", options?.cause);
		this.name = "BuiltinExtensionError";
		this.extensionId = extensionId;
	}
}

export class DurablePluginError extends DurableHarnessError {
	readonly pluginId: string;

	constructor(pluginId: string, message?: string, cause?: unknown) {
		super(message ?? `Plugin failure: ${pluginId}`, "PLUGIN_ERROR", cause);
		this.pluginId = pluginId;
	}
}

export class SessionError extends DurableHarnessError {
	constructor(code: string, message: string, cause?: unknown) {
		super(message, code, cause);
		this.name = "SessionError";
	}
}
