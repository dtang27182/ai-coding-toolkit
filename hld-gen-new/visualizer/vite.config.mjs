import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import implementationConfig from "../../common/impl-dataflow/visualizer/vite.config.mjs";
import { defaultSystemDataflowPlugin } from "../../common/system-dataflow/visualizer/vite-plugin.mjs";
import { watchDataflowFiles } from "./watch-dataflow-files.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [
    ...implementationConfig.plugins,
    defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory),
    watchDataflowFiles(repositoryDirectory, toolkitDirectory),
  ],
  build: {
    rollupOptions: {
      input: {
        index: path.join(visualizerDirectory, "index.html"),
        system: path.join(visualizerDirectory, "system.html"),
        implementation: path.join(visualizerDirectory, "implementation.html"),
      },
    },
  },
});
