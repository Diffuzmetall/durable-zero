// packages/extension-pi-resource/src/pi-resource-ext.ts
import { defineExtension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
function createPiResourceExtension(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const settingsManager = options.settingsManager ?? SettingsManager.create(cwd);
  const resourceLoader = options.resourceLoader ?? new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager
  });
  const baseExt = defineExtension({
    name: "pi-resource"
  });
  return Object.assign(baseExt, {
    configProvider: settingsManager,
    resourceLoader
  });
}
export {
  createPiResourceExtension
};
//# sourceMappingURL=index.js.map
