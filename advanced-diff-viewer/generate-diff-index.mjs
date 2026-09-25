import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateDiffIndex } from "../common/diff-viewer/generate-diff-index.mjs";
import { generateFullContextPatch } from "../common/diff-viewer/generate-full-context-patch.mjs";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function generateAdvancedDiffIndex(workingDirectory = process.cwd()) {
  const repositoryDirectory = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: workingDirectory,
    encoding: "utf8",
  }).trim();
  const outputFile = path.join(repositoryDirectory, "advanced-diff-viewer", "diff-index.json");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "advanced-diff-viewer-"));
  const excludedPaths = ["advanced-diff-viewer/diff-index.json"];
  if (toolkitDirectory === path.join(repositoryDirectory, "ai-coding-toolkit")) {
    excludedPaths.push("ai-coding-toolkit");
  }
  const unignoredPaths = excludedPaths.filter((file) =>
    spawnSync("git", ["check-ignore", "--quiet", "--", file], { cwd: repositoryDirectory }).status !== 0
  );

  try {
    const patch = await generateFullContextPatch(
      path.join(temporaryDirectory, "changes.patch"),
      repositoryDirectory,
      unignoredPaths,
    );
    if (patch.trim() === "") {
      await rm(outputFile, { force: true });
      return undefined;
    } else {
      const index = generateDiffIndex(patch);
      await mkdir(path.dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`);
      return outputFile;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputFile = await generateAdvancedDiffIndex(process.argv[2] ?? process.cwd());
  if (outputFile === undefined) {
    console.log("No changes against HEAD.");
  } else {
    console.log(`Generated Diff Index: ${outputFile}`);
  }
}
