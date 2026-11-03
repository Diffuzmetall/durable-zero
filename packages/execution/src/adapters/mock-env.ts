import type {
  IExecutionEnvironment,
  ExecOptions,
  ExecResult,
  FileStat,
} from "@durable-zero/core";

export class MockExecutionEnv implements IExecutionEnvironment {
  readonly id: string;
  readonly cwd: string;
  private files = new Map<string, string>();

  constructor(options?: { id?: string; cwd?: string }) {
    this.id = options?.id ?? "mock-env";
    this.cwd = options?.cwd ?? "/mock";
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return content;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
  }

  async exec(argv: string[], _options?: ExecOptions): Promise<ExecResult> {
    if (argv[0] === "echo") {
      return {
        stdout: argv.slice(1).join(" ") + "\n",
        stderr: "",
        exitCode: 0,
      };
    }
    return {
      stdout: "ok",
      stderr: "",
      exitCode: 0,
    };
  }

  async statFile(filePath: string): Promise<FileStat> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }
    return {
      isFile: true,
      isDirectory: false,
      sizeBytes: Buffer.byteLength(content, "utf8"),
      mtimeMs: Date.now(),
    };
  }

  async listFiles(_dirPath: string): Promise<string[]> {
    return Array.from(this.files.keys());
  }

  async cleanup(_context?: unknown): Promise<void> {
    this.files.clear();
  }
}
