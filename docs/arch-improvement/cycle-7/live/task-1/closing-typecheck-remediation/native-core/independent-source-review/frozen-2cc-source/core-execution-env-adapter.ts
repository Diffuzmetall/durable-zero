import type { Context } from "@earendil-works/chord";
import {
	type BinaryReader,
	type DirReader,
	type ExecutionEnv,
	ExecutionError,
	type FileChange,
	FileError,
	type FileInfo,
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
 * Limited Core execution environment adapter conforming to Closing Amendment R8.
 *
 * Forwards only genuinely representable semantics from pure 6-method IExecutionEnvironment:
 * - UTF-8 text read/write
 * - Command execution with preserved Result semantics (non-zero exit is not a spawn error)
 * - File stat and listing if supported by the underlying implementation
 *
 * All unsupported operations explicitly return FileError("not_supported") or ExecutionError("shell_unavailable")
 * without touching host filesystem or guessing paths.
 */
export class CoreExecutionEnvAdapter implements ExecutionEnv {
	readonly id: string;
	cwd: string;
	readonly #coreEnv: IExecutionEnvironment;

	constructor(coreEnv: IExecutionEnvironment, cwd: string, id = `core-env-${Math.random().toString(36).slice(2, 8)}`) {
		this.#coreEnv = coreEnv;
		this.cwd = cwd;
		this.id = id;
	}

	async readTextFile(path: string, _context: Context): Promise<Result<string, FileError>> {
		try {
			const text = await this.#coreEnv.readFile(path);
			return ok(text);
		} catch (e: unknown) {
			return err(new FileError("not_found", e instanceof Error ? e.message : String(e), path));
		}
	}

	async writeFile(path: string, content: string | Uint8Array, _context: Context): Promise<Result<void, FileError>> {
		if (typeof content !== "string") {
			return err(new FileError("not_supported", "Binary writeFile not supported by pure IExecutionEnvironment", path));
		}
		try {
			await this.#coreEnv.writeFile(path, content);
			return ok(undefined);
		} catch (e: unknown) {
			return err(new FileError("unknown", e instanceof Error ? e.message : String(e), path));
		}
	}

	async exists(path: string, _context: Context): Promise<Result<boolean, FileError>> {
		try {
			if (this.#coreEnv.statFile) {
				await this.#coreEnv.statFile(path);
				return ok(true);
			}
			await this.#coreEnv.readFile(path);
			return ok(true);
		} catch {
			return ok(false);
		}
	}

	async fileInfo(path: string, _context: Context): Promise<Result<FileInfo, FileError>> {
		if (this.#coreEnv.statFile) {
			try {
				const stat = await this.#coreEnv.statFile(path);
				return ok({
					name: path.split("/").pop() ?? path,
					path,
					kind: stat.isDirectory ? "directory" : "file",
					size: stat.sizeBytes,
					mtimeMs: stat.mtimeMs,
				});
			} catch (e: unknown) {
				return err(new FileError("not_found", e instanceof Error ? e.message : String(e), path));
			}
		}
		return err(new FileError("not_supported", "fileInfo not supported by custom IExecutionEnvironment", path));
	}

	async listFiles(path: string, options: ListFilesOptions | undefined, _context: Context): Promise<Result<FileListing, FileError>> {
		if (this.#coreEnv.listFiles) {
			try {
				const files = await this.#coreEnv.listFiles(path, {
					...(options?.exclude ? { exclude: [...options.exclude] } : {}),
					...(options?.maxEntries !== undefined ? { maxEntries: options.maxEntries } : {}),
				});
				return ok({
					entries: files.map((f) => ({ path: f, kind: "file" })),
					truncated: false,
				});
			} catch (e: unknown) {
				return err(new FileError("unknown", e instanceof Error ? e.message : String(e), path));
			}
		}
		return err(new FileError("not_supported", "listFiles not supported by custom IExecutionEnvironment", path));
	}

	async flushFile(_path: string, _context: Context): Promise<Result<void, FileError>> {
		return ok(undefined);
	}

	async exec(command: string | readonly string[], options: ShellExecOptions | undefined, context: Context): Promise<Result<ShellExecResult, ExecutionError>> {
		if (typeof command === "string") {
			return err(new ExecutionError("shell_unavailable", "String shell command not supported by pure IExecutionEnvironment; argv array required"));
		}
		try {
			const res = await this.#coreEnv.exec(command as string[], {
				cwd: options?.cwd ?? this.cwd,
				...(options?.env ? { env: options.env } : {}),
				...(options?.timeout !== undefined ? { timeoutMs: options.timeout } : {}),
			});
			if (options?.onOutput && res.stdout) {
				options.onOutput(res.stdout, context, { stream: "stdout" });
			}
			if (options?.onOutput && res.stderr) {
				options.onOutput(res.stderr, context, { stream: "stderr" });
			}
			return ok({ exitCode: res.exitCode });
		} catch (e: unknown) {
			return err(new ExecutionError("spawn_error", e instanceof Error ? e.message : String(e)));
		}
	}

	async cleanup(context: Context): Promise<void> {
		await this.#coreEnv.cleanup(context);
	}

	// Strictly unsupported operations under Closing Amendment R8
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
