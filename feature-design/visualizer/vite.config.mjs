import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { hldManifestPlugin } from "./hld-manifest-plugin.mjs";
import { watchDataflowFiles } from "./watch-dataflow-files.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [
    ...hldManifestPlugin(repositoryDirectory, toolkitDirectory),
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
