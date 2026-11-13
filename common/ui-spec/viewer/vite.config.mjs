import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultOutputFilePlugin } from "../../default-output-file-plugin.mjs";
import { findNewestUiDiff } from "./default-ui-diff.mjs";
import { uiDesignManifestPlugin } from "./ui-design-manifest-plugin.mjs";
import { uiDslParserPlugin } from "./ui-dsl-plugin.mjs";

const viewerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(viewerDirectory, "../../..");
const repositoryDirectory = process.cwd();

export default defineConfig({
  base: "./",
  plugins: [...uiDesignManifestPlugin(repositoryDirectory, toolkitDirectory), defaultOutputFilePlugin("default-ui-diff", "/__ui-spec/default", findNewestUiDiff, repositoryDirectory, toolkitDirectory), uiDslParserPlugin()],
});
