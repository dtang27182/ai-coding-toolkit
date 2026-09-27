import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "common", "enriched-patch", "generate-full-context-patch.mjs");

function git(repositoryDirectory, argumentsList, environment = process.env) {
  const result = spawnSync("git", argumentsList, { cwd: repositoryDirectory, encoding: "utf8", env: environment });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("generates one full-context patch without changing the real index", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "full-context-patch-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, ".gitignore"), "ignored.txt\n");
  await writeFile(path.join(repositoryDirectory, "tracked.txt"), "tracked before\nsecond line\n");
  await writeFile(path.join(repositoryDirectory, "staged.txt"), "staged before\n");
  await writeFile(path.join(repositoryDirectory, "deleted.txt"), "delete me\n");
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);

  await writeFile(path.join(repositoryDirectory, "tracked.txt"), "tracked after\nsecond line\n");
  await writeFile(path.join(repositoryDirectory, "staged.txt"), "staged after\n");
  git(repositoryDirectory, ["add", "staged.txt"]);
  await unlink(path.join(repositoryDirectory, "deleted.txt"));
  await writeFile(path.join(repositoryDirectory, "new-file.txt"), "new first line\nnew second line\n");
  await writeFile(path.join(repositoryDirectory, "ignored.txt"), "ignore me\n");
  await mkdir(path.join(repositoryDirectory, "artifacts"));
  await writeFile(path.join(repositoryDirectory, "artifacts", "previous-review.json"), "{}\n");

  const indexBefore = git(repositoryDirectory, ["ls-files", "--stage"]);
  const result = spawnSync(process.execPath, [generatorPath, "artifacts/feature.patch"], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const indexAfter = git(repositoryDirectory, ["ls-files", "--stage"]);
  const patch = await readFile(path.join(repositoryDirectory, "artifacts", "feature.patch"), "utf8");

  assert.equal(indexAfter, indexBefore);
  assert.match(patch, /diff --git a\/tracked\.txt b\/tracked\.txt/);
  assert.match(patch, /diff --git a\/staged\.txt b\/staged\.txt/);
  assert.match(patch, /diff --git a\/deleted\.txt b\/deleted\.txt/);
  assert.match(patch, /diff --git a\/new-file\.txt b\/new-file\.txt/);
  assert.match(patch, /new file mode/);
  assert.match(patch, /@@ -0,0 \+1,2 @@/);
  assert.doesNotMatch(patch, /ignored\.txt/);
  assert.match(patch, /diff --git a\/artifacts\/previous-review\.json b\/artifacts\/previous-review\.json/);
  assert.doesNotMatch(patch, /feature\.patch/);
});

test("compares ancestor commits from older to newer without including working-tree changes", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "commit-context-patch-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "original\n");
  git(repositoryDirectory, ["add", "feature.txt"]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);
  const base = git(repositoryDirectory, ["rev-parse", "HEAD"]).trim();
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "committed\n");
  git(repositoryDirectory, ["commit", "--quiet", "-am", "target"]);
  const target = git(repositoryDirectory, ["rev-parse", "HEAD"]).trim();
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "newer commit\n");
  git(repositoryDirectory, ["commit", "--quiet", "-am", "newer"]);
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "uncommitted\n");
  const statusBefore = git(repositoryDirectory, ["status", "--porcelain"]);

  const outputPath = path.join(os.tmpdir(), `commit-context-${path.basename(repositoryDirectory)}.patch`);
  t.after(() => rm(outputPath, { force: true }));
  const result = spawnSync(process.execPath, [generatorPath, outputPath, "--commits", base, target], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const patch = await readFile(outputPath, "utf8");
  assert.match(patch, /-original\n\+committed\n/);
  assert.doesNotMatch(patch, /newer commit/);
  assert.doesNotMatch(patch, /uncommitted/);
  assert.equal(git(repositoryDirectory, ["status", "--porcelain"]), statusBefore);

  const reversed = spawnSync(process.execPath, [generatorPath, outputPath, "--commits", target, base], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  assert.equal(reversed.status, 0, reversed.stderr);
  assert.equal(await readFile(outputPath, "utf8"), patch);
});

test("compares divergent commits by committer time regardless of input order", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "divergent-context-patch-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "shared\n");
  git(repositoryDirectory, ["add", "feature.txt"]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);
  const commonBase = git(repositoryDirectory, ["rev-parse", "HEAD"]).trim();

  await writeFile(path.join(repositoryDirectory, "feature.txt"), "older branch\n");
  git(repositoryDirectory, ["commit", "--quiet", "-am", "older"], {
    ...process.env,
    GIT_AUTHOR_DATE: "2001-01-01T00:00:00+0000",
    GIT_COMMITTER_DATE: "2001-01-01T00:00:00+0000",
  });
  const older = git(repositoryDirectory, ["rev-parse", "HEAD"]).trim();

  git(repositoryDirectory, ["checkout", "--quiet", "-b", "newer-branch", commonBase]);
  await writeFile(path.join(repositoryDirectory, "feature.txt"), "newer branch\n");
  git(repositoryDirectory, ["commit", "--quiet", "-am", "newer"], {
    ...process.env,
    GIT_AUTHOR_DATE: "2002-01-01T00:00:00+0000",
    GIT_COMMITTER_DATE: "2002-01-01T00:00:00+0000",
  });
  const newer = git(repositoryDirectory, ["rev-parse", "HEAD"]).trim();

  const outputPath = path.join(repositoryDirectory, "comparison.patch");
  const result = spawnSync(process.execPath, [generatorPath, outputPath, "--commits", newer, older], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(outputPath, "utf8"), /-older branch\n\+newer branch\n/);
});
