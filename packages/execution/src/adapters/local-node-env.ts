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

      let child: import("node:child_process").ChildProcess;

      if (typeof argvOrCommand === "string") {
        if (!argvOrCommand.trim()) {
          resolve({
            ok: false,
            value: { exitCode: 1 },
            stdout: "",
            stderr: "Cannot execute empty command string",
            exitCode: 1,
          });
          return;
        }
      } else {
        const [binary] = argvOrCommand;
        if (!binary) {
          resolve({
            ok: false,
            value: { exitCode: 1 },
            stdout: "",
            stderr: "Cannot execute empty command argv",
            exitCode: 1,
          });
          return;
        }
      }

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

      if (typeof argvOrCommand === "string") {
        child = exec(argvOrCommand, { cwd: execCwd, env: execEnv, timeout, signal: options?.signal });
      } else {
        const [binary, ...args] = argvOrCommand;
        child = execFile(binary!, args, {
          cwd: execCwd,
          env: execEnv,
          timeout,
          signal: options?.signal,
        });
      }

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

  async cleanup(_context?: unknown): Promise<void> {
    // Local node environment requires no teardown
  }
}
