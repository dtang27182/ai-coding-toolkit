import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultSystemDataflowPlugin } from "./vite-plugin.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  plugins: [defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory)],
});
