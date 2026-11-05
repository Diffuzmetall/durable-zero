import type { Context } from "@earendil-works/chord";
import {
	type BinaryReader,
	type DirReader,
	type ExecutionEnv,
	ExecutionError,
	type FileChange,
	FileError,
	type FileInfo,
	type FileKind,
	type FileListing,
	type FileWatcher,
	type ListFilesOptions,
	type Result,
	type ShellExecOptions,
	type ShellExecResult,
	type TextLineReader,
	type WatchTarget,
	err,
	ok,
} from "@earendil-works/pi-durable/env";
import type { IExecutionEnvironment } from "@durable-zero/core";

/**
 * Maps known structured error codes and names to SDK FileError.
 * Strictly adheres to structured properties without string guessing.
 */
export function toFileError(error: unknown, path?: string): FileError {
	if (error instanceof FileError) return error;
	const msg = error instanceof Error ? error.message : String(error);
	const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
	const name = typeof (error as { name?: unknown })?.name === "string" ? (error as { name: string }).name : undefined;

	if (code === "ENOENT") {
		return new FileError("not_found", msg, path);
	}
	if (code === "EACCES" || code === "EPERM") {
		return new FileError("permission_denied", msg, path);
	}
	if (code === "ENOTDIR") {
		return new FileError("not_directory", msg, path);
	}
	if (code === "EISDIR") {
		return new FileError("is_directory", msg, path);
	}
	if (code === "ABORT_ERR" || name === "AbortError") {
		return new FileError("aborted", msg, path);
	}
	return new FileError("unknown", msg, path);
}

/**
 * Limited Core execution environment adapter conforming to Closing Amendment R8.
 *
 * Forwards only genuinely representable semantics from pure 6-method IExecutionEnvironment:
 * - UTF-8 text read/write
 * - File existence and stat (if statFile capability is implemented with real isFile/isDirectory kinds)
 * - Basic command execution for uncancellable contexts without streaming/windowing options
 *
 * All unsupported operations explicitly return FileError("not_supported") or ExecutionError("shell_unavailable")
 * without touching host filesystem, guessing paths, or faking completeness.
 */
export class CoreExecutionEnvAdapter implements ExecutionEnv {
	readonly id: string;
	cwd: string;
	readonly coreEnv: IExecutionEnvironment;

	constructor(coreEnv: IExecutionEnvironment, cwd: string) {
		this.coreEnv = coreEnv;
		this.cwd = cwd;
		this.id = coreEnv.id;
	}

	async readTextFile(path: string, context: Context): Promise<Result<string, FileError>> {
		if (context.abortSignal?.aborted) {
			return err(new FileError("aborted", "Operation aborted", path));
		}
		try {
			const text = await this.coreEnv.readFile(path);
			return ok(text);
		} catch (e: unknown) {
			return err(toFileError(e, path));
		}
	}

	async writeFile(path: string, content: string | Uint8Array, context: Context): Promise<Result<void, FileError>> {
		if (context.abortSignal?.aborted) {
			return err(new FileError("aborted", "Operation aborted", path));
		}
		if (typeof content !== "string") {
			return err(new FileError("not_supported", "Binary writeFile not supported by pure IExecutionEnvironment", path));
		}
		try {
			await this.coreEnv.writeFile(path, content);
			return ok(undefined);
		} catch (e: unknown) {
			return err(toFileError(e, path));
		}
	}

	async exists(path: string, context: Context): Promise<Result<boolean, FileError>> {
		if (context.abortSignal?.aborted) {
			return err(new FileError("aborted", "Operation aborted", path));
		}
		if (!this.coreEnv.statFile) {
			return err(new FileError("not_supported", "exists without statFile capability is not supported by custom IExecutionEnvironment", path));
		}
		try {
			await this.coreEnv.statFile(path);
			return ok(true);
		} catch (e: unknown) {
			const fileErr = toFileError(e, path);
			if (fileErr.code === "not_found") {
				return ok(false);
			}
			return err(fileErr);
		}
	}

	async fileInfo(path: string, context: Context): Promise<Result<FileInfo, FileError>> {
		if (context.abortSignal?.aborted) {
			return err(new FileError("aborted", "Operation aborted", path));
		}
		if (!this.coreEnv.statFile) {
			return err(new FileError("not_supported", "fileInfo not supported by custom IExecutionEnvironment", path));
		}
		try {
			const stat = await this.coreEnv.statFile(path);
			let kind: FileKind;
			if (stat.isDirectory) {
				kind = "directory";
			} else if (stat.isFile) {
				kind = "file";
			} else {
				return err(new FileError("not_supported", `Unsupported file kind for statFile result at path: ${path}`, path));
			}
			return ok({
				name: path.split("/").pop() ?? path,
				path,
				kind,
				size: stat.sizeBytes,
				mtimeMs: stat.mtimeMs,
			});
		} catch (e: unknown) {
			return err(toFileError(e, path));
		}
	}

