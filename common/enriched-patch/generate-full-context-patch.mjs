import { spawn, spawnSync } from "node:child_process";
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
    const unignoredPaths = excludedPaths.filter((file) =>
      spawnSync("git", ["check-ignore", "--quiet", "--", file], { cwd: repositoryDirectory }).status !== 0
    );
    await runGit(["add", "-A", "--", ".", ...unignoredPaths.map((file) => `:(exclude,literal)${file}`)], repositoryDirectory, environment);
    const patch = await runGit([
      "diff",
      "--cached",
      "--no-ext-diff",
      "--no-color",
      "--binary",
      "--unified=1000000",
      "HEAD",
      "--",
      ".",
      ...excludedPaths.map((file) => `:(exclude,literal)${file}`),
    ], repositoryDirectory, environment);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, patch);
    return patch;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function generateCommitPatch(outputPath, firstRevision, secondRevision, workingDirectory = process.cwd()) {
  const repositoryDirectory = (await runGit(["rev-parse", "--show-toplevel"], workingDirectory)).trim();
  const first = (await runGit(["rev-parse", "--verify", "--end-of-options", `${firstRevision}^{commit}`], repositoryDirectory)).trim();
  const second = (await runGit(["rev-parse", "--verify", "--end-of-options", `${secondRevision}^{commit}`], repositoryDirectory)).trim();
  const firstOnly = (await runGit(["rev-list", "--max-count=1", first, "--not", second], repositoryDirectory)).trim();
  const secondOnly = (await runGit(["rev-list", "--max-count=1", second, "--not", first], repositoryDirectory)).trim();
  let base;
  let target;
  if (firstOnly === "" && secondOnly !== "") {
    base = first;
    target = second;
  } else if (secondOnly === "" && firstOnly !== "") {
    base = second;
    target = first;
  } else if (firstOnly === "" && secondOnly === "") {
    base = first;
    target = second;
  } else {
    const firstTime = Number((await runGit(["show", "-s", "--format=%ct", first], repositoryDirectory)).trim());
    const secondTime = Number((await runGit(["show", "-s", "--format=%ct", second], repositoryDirectory)).trim());
    if (firstTime < secondTime) {
      base = first;
      target = second;
    } else if (secondTime < firstTime) {
      base = second;
      target = first;
    } else {
      throw new Error("Cannot determine which commit is older: unrelated commits have the same committer timestamp.");
    }
  }
  const patch = await runGit([
    "diff",
    "--no-ext-diff",
    "--no-color",
    "--binary",
    "--unified=1000000",
    base,
    target,
    "--",
  ], repositoryDirectory);
  const resolvedOutputPath = path.resolve(workingDirectory, outputPath);
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, patch);
  return patch;
}

async function main() {
  const outputArgument = process.argv[2];
  const commitMode = process.argv[3] === "--commits";
  if (outputArgument === undefined || (commitMode && process.argv.length !== 6) || (!commitMode && process.argv.length !== 3)) {
    console.error("Usage: node generate-full-context-patch.mjs <output-patch> [--commits <commit-1> <commit-2>]");
    process.exitCode = 1;
  } else {
    const outputPath = path.resolve(outputArgument);
    if (commitMode) {
      await generateCommitPatch(outputPath, process.argv[4], process.argv[5]);
    } else {
      await generateFullContextPatch(outputPath);
    }
    console.log(`Generated full-context patch: ${outputPath}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
