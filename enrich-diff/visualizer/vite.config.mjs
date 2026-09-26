import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultOutputFilePlugin } from "../../common/default-output-file-plugin.mjs";
import { defaultSystemDataflowPlugin } from "../../common/system-dataflow/visualizer/vite-plugin.mjs";

const visualizerDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolkitDirectory = path.resolve(visualizerDirectory, "../..");
const repositoryDirectory = process.cwd();

async function newestDiffIndex(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    } else {
      throw error;
    }
  }

  let newest;
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    let candidate;
    if (entry.isDirectory()) {
      candidate = await newestDiffIndex(entryPath);
    } else if (entry.name.endsWith(".diff-index.json")) {
      candidate = { path: entryPath, modifiedTime: (await stat(entryPath)).mtimeMs };
    }
    if (candidate !== undefined && (newest === undefined || candidate.modifiedTime > newest.modifiedTime)) {
      newest = candidate;
    }
  }
  return newest;
}

async function findDefaultDiffIndex(repository, toolkit) {
  const config = JSON.parse(await readFile(path.join(toolkit, "config.json"), "utf8"));
  return (await newestDiffIndex(path.resolve(repository, config.outputDirectory)))?.path;
}

export default defineConfig({
  plugins: [
    defaultOutputFilePlugin(
      "default-diff-index",
      "/__diff-index/default",
      findDefaultDiffIndex,
      repositoryDirectory,
      toolkitDirectory,
    ),
    defaultSystemDataflowPlugin(repositoryDirectory, toolkitDirectory),
  ],
});
