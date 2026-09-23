import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultDiffIndexPlugin } from "../../common/diff-viewer/viewer/vite-plugin.mjs";
import { defaultSystemDataflowPlugin } from "../../common/system-dataflow/visualizer/vite-plugin.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  plugins: [
    defaultDiffIndexPlugin(repositoryDirectory, toolkitDirectory),
    defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory),
  ],
});
