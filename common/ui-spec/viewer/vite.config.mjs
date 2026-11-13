import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultOutputFilePlugin } from "../../default-output-file-plugin.mjs";
import { findNewestUiDiff } from "./default-ui-diff.mjs";
import { uiDslParserPlugin } from "./ui-dsl-plugin.mjs";

const viewerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(viewerDirectory, "../../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [defaultOutputFilePlugin("default-ui-diff", "/__ui-spec/default", findNewestUiDiff, repositoryDirectory, toolkitDirectory), uiDslParserPlugin()],
});
