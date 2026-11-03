// packages/execution/src/adapters/local-node-env.ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { exec, execFile } from "node:child_process";
var LocalNodeExecutionEnv = class {
  id;
  cwd;
  constructor(options) {
    this.id = options?.id ?? "local-node";
    this.cwd = options?.cwd ?? process.cwd();
  }
  resolvePath(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath);
  }
  async readFile(filePath) {
    return await fs.readFile(this.resolvePath(filePath), "utf8");
  }
  async writeFile(filePath, content) {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }
  async exec(argvOrCommand, options, context) {
    return new Promise((resolve2) => {
      const execCwd = options?.cwd ?? this.cwd;
      const execEnv = { ...process.env, ...options?.env };
      const timeout = options?.timeoutMs ?? 3e4;
      let stdout = "";
      let stderr = "";
      const handleOutput = (chunk, isErr = false) => {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        if (isErr) stderr += text;
        else stdout += text;
        if (options?.onOutput) {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          options.onOutput(buf, context, { skipped: false });
        }
      };
      const child = typeof argvOrCommand === "string" ? exec(argvOrCommand, { cwd: execCwd, env: execEnv, timeout, signal: options?.signal }) : execFile(argvOrCommand[0], argvOrCommand.slice(1), {
        cwd: execCwd,
        env: execEnv,
        timeout,
        signal: options?.signal
      });
      child.stdout?.on("data", (chunk) => handleOutput(chunk, false));
      child.stderr?.on("data", (chunk) => handleOutput(chunk, true));
      child.on("error", (err) => {
        resolve2({
          ok: false,
          value: { exitCode: 1 },
          stdout,
          stderr: stderr || err.message,
          exitCode: 1
        });
      });
      child.on("close", (code) => {
        const exitCode = code ?? 0;
        resolve2({
          ok: exitCode === 0,
          value: { exitCode },
          stdout,
          stderr,
          exitCode
        });
      });
    });
  }
  async statFile(filePath) {
    const stat = await fs.stat(this.resolvePath(filePath));
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs
    };
  }
  async listFiles(dirPath) {
    return await fs.readdir(this.resolvePath(dirPath));
  }
  async cleanup(_context) {
  }
};

// packages/execution/src/adapters/mock-env.ts
var MockExecutionEnv = class {
  id;
  cwd;
  files = /* @__PURE__ */ new Map();
  constructor(options) {
    this.id = options?.id ?? "mock-env";
    this.cwd = options?.cwd ?? "/mock";
  }
  async readFile(filePath) {
    const content = this.files.get(filePath);
    if (content === void 0) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return content;
  }
  async writeFile(filePath, content) {
    this.files.set(filePath, content);
  }
  async exec(argv, _options) {
    if (argv[0] === "echo") {
      return {
        stdout: argv.slice(1).join(" ") + "\n",
        stderr: "",
        exitCode: 0
      };
    }
    return {
      stdout: "ok",
      stderr: "",
      exitCode: 0
    };
  }
  async statFile(filePath) {
    const content = this.files.get(filePath);
    if (content === void 0) {
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }
    return {
      isFile: true,
      isDirectory: false,
      sizeBytes: Buffer.byteLength(content, "utf8"),
      mtimeMs: Date.now()
    };
  }
  async listFiles(_dirPath) {
    return Array.from(this.files.keys());
  }
  async cleanup(_context) {
    this.files.clear();
  }
};
export {
  LocalNodeExecutionEnv,
  MockExecutionEnv
};
//# sourceMappingURL=index.js.map
