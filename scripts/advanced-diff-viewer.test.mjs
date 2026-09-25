import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = path.join(toolkitDirectory, "advanced-diff-viewer", "generate-diff-index.mjs");

function git(repositoryDirectory, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: repositoryDirectory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("generates a repeatable index for current changes without indexing its own output", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "advanced-diff-viewer-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  git(repositoryDirectory, ["init", "--quiet"]);
  git(repositoryDirectory, ["config", "user.email", "test@example.com"]);
  git(repositoryDirectory, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repositoryDirectory, "changed.ts"), "export const changed = 1;\n");
  await writeFile(path.join(repositoryDirectory, "staged.ts"), "export const staged = 1;\n");
  await writeFile(path.join(repositoryDirectory, "deleted.ts"), "export const deleted = 1;\n");
  git(repositoryDirectory, ["add", "."]);
  git(repositoryDirectory, ["commit", "--quiet", "-m", "base"]);

  await writeFile(path.join(repositoryDirectory, "changed.ts"), "export const changed = 2;\n");
  await writeFile(path.join(repositoryDirectory, "staged.ts"), "export const staged = 2;\n");
  git(repositoryDirectory, ["add", "staged.ts"]);
  await unlink(path.join(repositoryDirectory, "deleted.ts"));
  await writeFile(path.join(repositoryDirectory, "new.ts"), "export const added = true;\n");
  const indexBefore = git(repositoryDirectory, ["ls-files", "--stage"]);

  const firstRun = spawnSync(process.execPath, [generatorPath, repositoryDirectory], { encoding: "utf8" });
  assert.equal(firstRun.status, 0, firstRun.stderr);
  const outputFile = path.join(repositoryDirectory, "advanced-diff-viewer", "diff-index.json");
  const firstOutput = await readFile(outputFile, "utf8");
  const secondRun = spawnSync(process.execPath, [generatorPath, repositoryDirectory], { encoding: "utf8" });
  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.equal(await readFile(outputFile, "utf8"), firstOutput);
  assert.equal(git(repositoryDirectory, ["ls-files", "--stage"]), indexBefore);

  const index = JSON.parse(await readFile(outputFile, "utf8"));
  const indexedFiles = Object.values(index.elements)
    .filter((element) => element.kind === "file")
    .map((element) => element.name);
  assert.deepEqual(indexedFiles, ["changed.ts", "deleted.ts", "new.ts", "staged.ts"]);
  assert.doesNotMatch(index.patch, /advanced-diff-viewer\/diff-index\.json/);
  const newerFile = path.join(repositoryDirectory, "advanced-diff-viewer", "newer.diff-index.json");
  await writeFile(newerFile, firstOutput);
  const newerTime = new Date(Date.now() + 60_000);
  await utimes(newerFile, newerTime, newerTime);

  const originalDirectory = process.cwd();
  process.chdir(repositoryDirectory);
  try {
    const configPath = path.join(toolkitDirectory, "advanced-diff-viewer/visualizer/vite.config.mjs");
    const { default: config } = await import(`${pathToFileURL(configPath).href}?repository=${Date.now()}`);
    let middleware;
    config.plugins[0].configureServer({ middlewares: { use(handler) { middleware = handler; } } });
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) { this.body = body; },
    };
    await middleware({ method: "GET", url: "/__diff-index/default" }, response, () => {
      assert.fail("The default index endpoint did not handle the request.");
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).fileName, "advanced-diff-viewer/newer.diff-index.json");
  } finally {
    process.chdir(originalDirectory);
  }
});
