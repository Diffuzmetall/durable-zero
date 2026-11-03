import { promises as fs } from "node:fs";
import * as path from "node:path";
import { exec, execFile } from "node:child_process";
import type {
  IExecutionEnvironment,
  ExecOptions,
  ExecResult,
  FileStat,
} from "@durable-zero/core";

export interface NodeExecExtendedOptions extends ExecOptions {
  onOutput?: (chunk: Buffer | string, context?: unknown, info?: { skipped: boolean }) => void;
  signal?: AbortSignal;
}

export class LocalNodeExecutionEnv implements IExecutionEnvironment {
  readonly id: string;
  readonly cwd: string;

  constructor(options?: { id?: string; cwd?: string }) {
    this.id = options?.id ?? "local-node";
    this.cwd = options?.cwd ?? process.cwd();
  }

  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(this.resolvePath(filePath), "utf8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }

  async exec(
    argvOrCommand: string[] | string,
    options?: NodeExecExtendedOptions,
    context?: unknown,
  ): Promise<ExecResult & { ok?: boolean; value?: { exitCode: number } }> {
    return new Promise((resolve) => {
      const execCwd = options?.cwd ?? this.cwd;
      const execEnv = { ...process.env, ...options?.env };
      const timeout = options?.timeoutMs ?? 30_000;

      let stdout = "";
      let stderr = "";

      const handleOutput = (chunk: Buffer | string, isErr = false) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (isErr) stderr += text;
        else stdout += text;
        if (options?.onOutput) {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          options.onOutput(buf, context, { skipped: false });
        }
      };

      const child =
        typeof argvOrCommand === "string"
          ? exec(argvOrCommand, { cwd: execCwd, env: execEnv, timeout, signal: options?.signal })
          : execFile(argvOrCommand[0], argvOrCommand.slice(1), {
              cwd: execCwd,
              env: execEnv,
              timeout,
              signal: options?.signal,
            });

      child.stdout?.on("data", (chunk) => handleOutput(chunk, false));
      child.stderr?.on("data", (chunk) => handleOutput(chunk, true));

      child.on("error", (err) => {
        resolve({
          ok: false,
          value: { exitCode: 1 },
          stdout,
          stderr: stderr || err.message,
          exitCode: 1,
        });
      });

      child.on("close", (code) => {
        const exitCode = code ?? 0;
        resolve({
          ok: exitCode === 0,
          value: { exitCode },
          stdout,
          stderr,
          exitCode,
        });
      });
    });
  }

  async statFile(filePath: string): Promise<FileStat> {
    const stat = await fs.stat(this.resolvePath(filePath));
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  }

  async listFiles(dirPath: string): Promise<string[]> {
    return await fs.readdir(this.resolvePath(dirPath));
  }

  absolutePath(filePath: string): { ok: boolean; value: string } {
    return { ok: true, value: this.resolvePath(filePath) };
  }

  joinPath(...segments: string[]): { ok: boolean; value: string } {
    return { ok: true, value: path.join(...segments) };
  }

  async readTextFile(filePath: string): Promise<{ ok: boolean; value: string }> {
    const content = await this.readFile(filePath);
    return { ok: true, value: content };
  }

  async readBinaryFile(filePath: string): Promise<{ ok: boolean; value: Buffer }> {
    const content = await fs.readFile(this.resolvePath(filePath));
    return { ok: true, value: content };
  }

  async fileInfo(filePath: string): Promise<{ ok: boolean; value: FileStat }> {
    const info = await this.statFile(filePath);
    return { ok: true, value: info };
  }

  async exists(filePath: string): Promise<{ ok: boolean; value: boolean }> {
    try {
      await fs.access(this.resolvePath(filePath));
      return { ok: true, value: true };
    } catch {
      return { ok: true, value: false };
    }
  }

  async cleanup(_context?: unknown): Promise<void> {
    // Local node environment requires no teardown
  }
}
