// packages/adapter-codemode/src/codemode.ts
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
var CodemodeExtension = class {
  id = "codemode";
  name = "Codemode";
  version = "1.0.0";
  #activeSandbox;
  #sandboxes = /* @__PURE__ */ new Set();
  #contextSandboxes = /* @__PURE__ */ new WeakMap();
  get sandbox() {
    return this.#activeSandbox;
  }
  getSandboxFor(ctx) {
    return this.#contextSandboxes.get(ctx);
  }
  register(ctx) {
    if (!ctx.registry) return;
    const sandbox = new CodemodeSandbox();
    this.#activeSandbox = sandbox;
    this.#sandboxes.add(sandbox);
    this.#contextSandboxes.set(ctx, sandbox);
    const ext = createCodemodeExtension({
      sandbox,
      get namespaces() {
        return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
      }
    });
    ctx.registry.install(ext);
  }
  async teardown() {
    const sandboxes = Array.from(this.#sandboxes);
    this.#sandboxes.clear();
    this.#activeSandbox = void 0;
    for (const sb of sandboxes) {
      const target = sb;
      if (typeof target.close === "function") {
        await target.close();
      } else if (typeof target.dispose === "function") {
        await target.dispose();
      }
    }
  }
};
function createCodemodeBuiltinExtension() {
  return new CodemodeExtension();
}
var codemodeExtension = new CodemodeExtension();
export {
  CodemodeExtension,
  codemodeExtension,
  createCodemodeBuiltinExtension
};
//# sourceMappingURL=index.js.map