	async exec(command: string | readonly string[], options: ShellExecOptions | undefined, context: Context): Promise<Result<ShellExecResult, ExecutionError>> {
		// Pure Core port has no signal/cancel contract. Explicitly refuse cancellable contexts.
		if (context.abortSignal !== undefined) {
			return err(new ExecutionError("shell_unavailable", "Cancellable context execution not supported by pure IExecutionEnvironment (no cancellation signal contract); use NativeExecutionEnvFactory for full shell cancellation"));
		}
		if (typeof command === "string") {
			return err(new ExecutionError("shell_unavailable", "String shell command not supported by pure IExecutionEnvironment; argv array required"));
		}
		if (options?.spill !== undefined || options?.window !== undefined || options?.inheritEnv !== undefined) {
			return err(new ExecutionError("shell_unavailable", "Advanced ShellExecOptions (spill/window/inheritEnv) not supported by pure IExecutionEnvironment"));
		}
		if (options?.onOutput !== undefined) {
			return err(new ExecutionError("shell_unavailable", "Streaming output as it arrives is not supported by pure IExecutionEnvironment"));
		}

		try {
			const res = await this.coreEnv.exec(command as string[], {
				cwd: options?.cwd ?? this.cwd,
				...(options?.env ? { env: options.env } : {}),
				...(options?.timeout !== undefined ? { timeoutMs: options.timeout } : {}),
			});
			return ok({ exitCode: res.exitCode });
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			const code = typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : undefined;
			if (code === "ABORT_ERR" || msg.toLowerCase().includes("aborted")) {
				return err(new ExecutionError("aborted", msg));
			}
			if (code === "ETIMEDOUT" || msg.toLowerCase().includes("timeout")) {
				return err(new ExecutionError("timeout", msg));
			}
			return err(new ExecutionError("spawn_error", msg));
		}
	}

	async cleanup(context: Context): Promise<void> {
		await this.coreEnv.cleanup(context);
	}

	// Unrepresentable operations returning typed FileError("not_supported")
	async flushFile(path: string, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "flushFile not supported by pure IExecutionEnvironment", path));
	}

	async listFiles(path: string, _options: ListFilesOptions | undefined, _context: Context): Promise<Result<FileListing, FileError>> {
		return err(new FileError("not_supported", "listFiles with full FileListing metadata not supported by pure IExecutionEnvironment", path));
	}

	async absolutePath(path: string, _context: Context): Promise<Result<string, FileError>> {
		return err(new FileError("not_supported", "absolutePath not supported by pure IExecutionEnvironment", path));
	}

	async joinPath(_parts: string[], _context: Context): Promise<Result<string, FileError>> {
		return err(new FileError("not_supported", "joinPath not supported by pure IExecutionEnvironment"));
	}

	async openTextLineReader(path: string, _context: Context): Promise<Result<TextLineReader, FileError>> {
		return err(new FileError("not_supported", "openTextLineReader not supported by pure IExecutionEnvironment", path));
	}

	async readTextLines(path: string, _options: { maxLines?: number } | undefined, _context: Context): Promise<Result<string[], FileError>> {
		return err(new FileError("not_supported", "readTextLines not supported by pure IExecutionEnvironment", path));
	}

	async readBinaryFile(path: string, _context: Context): Promise<Result<Uint8Array, FileError>> {
		return err(new FileError("not_supported", "readBinaryFile not supported by pure UTF-8 IExecutionEnvironment", path));
	}

	async openBinaryReader(path: string, _options: { noFollow?: boolean } | undefined, _context: Context): Promise<Result<BinaryReader, FileError>> {
		return err(new FileError("not_supported", "openBinaryReader not supported by pure IExecutionEnvironment", path));
	}

	async appendFile(path: string, _content: string | Uint8Array, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "appendFile not supported by pure IExecutionEnvironment (no atomic append)", path));
	}

	async truncateFile(path: string, _size: number, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "truncateFile not supported by pure IExecutionEnvironment", path));
	}

	async renameFile(sourcePath: string, _destinationPath: string, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "renameFile not supported by pure IExecutionEnvironment", sourcePath));
	}

	async listDir(path: string, _context: Context): Promise<Result<FileInfo[], FileError>> {
		return err(new FileError("not_supported", "listDir not supported by pure IExecutionEnvironment", path));
	}

	async openDirReader(path: string, _context: Context): Promise<Result<DirReader, FileError>> {
		return err(new FileError("not_supported", "openDirReader not supported by pure IExecutionEnvironment", path));
	}

	async watch(_targets: readonly WatchTarget[], _onChange: (change: FileChange) => void, _context: Context): Promise<Result<FileWatcher, FileError>> {
		return err(new FileError("not_supported", "watch not supported by pure IExecutionEnvironment"));
	}

	async canonicalPath(path: string, _context: Context): Promise<Result<string, FileError>> {
		return err(new FileError("not_supported", "canonicalPath not supported by pure IExecutionEnvironment", path));
	}

	async createDir(path: string, _options: { recursive?: boolean } | undefined, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "createDir not supported by pure IExecutionEnvironment", path));
	}

	async remove(path: string, _options: { recursive?: boolean; force?: boolean } | undefined, _context: Context): Promise<Result<void, FileError>> {
		return err(new FileError("not_supported", "remove not supported by pure IExecutionEnvironment", path));
	}

	async createTempDir(_prefix: string | undefined, _context: Context): Promise<Result<string, FileError>> {
		return err(new FileError("not_supported", "createTempDir not supported by pure IExecutionEnvironment"));
	}

	async createTempFile(_options: { prefix?: string; suffix?: string } | undefined, _context: Context): Promise<Result<string, FileError>> {
		return err(new FileError("not_supported", "createTempFile not supported by pure IExecutionEnvironment"));
	}
}
