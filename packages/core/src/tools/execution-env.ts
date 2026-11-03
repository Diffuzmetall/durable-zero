export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  sizeBytes: number;
  mtimeMs: number;
}

export interface EnvTarget {
  readonly conversationId?: string | number;
  readonly cwd?: string;
}

export interface IExecutionEnvironment {
  readonly id: string;
  readonly cwd: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exec(argv: string[], options?: ExecOptions): Promise<ExecResult>;
  statFile?(path: string): Promise<FileStat>;
  listFiles?(path: string, options?: { exclude?: string[]; maxEntries?: number }): Promise<string[]>;
  cleanup(context?: unknown): Promise<void>;
}

export type ExecutionEnvFactory = (
  target: EnvTarget,
) => IExecutionEnvironment | Promise<IExecutionEnvironment>;
