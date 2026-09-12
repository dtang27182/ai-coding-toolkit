import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function install(argumentsList, sourceDirectory = toolkitDirectory) {
  return spawnSync(process.execPath, [path.join(sourceDirectory, "scripts", "init.mjs"), ...argumentsList], {
    cwd: sourceDirectory,
    encoding: "utf8",
  });
}

async function createRepository(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toolkit target "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("copies skills and scripts that work after the source checkout is removed", async (t) => {
  const sourceDirectory = await createRepository(t);
  for (const directoryName of ["scripts", "adapters", "hld-gen", "node_modules"]) {
    await cp(path.join(toolkitDirectory, directoryName), path.join(sourceDirectory, directoryName), {
      recursive: true,
      dereference: true,
    });
  }
  const repoDirectory = await createRepository(t);
  await writeFile(path.join(repoDirectory, "package.json"), '{"scripts":{"test":"existing"}}\n');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = install([path.relative(sourceDirectory, repoDirectory)], sourceDirectory);
    assert.equal(result.status, 0, result.stderr);
  }
  await rm(sourceDirectory, { recursive: true });

  for (const skillName of ["hld-gen", "hld-eval"]) {
    const skillPath = path.join(repoDirectory, ".agents", "skills", skillName, "SKILL.md");
    assert.equal((await lstat(path.dirname(skillPath))).isSymbolicLink(), false);
    assert.equal(
      await readFile(skillPath, "utf8"),
      await readFile(path.join(toolkitDirectory, "hld-gen", "skills", skillName, "SKILL.md"), "utf8")
    );
  }
  for (const directoryName of ["hld-gen", "node_modules"]) {
    assert.equal(
      (await lstat(path.join(repoDirectory, "ai-coding-toolkit", directoryName))).isSymbolicLink(),
      false
    );
  }
  assert.equal(
    JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts.test,
    "existing"
  );

  const inputPath = "ai-coding-toolkit/hld-gen/references/architecture-diff.example.json";
  const validation = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);

  const count = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(count.status, 0, count.stderr);
  assert.equal(JSON.parse(await readFile(path.join(repoDirectory, inputPath), "utf8")).variableExposureCount, 3);

  const previewPath = "docs/plans/example.mermaid.md";
  const preview = spawnSync("npm", ["run", "mermaid", "--", inputPath, previewPath], {
    cwd: repoDirectory,
    encoding: "utf8",
  });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(await readFile(path.join(repoDirectory, previewPath), "utf8"), /```mermaid/);

  await rm(path.join(repoDirectory, "ai-coding-toolkit", "hld-gen", "visualizer", "dist"), {
    recursive: true,
    force: true,
  });
  const visualizerBuild = spawnSync(process.execPath, [
    "ai-coding-toolkit/node_modules/vite/bin/vite.js",
    "build",
    "ai-coding-toolkit/hld-gen/visualizer",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(visualizerBuild.status, 0, visualizerBuild.stderr);
  assert.match(
    await readFile(path.join(repoDirectory, "ai-coding-toolkit", "hld-gen", "visualizer", "dist", "index.html"), "utf8"),
    /Architecture Diff Viewer/
  );
});

test("refreshes installed copies on repeat installation", async (t) => {
  const repoDirectory = await createRepository(t);
  const firstInstall = install([repoDirectory]);
  assert.equal(firstInstall.status, 0, firstInstall.stderr);
  const relativePaths = [
    ".agents/skills/hld-gen/SKILL.md",
    "ai-coding-toolkit/hld-gen/references/hld-narrative.md",
    "ai-coding-toolkit/node_modules/ajv/package.json",
  ];
  const installedContents = [];
  for (const relativePath of relativePaths) {
    installedContents.push(await readFile(path.join(repoDirectory, relativePath), "utf8"));
    await writeFile(path.join(repoDirectory, relativePath), "outdated copy");
  }
  const secondInstall = install([repoDirectory]);
  assert.equal(secondInstall.status, 0, secondInstall.stderr);
  for (let index = 0; index < relativePaths.length; index += 1) {
    assert.equal(await readFile(path.join(repoDirectory, relativePaths[index]), "utf8"), installedContents[index]);
  }
});

test("keeps configuration in each target and preserves an existing mermaid command", async (t) => {
  const firstRepo = await createRepository(t);
  const secondRepo = await createRepository(t);
  const sourceConfig = await readFile(path.join(toolkitDirectory, "config.json"), "utf8");
  const existingPackage = '{"scripts":{"mermaid":"existing"}}\n';
  await writeFile(path.join(firstRepo, "package.json"), existingPackage);

  const firstInstall = install([firstRepo, "--output-dir", "architecture/plans"]);
  const secondInstall = install([secondRepo]);
  assert.equal(firstInstall.status, 0, firstInstall.stderr);
  assert.equal(secondInstall.status, 0, secondInstall.stderr);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(firstRepo, "ai-coding-toolkit", "config.json"), "utf8")),
    { outputDirectory: "architecture/plans" }
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(secondRepo, "ai-coding-toolkit", "config.json"), "utf8")),
    { outputDirectory: "docs/plans" }
  );
  assert.equal(await readFile(path.join(toolkitDirectory, "config.json"), "utf8"), sourceConfig);
  const installedPackage = JSON.parse(await readFile(path.join(firstRepo, "package.json"), "utf8"));
  assert.equal(installedPackage.scripts.mermaid, "existing");
  assert.equal(
    installedPackage.scripts.visualizer,
    "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen/visualizer"
  );
});

test("rejects missing targets and invalid arguments", async (t) => {
  const repoDirectory = await createRepository(t);
  for (const argumentsList of [
    [],
    [path.join(repoDirectory, "missing")],
    [repoDirectory, "--agent", "unknown"],
    [repoDirectory, "--output-dir"],
    [repoDirectory, "--output-dir", "../outside"],
    [repoDirectory, "--output-dir", repoDirectory],
    [repoDirectory, "--output-dir", "."],
    [repoDirectory, "--unknown"],
  ]) {
    assert.notEqual(install(argumentsList).status, 0, JSON.stringify(argumentsList));
  }
  await assert.rejects(realpath(path.join(repoDirectory, ".agents")), { code: "ENOENT" });
  await assert.rejects(realpath(path.join(repoDirectory, "ai-coding-toolkit")), { code: "ENOENT" });
});

test("preserves conflicting skill paths and runtime links", async (t) => {
  const repoDirectory = await createRepository(t);
  const skillDirectory = path.join(repoDirectory, ".agents", "skills", "hld-eval");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "existing skill");
  const skillConflict = install([repoDirectory]);
  assert.notEqual(skillConflict.status, 0);
  assert.match(skillConflict.stderr, /Refusing to replace existing path/);
  assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), "existing skill");

  const otherRepo = await createRepository(t);
  await mkdir(path.join(otherRepo, "ai-coding-toolkit"));
  await symlink(repoDirectory, path.join(otherRepo, "ai-coding-toolkit", "hld-gen"), "dir");
  const linkConflict = install([otherRepo]);
  assert.notEqual(linkConflict.status, 0);
  assert.match(linkConflict.stderr, /Refusing to replace existing link/);
  assert.equal(
    await realpath(path.join(otherRepo, "ai-coding-toolkit", "hld-gen")),
    await realpath(repoDirectory)
  );
});

test("replaces earlier toolkit links with independent copies", async (t) => {
  const repoDirectory = await realpath(await createRepository(t));
  await mkdir(path.join(repoDirectory, "ai-coding-toolkit"));
  await mkdir(path.join(repoDirectory, ".agents", "skills"), { recursive: true });
  const directories = [
    ["hld-gen", "ai-coding-toolkit/hld-gen"],
    ["hld-gen/skills/hld-gen", ".agents/skills/hld-gen"],
    ["hld-gen/skills/hld-eval", ".agents/skills/hld-eval"],
  ];
  for (const [sourcePath, destinationPath] of directories) {
    await symlink(
      path.relative(path.dirname(path.join(repoDirectory, destinationPath)), path.join(toolkitDirectory, sourcePath)),
      path.join(repoDirectory, destinationPath),
      "dir"
    );
  }
  const result = install([repoDirectory]);
  assert.equal(result.status, 0, result.stderr);
  for (const [sourcePath, destinationPath] of directories) {
    assert.equal((await lstat(path.join(repoDirectory, destinationPath))).isSymbolicLink(), false);
    assert.equal((await lstat(path.join(toolkitDirectory, sourcePath))).isDirectory(), true);
  }
});
