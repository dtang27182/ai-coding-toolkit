import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function runGit(argumentsList, workingDirectory, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", argumentsList, {
      cwd: workingDirectory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `git ${argumentsList[0]} failed with exit code ${code}`));
      }
    });
  });
}

export async function generateFullContextPatch(outputPath, workingDirectory = process.cwd(), excludedPaths = []) {
  const repositoryDirectory = (await runGit(["rev-parse", "--show-toplevel"], workingDirectory)).trim();
  const resolvedOutputPath = path.resolve(workingDirectory, outputPath);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-coding-toolkit-diff-"));
  const repositoryObjectDirectory = path.resolve(
    repositoryDirectory,
    (await runGit(["rev-parse", "--git-path", "objects"], repositoryDirectory)).trim(),
  );
  const temporaryObjectDirectory = path.join(temporaryDirectory, "objects");
  await mkdir(temporaryObjectDirectory);
  const alternateObjectDirectories = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES === undefined
    ? repositoryObjectDirectory
    : `${repositoryObjectDirectory}${path.delimiter}${process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES}`;
  const environment = {
    ...process.env,
    GIT_INDEX_FILE: path.join(temporaryDirectory, "index"),
    GIT_OBJECT_DIRECTORY: temporaryObjectDirectory,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: alternateObjectDirectories,
  };

  try {
    await runGit(["read-tree", "HEAD"], repositoryDirectory, environment);
    await runGit(["add", "-A", "--", ".", ...excludedPaths.map((file) => `:(exclude)${file}`)], repositoryDirectory, environment);
    const patch = await runGit([
      "diff",
      "--cached",
      "--no-ext-diff",
      "--no-color",
      "--binary",
      "--unified=1000000",
      "HEAD",
      "--",
    ], repositoryDirectory, environment);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, patch);
    return patch;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const outputArgument = process.argv[2];
  if (outputArgument === undefined) {
    console.error("Usage: node generate-full-context-patch.mjs <output-patch>");
    process.exitCode = 1;
  } else {
    const outputPath = path.resolve(outputArgument);
    await generateFullContextPatch(outputPath);
    console.log(`Generated full-context patch: ${outputPath}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
