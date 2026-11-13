import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

async function uiDiffFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    } else {
      throw error;
    }
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await uiDiffFiles(entryPath));
    } else if (entry.name.endsWith(".ui.diff.json") || entry.name.endsWith(".diff.ui.json")) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function findNewestUiDiff(repositoryDirectory, toolkitDirectory) {
  const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
  const files = await uiDiffFiles(path.resolve(repositoryDirectory, config.outputDirectory));
  let newestFile;
  let newestModifiedTime = -Infinity;
  for (const file of files) {
    const { mtimeMs } = await stat(file);
    if (mtimeMs > newestModifiedTime) {
      newestFile = file;
      newestModifiedTime = mtimeMs;
    }
  }
  return newestFile;
}
