// packages/plugins/src/coding-tools.ts
import { createCodingTools, CodingTools } from "@earendil-works/pi-durable/tools";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
var codingToolsPlugin = {
  id: "coding-tools",
  name: "Coding Tools",
  category: "built-in",
  version: "1.0.0",
  async register(ctx) {
    if (!ctx.registry) return;
    let tools = CodingTools;
    try {
      const images = await createNodePhotonImages();
      tools = createCodingTools({ images });
    } catch {
    }
    ctx.registry.install(tools);
  }
};

// packages/plugins/src/codemode.ts
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
var activeSandbox;
var codemodePlugin = {
  id: "codemode",
  name: "Codemode",
  category: "built-in",
  version: "1.0.0",
  register(ctx) {
    if (!ctx.registry) return;
    activeSandbox = new CodemodeSandbox();
    const ext = createCodemodeExtension({
      sandbox: activeSandbox,
      get namespaces() {
        return ctx.dynamicNamespaces?.getNamespaces?.() ?? [];
      }
    });
    ctx.registry.install(ext);
  },
  async teardown() {
    if (activeSandbox) {
      const sb = activeSandbox;
      if (typeof sb.close === "function") {
        await sb.close();
      } else if (typeof sb.dispose === "function") {
        await sb.dispose();
      }
      activeSandbox = void 0;
    }
  }
};

// packages/plugins/src/subagents.ts
import { createSubagentExtension } from "@durable-zero/core";
import { Anchor, DefaultCourier, DefaultReporter } from "@durable-zero/core";
var subagentsPlugin = {
  id: "subagents",
  name: "Subagents",
  category: "built-in",
  version: "1.0.0",
  register(ctx) {
    if (!ctx.registry) return;
    if (typeof ctx.getSubagentPolicy === "function") {
      ctx.registry.install(createSubagentExtension(ctx.getSubagentPolicy));
    }
    ctx.registry.install(Anchor);
    ctx.registry.install(DefaultCourier);
    ctx.registry.install(DefaultReporter);
  },
  teardown() {
  }
};
export {
  codemodePlugin,
  codingToolsPlugin,
  subagentsPlugin
};
//# sourceMappingURL=index.js.map
