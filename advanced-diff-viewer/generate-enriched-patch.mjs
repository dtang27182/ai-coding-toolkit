import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateEnrichedPatch } from "../common/enriched-patch/generate-enriched-patch.mjs";
import { generateFullContextPatch } from "../common/enriched-patch/generate-full-context-patch.mjs";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enrichedPatchPath = path.join("adv-diff", "enriched-patch.json");

export async function advancedDiffExcludedPaths(repositoryDirectory) {
  const excludedPaths = [enrichedPatchPath];
  if (toolkitDirectory === path.join(repositoryDirectory, "ai-coding-toolkit")) {
    excludedPaths.push("ai-coding-toolkit");
    try {
      const config = JSON.parse(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"));
      excludedPaths.push(path.relative(repositoryDirectory, path.resolve(repositoryDirectory, config.outputDirectory)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return excludedPaths;
}

export async function generateAdvancedEnrichedPatch(workingDirectory = process.cwd()) {
  const repositoryDirectory = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: workingDirectory,
    encoding: "utf8",
  }).trim();
  const outputFile = path.join(repositoryDirectory, enrichedPatchPath);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "advanced-diff-viewer-"));

  try {
    const patch = await generateFullContextPatch(
      path.join(temporaryDirectory, "changes.patch"),
      repositoryDirectory,
      await advancedDiffExcludedPaths(repositoryDirectory),
    );
    if (patch.trim() === "") {
      await rm(outputFile, { force: true });
      return undefined;
    } else {
      const index = generateEnrichedPatch(patch);
      await mkdir(path.dirname(outputFile), { recursive: true });
      await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`);
      return outputFile;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputFile = await generateAdvancedEnrichedPatch(process.argv[2] ?? process.cwd());
  if (outputFile === undefined) {
    console.log("No changes against HEAD.");
  } else {
    console.log(`Generated Enriched Patch: ${outputFile}`);
  }
}
