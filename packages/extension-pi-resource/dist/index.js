// packages/extension-pi-resource/src/pi-resource-ext.ts
import { defineExtension } from "@earendil-works/pi-durable";
import { SettingsManager, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
function createPiResourceExtension(options) {
  const settingsManager = options.settingsManager ?? SettingsManager.create(options.cwd);
  const resourceLoader = options.resourceLoader ?? new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
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
