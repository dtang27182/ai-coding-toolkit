import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { defaultOutputFilePlugin } from "../../common/default-output-file-plugin.mjs";

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
    } else if (entry.name.endsWith("diff-index.json")) {
      candidate = { path: entryPath, modifiedTime: (await stat(entryPath)).mtimeMs };
    }
    if (candidate !== undefined && (newest === undefined || candidate.modifiedTime > newest.modifiedTime)) {
      newest = candidate;
    }
  }
  return newest;
}

async function findDefaultDiffIndex(repository) {
  return (await newestDiffIndex(path.join(repository, "advanced-diff-viewer")))?.path;
}

export default defineConfig({
  plugins: [defaultOutputFilePlugin(
    "advanced-diff-index",
    "/__diff-index/default",
    findDefaultDiffIndex,
    repositoryDirectory,
    toolkitDirectory,
  )],
});
