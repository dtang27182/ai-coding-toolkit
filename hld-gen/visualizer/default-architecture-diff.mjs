import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

async function architectureDiffFiles(directory) {
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
      files.push(...await architectureDiffFiles(entryPath));
    } else if (/architecture-diff.*\.json$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function findFirstArchitectureDiff(repositoryDirectory, toolkitDirectory) {
  const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
  const files = await architectureDiffFiles(path.resolve(repositoryDirectory, config.outputDirectory));
  return files[0];
}
