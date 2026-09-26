import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "common", "enriched-patch-viewer", "generate-full-context-patch.mjs");

function git(repositoryDirectory, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: repositoryDirectory, encoding: "utf8" });
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
  const result = spawnSync(process.execPath, [generatorPath, "artifacts/feature.code-review.patch"], {
    cwd: repositoryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const indexAfter = git(repositoryDirectory, ["ls-files", "--stage"]);
  const patch = await readFile(path.join(repositoryDirectory, "artifacts", "feature.code-review.patch"), "utf8");

  assert.equal(indexAfter, indexBefore);
  assert.match(patch, /diff --git a\/tracked\.txt b\/tracked\.txt/);
  assert.match(patch, /diff --git a\/staged\.txt b\/staged\.txt/);
  assert.match(patch, /diff --git a\/deleted\.txt b\/deleted\.txt/);
  assert.match(patch, /diff --git a\/new-file\.txt b\/new-file\.txt/);
  assert.match(patch, /new file mode/);
  assert.match(patch, /@@ -0,0 \+1,2 @@/);
  assert.doesNotMatch(patch, /ignored\.txt/);
  assert.match(patch, /diff --git a\/artifacts\/previous-review\.json b\/artifacts\/previous-review\.json/);
  assert.doesNotMatch(patch, /feature\.code-review\.patch/);
});
