// packages/sdk/src/errors.ts
var DurablePluginError = class extends Error {
  pluginId;
  code = "PLUGIN_ERROR";
  constructor(pluginId, message, cause) {
    super(message ?? `Plugin failure: ${pluginId}`, { cause });
    this.name = "DurablePluginError";
    this.pluginId = pluginId;
  }
};

// packages/sdk/src/registry.ts
var DurablePluginRegistry = class {
  #plugins = /* @__PURE__ */ new Map();
  register(plugin) {
    if (this.#plugins.has(plugin.id)) {
      throw new DurablePluginError(
        plugin.id,
        `Plugin with id '${plugin.id}' is already registered`
      );
    }
    this.#plugins.set(plugin.id, plugin);
  }
  get(id) {
    return this.#plugins.get(id);
  }
  list(category) {
    const all = Array.from(this.#plugins.values());
    if (!category) return all;
    return all.filter((p) => p.category === category);
  }
  async initAll(ctx) {
    for (const plugin of this.#plugins.values()) {
      try {
        await plugin.register(ctx);
      } catch (err) {
        if (err instanceof DurablePluginError) {
          throw err;
        }
        throw new DurablePluginError(
          plugin.id,
          `Failed to initialize plugin '${plugin.id}': ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }
    }
  }
  async teardownAll() {
    const plugins = Array.from(this.#plugins.values()).reverse();
    for (const plugin of plugins) {
      if (typeof plugin.teardown === "function") {
        try {
          await plugin.teardown();
        } catch {
        }
      }
    }
  }
};
export {
  DurablePluginRegistry
};
//# sourceMappingURL=index.js.map
