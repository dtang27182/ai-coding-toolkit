import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { defaultSystemDataflowPlugin } from "../../common/sys-dataflow/visualizer/vite-plugin.mjs";
import { watchJourneyDataflows } from "./watch-journey-dataflows.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [
    defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory, "user-journey-dataflow"),
    watchJourneyDataflows(repositoryDirectory, toolkitDirectory),
  ],
});
