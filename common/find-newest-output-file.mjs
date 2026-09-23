import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

async function matchingFiles(directory, suffixes) {
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
      files.push(...await matchingFiles(entryPath, suffixes));
    } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function findNewestOutputFile(repositoryDirectory, toolkitDirectory, suffixes) {
  const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
  const files = await matchingFiles(path.resolve(repositoryDirectory, config.outputDirectory), suffixes);
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
