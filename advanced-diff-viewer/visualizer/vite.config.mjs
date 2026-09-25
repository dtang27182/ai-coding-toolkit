import { realpathSync } from "node:fs";

import { defineConfig } from "vite";

import { advancedDiffViewerPlugin } from "./vite-plugin.mjs";

const repositoryDirectory = realpathSync(process.cwd());

export default defineConfig({
  plugins: [advancedDiffViewerPlugin(repositoryDirectory)],
  server: { watch: { usePolling: false } },
});
