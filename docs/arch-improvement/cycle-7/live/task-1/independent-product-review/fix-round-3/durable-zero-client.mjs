import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

export const activeClients = new Set();

export async function closeAllActiveClients() {
  const promises = [];
  for (const client of Array.from(activeClients)) {
    promises.push(client.close("SIGTERM", 1500).catch(() => {}));
  }
  await Promise.all(promises);
  activeClients.clear();
}

process.on("exit", () => {
  for (const client of activeClients) {
    if (client.child && !client.isExited) {
      try { client.child.kill("SIGKILL"); } catch (_) {}
    }
  }
});

export function createIsolatedEnv(tempRoot) {
  const tempHome = path.join(tempRoot, "home");
  const tempConfig = path.join(tempRoot, "config");
  const tempXdg = path.join(tempRoot, "xdg");
  const tempCache = path.join(tempRoot, "cache");
  const tempAgent = path.join(tempRoot, "agent");
  const tempCwd = path.join(tempRoot, "work");
  const tempGate = path.join(tempRoot, "gate");

  fs.mkdirSync(tempHome, { recursive: true });
  fs.mkdirSync(tempConfig, { recursive: true });
  fs.mkdirSync(tempXdg, { recursive: true });
  fs.mkdirSync(tempCache, { recursive: true });
  fs.mkdirSync(tempAgent, { recursive: true });
  fs.mkdirSync(tempCwd, { recursive: true });
  fs.mkdirSync(tempGate, { recursive: true });

  const env = {
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin",
    NODE_PATH: process.env.NODE_PATH || "",
    TMPDIR: tempRoot,
    HOME: tempHome,
    XDG_CONFIG_HOME: tempConfig,
    XDG_DATA_HOME: tempXdg,
    XDG_CACHE_HOME: tempCache,
    PI_AGENT_DIR: tempAgent,
    GATE_DIR: tempGate,
  };

  return { tempRoot, tempHome, tempConfig, tempXdg, tempCache, tempAgent, tempCwd, tempGate, env };
}

export class DurableZeroClient {
  constructor(options) {
    this.options = options;
    this.reqId = 0;
    this.pending = new Map();
    this.waiters = new Set();
    this.wireLog = [];
    this.stdoutLines = [];
    this.stderrLines = [];
    this.isExited = false;
    this.exitCode = null;
    this.exitSignal = null;
    this.child = null;
    this.rl = null;
  }

  logWire(direction, message, meta = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      direction,
      message,
      meta,
    };
    this.wireLog.push(entry);
    if (this.options.wireLogStream) {
      this.options.wireLogStream.write(JSON.stringify(entry) + "\n");
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      const args = [
        this.options.cliPath,
        "serve",
        "--no-global-extensions",
        "--provider", "scripted-e2e",
        "--model", "echo",
        "--extension", this.options.fixturePath,
        "--session", this.options.sessionId,
      ];

      this.child = spawn("node", args, {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      activeClients.add(this);

      this.child.on("error", (err) => {
        this.logWire("system", { error: err.message }, { role: "spawn_error" });
        activeClients.delete(this);
        reject(err);
      });

      this.rl = readline.createInterface({ input: this.child.stdout });

      this.rl.on("line", (line) => {
        this.stdoutLines.push(line);
        let parsed = null;
        try {
          parsed = JSON.parse(line);
        } catch (e) {
          this.logWire("recv_raw", { line, parseError: e.message });
          return;
        }

        this.logWire("recv", parsed);

        if (parsed.id !== undefined && parsed.id !== null) {
          const handler = this.pending.get(parsed.id);
          if (handler) {
            this.pending.delete(parsed.id);
            clearTimeout(handler.timer);
            if (parsed.error) {
              handler.reject(new Error(`JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`));
            } else {
              handler.resolve(parsed.result);
            }
          }
        }

        for (const waiter of Array.from(this.waiters)) {
          try {
            if (waiter.predicate(parsed)) {
              this.waiters.delete(waiter);
              clearTimeout(waiter.timer);
              waiter.resolve(parsed);
            }
          } catch (_) {}
        }
      });

      this.child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        this.stderrLines.push(text);
        this.logWire("stderr", { text });
      });

      this.child.on("exit", (code, signal) => {
        this.isExited = true;
        this.exitCode = code;
        this.exitSignal = signal;
        activeClients.delete(this);
        this.logWire("system", { code, signal }, { role: "exit" });

        for (const [id, handler] of this.pending) {
          clearTimeout(handler.timer);
          handler.reject(new Error(`Child exited with code ${code} signal ${signal} while request id=${id} was pending`));
        }
        this.pending.clear();

        for (const waiter of this.waiters) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error(`Child exited with code ${code} signal ${signal} while waiting for event`));
        }
        this.waiters.clear();
      });

      setTimeout(resolve, 50);
    });
  }

  request(method, params = {}, timeoutMs = 15000) {
    if (this.isExited) {
      return Promise.reject(new Error("Cannot send request; child process already exited"));
    }
    this.reqId++;
    const id = this.reqId;
    const payload = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request id=${id} (${method}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.logWire("send", payload);
      this.child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  sendRaw(rawText) {
    this.logWire("send_raw", { text: rawText });
    this.child.stdin.write(rawText + "\n");
  }

  waitForEvent(predicate, timeoutMs = 15000, desc = "event") {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for: ${desc}`));
      }, timeoutMs);

      const waiter = { predicate, resolve, reject, timer, desc };
      this.waiters.add(waiter);
    });
  }

  async close(signal = "SIGTERM", timeoutMs = 2000) {
    activeClients.delete(this);
    if (this.isExited) {
      return { code: this.exitCode, signal: this.exitSignal };
    }
    return new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        if (!this.isExited && this.child) {
          this.logWire("system", {}, { role: "sigkill_fallback" });
          try {
            this.child.kill("SIGKILL");
          } catch (_) {}
        }
      }, timeoutMs);

      this.child.once("exit", (code, sig) => {
        clearTimeout(forceTimer);
        if (this.rl) {
          try { this.rl.close(); } catch (_) {}
        }
        resolve({ code, signal: sig });
      });

      try {
        if (this.child.stdin && !this.child.stdin.destroyed) {
          this.child.stdin.end();
        }
      } catch (_) {}

      try {
        this.child.kill(signal);
      } catch (_) {}
    });
  }
}
