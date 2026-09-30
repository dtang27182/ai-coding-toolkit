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
  for (const directoryName of ["scripts", "adapters", "hld-gen-new", "common", "node_modules"]) {
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

  const skillPath = path.join(repoDirectory, ".agents", "skills", "hld-gen", "SKILL.md");
  assert.equal((await lstat(path.dirname(skillPath))).isSymbolicLink(), false);
  assert.equal(
    await readFile(skillPath, "utf8"),
    await readFile(path.join(toolkitDirectory, "hld-gen-new", "SKILL.md"), "utf8")
  );
  for (const directoryName of ["hld-gen-new", "common", "node_modules"]) {
    assert.equal(
      (await lstat(path.join(repoDirectory, "ai-coding-toolkit", directoryName))).isSymbolicLink(),
      false
    );
  }
  assert.equal(
    JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts.test,
    "existing"
  );

  const inputPath = "ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json";
  const validation = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen-new/eval/validate-impl-dataflow.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);

  const count = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen-new/eval/count-variable-exposure.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(count.status, 0, count.stderr);
  assert.equal(JSON.parse(await readFile(path.join(repoDirectory, inputPath), "utf8")).variableExposureCount, 3);

  for (const toolName of ["hld-gen-new"]) {
    await rm(path.join(repoDirectory, "ai-coding-toolkit", toolName, "visualizer", "dist"), {
      recursive: true,
      force: true,
    });
    const visualizerBuild = spawnSync(process.execPath, [
      "ai-coding-toolkit/node_modules/vite/bin/vite.js",
      "build",
      `ai-coding-toolkit/${toolName}/visualizer`,
    ], { cwd: repoDirectory, encoding: "utf8" });
    assert.equal(visualizerBuild.status, 0, visualizerBuild.stderr);
    assert.match(
      await readFile(path.join(repoDirectory, "ai-coding-toolkit", toolName, "visualizer", "dist", "index.html"), "utf8"),
      /HLD Dataflow Visualizer/
    );
  }
});

test("installs only hld-gen-new while exposing the hld-gen skill", async (t) => {
  const repoDirectory = await createRepository(t);
  await writeFile(path.join(repoDirectory, "package.json"), '{"scripts":{"test":"existing","hld-gen-new-visualizer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/arch-diff/visualizer"}}\n');

  const result = install([repoDirectory, "--tool", "hld-gen-new"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts, {
    test: "existing",
    "hld-visualizer": "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen-new/visualizer",
  });
  assert.equal(
    await readFile(path.join(repoDirectory, ".agents", "skills", "hld-gen", "SKILL.md"), "utf8"),
    await readFile(path.join(toolkitDirectory, "hld-gen-new", "SKILL.md"), "utf8")
  );
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit", "hld-gen-new"))).isDirectory(), true);
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit", "common", "impl-dataflow"))).isDirectory(), true);
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit", "node_modules"))).isDirectory(), true);
  const visualizerPath = path.join(repoDirectory, "ai-coding-toolkit", "hld-gen-new", "visualizer");
  const retiredArchitectureDiffPath = path.join(repoDirectory, "ai-coding-toolkit", "common", "arch-diff");
  await mkdir(retiredArchitectureDiffPath, { recursive: true });
  await writeFile(path.join(retiredArchitectureDiffPath, "obsolete.json"), "obsolete format");
  const systemVisualizerPath = path.join(repoDirectory, "ai-coding-toolkit", "common", "sys-dataflow", "visualizer");
  for (const relativePath of ["index.html", "src/main.ts", "src/standalone.css", "tsconfig.json", "vite.config.mjs", "dist"]) {
    await assert.rejects(lstat(path.join(systemVisualizerPath, relativePath)), { code: "ENOENT" });
    await writeFile(path.join(systemVisualizerPath, relativePath), "retired standalone file");
  }
  await writeFile(path.join(repoDirectory, "package.json"), '{"scripts":{"test":"existing","hld-gen-new-visualizer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/impl-dataflow/visualizer","hld-visualizer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/impl-dataflow/visualizer"}}\n');
  const upgrade = install([repoDirectory, "--tool", "hld-gen-new"]);
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.equal((await lstat(path.join(visualizerPath, "index.html"))).isFile(), true);
  await assert.rejects(lstat(path.join(visualizerPath, "dist")), { code: "ENOENT" });
  await assert.rejects(lstat(retiredArchitectureDiffPath), { code: "ENOENT" });
  for (const relativePath of ["index.html", "src/main.ts", "src/standalone.css", "tsconfig.json", "vite.config.mjs", "dist"]) {
    await assert.rejects(lstat(path.join(systemVisualizerPath, relativePath)), { code: "ENOENT" });
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts, {
    test: "existing",
    "hld-visualizer": "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/hld-gen-new/visualizer",
  });
  await writeFile(path.join(repoDirectory, "package.json"), '{"scripts":{"hld-gen-new-visualizer":"custom old viewer","hld-visualizer":"custom new viewer"}}\n');
  const conflictingCommands = install([repoDirectory, "--tool", "hld-gen-new"]);
  assert.equal(conflictingCommands.status, 0, conflictingCommands.stderr);
  assert.deepEqual(JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts, {
    "hld-gen-new-visualizer": "custom old viewer",
    "hld-visualizer": "custom new viewer",
  });

  const inputPath = "ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json";
  const validation = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen-new/eval/validate-impl-dataflow.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);

  const systemDataflowValidation = spawnSync(process.execPath, [
    "ai-coding-toolkit/common/sys-dataflow/validate-sys-dataflow.mjs",
    "ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(systemDataflowValidation.status, 0, systemDataflowValidation.stderr);

  const count = spawnSync(process.execPath, [
    "ai-coding-toolkit/hld-gen-new/eval/count-variable-exposure.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(count.status, 0, count.stderr);
  assert.equal(JSON.parse(await readFile(path.join(repoDirectory, inputPath), "utf8")).variableExposureCount, 3);

  const visualizerBuild = spawnSync(process.execPath, [
    "ai-coding-toolkit/node_modules/vite/bin/vite.js",
    "build",
    "ai-coding-toolkit/hld-gen-new/visualizer",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(visualizerBuild.status, 0, visualizerBuild.stderr);
  for (const htmlFile of ["index.html", "system.html", "implementation.html"]) {
    assert.equal((await lstat(path.join(visualizerPath, "dist", htmlFile))).isFile(), true);
  }
});

test("installs enrich-diff with the shared dataflow files", async (t) => {
  const repoDirectory = await createRepository(t);
  await writeFile(
    path.join(repoDirectory, "package.json"),
    '{"scripts":{"test":"existing","diff-visualizer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/visualizer","diff-viewer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/diff-viewer/viewer","system-dataflow-visualizer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/common/system-dataflow/visualizer"}}\n'
  );

  const result = install([repoDirectory, "--tool", "enrich-diff"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(repoDirectory, ".agents", "skills", "enrich-diff", "SKILL.md"), "utf8"),
    await readFile(path.join(toolkitDirectory, "enrich-diff", "skills", "enrich-diff", "SKILL.md"), "utf8")
  );
  for (const directoryName of ["enrich-diff", "common", "node_modules"]) {
    assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit", directoryName))).isDirectory(), true);
  }
  await assert.rejects(lstat(path.join(repoDirectory, "ai-coding-toolkit", "hld-gen-new")), { code: "ENOENT" });
  assert.deepEqual(JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts, {
    test: "existing",
    "diff-visualizer": "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/enrich-diff/visualizer",
  });

  const inputPath = "ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json";
  const validation = spawnSync(process.execPath, [
    "ai-coding-toolkit/enrich-diff/scripts/validate-sys-dataflow.mjs", inputPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);

  const patchPath = path.join(repoDirectory, "feature.patch");
  const implementationValidation = spawnSync(process.execPath, [
    "ai-coding-toolkit/enrich-diff/scripts/validate-impl-dataflow.mjs",
    "ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(implementationValidation.status, 0, implementationValidation.stderr);

  await writeFile(patchPath, [
    "diff --git a/src/feature.ts b/src/feature.ts",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/src/feature.ts",
    "@@ -0,0 +1,3 @@",
    "+export function feature() {",
    "+  return true;",
    "+}",
  ].join("\n"));
  const enrichedPatch = spawnSync(process.execPath, [
    "ai-coding-toolkit/common/enriched-patch/generate-enriched-patch.mjs", patchPath,
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(enrichedPatch.status, 0, enrichedPatch.stderr);
  assert.equal(
    JSON.parse(await readFile(path.join(repoDirectory, "feature.enriched-patch.json"), "utf8")).elements["element-2"].name,
    "feature",
  );

  const visualizerBuild = spawnSync(process.execPath, [
    "ai-coding-toolkit/node_modules/vite/bin/vite.js",
    "build",
    "ai-coding-toolkit/enrich-diff/visualizer",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(visualizerBuild.status, 0, visualizerBuild.stderr);
  await assert.rejects(
    lstat(path.join(repoDirectory, "ai-coding-toolkit", "common", "enriched-patch", "visualizer")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    lstat(path.join(repoDirectory, "ai-coding-toolkit", "common", "enriched-patch", "viewer", "index.html")),
    { code: "ENOENT" }
  );

  const retiredEntryPoint = path.join(repoDirectory, "ai-coding-toolkit", "common", "enriched-patch", "viewer", "index.html");
  await writeFile(retiredEntryPoint, "retired entry point");
  const systemVisualizerPath = path.join(repoDirectory, "ai-coding-toolkit", "common", "sys-dataflow", "visualizer");
  for (const relativePath of ["index.html", "src/main.ts", "src/standalone.css", "tsconfig.json", "vite.config.mjs", "dist"]) {
    await assert.rejects(lstat(path.join(systemVisualizerPath, relativePath)), { code: "ENOENT" });
    await writeFile(path.join(systemVisualizerPath, relativePath), "retired standalone file");
  }
  const retiredDataflowDirectory = path.join(repoDirectory, "ai-coding-toolkit", "common", "system-dataflow");
  await mkdir(retiredDataflowDirectory);
  await writeFile(path.join(retiredDataflowDirectory, "system-dataflow.schema.json"), "{}\n");
  const retiredValidator = path.join(repoDirectory, "ai-coding-toolkit", "enrich-diff", "scripts", "validate-system-dataflow.mjs");
  await writeFile(retiredValidator, "retired validator");
  const retiredInstruction = path.join(repoDirectory, "ai-coding-toolkit", "enrich-diff", "instructions", "generate-system-dataflow.md");
  await writeFile(retiredInstruction, "retired instruction");
  const reinstall = install([repoDirectory, "--tool", "enrich-diff"]);
  assert.equal(reinstall.status, 0, reinstall.stderr);
  await assert.rejects(lstat(retiredEntryPoint), { code: "ENOENT" });
  for (const relativePath of ["index.html", "src/main.ts", "src/standalone.css", "tsconfig.json", "vite.config.mjs", "dist"]) {
    await assert.rejects(lstat(path.join(systemVisualizerPath, relativePath)), { code: "ENOENT" });
  }
  await assert.rejects(lstat(retiredDataflowDirectory), { code: "ENOENT" });
  await assert.rejects(lstat(retiredValidator), { code: "ENOENT" });
  await assert.rejects(lstat(retiredInstruction), { code: "ENOENT" });
});

test("installs Claude Code skills with Claude-only frontmatter", async (t) => {
  const repoDirectory = await createRepository(t);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = install([repoDirectory, "--tool", "hld-gen-new", "--agent", "claude"]);
    assert.equal(result.status, 0, result.stderr);
  }
  const sourceSkill = await readFile(path.join(toolkitDirectory, "hld-gen-new", "SKILL.md"), "utf8");
  const claudeSkill = await readFile(path.join(repoDirectory, ".claude", "skills", "hld-gen", "SKILL.md"), "utf8");
  const sourceFrontmatterEnd = sourceSkill.indexOf("\n---\n");
  assert.ok(claudeSkill.startsWith(sourceSkill.slice(0, sourceFrontmatterEnd)));
  assert.ok(claudeSkill.endsWith(sourceSkill.slice(sourceFrontmatterEnd)));
  assert.match(claudeSkill, /\n {2}- Bash\(node ai-coding-toolkit\/hld-gen-new\/eval\/\*\)\n/);
  assert.doesNotMatch(claudeSkill, /\ncontext: fork\n/);
  await assert.rejects(lstat(path.join(repoDirectory, ".agents")), { code: "ENOENT" });

  const bothAgents = install([repoDirectory, "--tool", "enrich-diff", "--agent", "codex,claude"]);
  assert.equal(bothAgents.status, 0, bothAgents.stderr);
  const sourceEnrichDiffSkill = await readFile(
    path.join(toolkitDirectory, "enrich-diff", "skills", "enrich-diff", "SKILL.md"),
    "utf8"
  );
  assert.equal(
    await readFile(path.join(repoDirectory, ".agents", "skills", "enrich-diff", "SKILL.md"), "utf8"),
    sourceEnrichDiffSkill
  );
  const claudeEnrichDiffSkill = await readFile(path.join(repoDirectory, ".claude", "skills", "enrich-diff", "SKILL.md"), "utf8");
  assert.match(claudeEnrichDiffSkill, /\ncontext: fork\n/);
  assert.ok(claudeEnrichDiffSkill.endsWith(sourceEnrichDiffSkill.slice(sourceEnrichDiffSkill.indexOf("\n---\n"))));

  const conflictDirectory = path.join(repoDirectory, ".claude", "skills", "hld-gen");
  await rm(conflictDirectory, { recursive: true });
  await mkdir(conflictDirectory);
  const emptyDirectoryInstall = install([repoDirectory, "--tool", "hld-gen-new", "--agent", "claude"]);
  assert.equal(emptyDirectoryInstall.status, 0, emptyDirectoryInstall.stderr);
  assert.equal(await readFile(path.join(conflictDirectory, "SKILL.md"), "utf8"), claudeSkill);

  await rm(conflictDirectory, { recursive: true });
  await mkdir(conflictDirectory);
  await writeFile(path.join(conflictDirectory, "SKILL.md"), "existing skill");
  const conflict = install([repoDirectory, "--tool", "hld-gen-new", "--agent", "claude"]);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /Refusing to replace existing path/);
  assert.equal(await readFile(path.join(conflictDirectory, "SKILL.md"), "utf8"), "existing skill");
});

test("installs advanced-diff-viewer independently", async (t) => {
  const repoDirectory = await createRepository(t);
  await writeFile(path.join(repoDirectory, "package.json"), '{"scripts":{"test":"existing","advanced-diff-viewer":"node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/advanced-diff-viewer/visualizer","advanced-diff-viewer:generate":"node ai-coding-toolkit/advanced-diff-viewer/generate-diff-index.mjs"}}\n');
  await writeFile(path.join(repoDirectory, "app.ts"), "export const value = 1;\n");
  for (const argumentsList of [
    ["init", "--quiet"],
    ["config", "user.email", "test@example.com"],
    ["config", "user.name", "Test User"],
    ["add", "."],
    ["commit", "--quiet", "-m", "base"],
  ]) {
    const git = spawnSync("git", argumentsList, { cwd: repoDirectory, encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr);
  }

  const result = install([repoDirectory, "--tool", "advanced-diff-viewer"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(path.join(repoDirectory, "package.json"), "utf8")).scripts, {
    test: "existing",
    "adv-diff": "node ai-coding-toolkit/node_modules/vite/bin/vite.js ai-coding-toolkit/advanced-diff-viewer/visualizer",
  });
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit/advanced-diff-viewer"))).isDirectory(), true);
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit/common/enriched-patch"))).isDirectory(), true);
  await assert.rejects(lstat(path.join(repoDirectory, "ai-coding-toolkit/config.json")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(repoDirectory, "docs/plans")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(repoDirectory, "ai-coding-toolkit/advanced-diff-viewer/enriched-patch.json")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(repoDirectory, "ai-coding-toolkit/advanced-diff-viewer/visualizer/dist")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(repoDirectory, "ai-coding-toolkit/common/sys-dataflow")), { code: "ENOENT" });
  await assert.rejects(lstat(path.join(repoDirectory, ".agents")), { code: "ENOENT" });

  const visualizerBuild = spawnSync(process.execPath, [
    "ai-coding-toolkit/node_modules/vite/bin/vite.js", "build", "ai-coding-toolkit/advanced-diff-viewer/visualizer",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(visualizerBuild.status, 0, visualizerBuild.stderr);

  await writeFile(path.join(repoDirectory, "app.ts"), "export const value = 2;\n");
  const generated = spawnSync(process.execPath, [
    "ai-coding-toolkit/advanced-diff-viewer/generate-enriched-patch.mjs",
  ], { cwd: repoDirectory, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  const index = JSON.parse(await readFile(path.join(repoDirectory, "advanced-diff-viewer/enriched-patch.json"), "utf8"));
  assert.match(index.patch, /diff --git a\/app\.ts b\/app\.ts/);
  assert.doesNotMatch(index.patch, /diff --git a\/ai-coding-toolkit\//);

  const reinstall = install([repoDirectory, "--tool", "advanced-diff-viewer"]);
  assert.equal(reinstall.status, 0, reinstall.stderr);
  assert.equal((await lstat(path.join(repoDirectory, "ai-coding-toolkit/advanced-diff-viewer/visualizer/src/main.ts"))).isFile(), true);
  assert.equal((await lstat(path.join(repoDirectory, "advanced-diff-viewer/enriched-patch.json"))).isFile(), true);
});

test("refreshes installed copies on repeat installation", async (t) => {
  const repoDirectory = await createRepository(t);
  const firstInstall = install([repoDirectory]);
  assert.equal(firstInstall.status, 0, firstInstall.stderr);
  const relativePaths = [
    ".agents/skills/hld-gen/SKILL.md",
    "ai-coding-toolkit/hld-gen-new/generate/gen-hld.md",
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

test("keeps configuration in each target and preserves unrelated npm commands", async (t) => {
  const firstRepo = await createRepository(t);
  const secondRepo = await createRepository(t);
  const sourceConfig = await readFile(path.join(toolkitDirectory, "config.json"), "utf8");
  const existingPackage = '{"scripts":{"mermaid":"existing","visualizer":"custom viewer","system-dataflow-visualizer":"custom system viewer"}}\n';
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
  assert.equal(installedPackage.scripts.visualizer, "custom viewer");
  assert.equal(installedPackage.scripts["system-dataflow-visualizer"], "custom system viewer");
});

test("rejects missing targets and invalid arguments", async (t) => {
  const repoDirectory = await createRepository(t);
  for (const argumentsList of [
    [],
    [path.join(repoDirectory, "missing")],
    [repoDirectory, "--agent", "unknown"],
    [repoDirectory, "--agent", "codex,unknown"],
    [repoDirectory, "--output-dir"],
    [repoDirectory, "--output-dir", "../outside"],
    [repoDirectory, "--output-dir", repoDirectory],
    [repoDirectory, "--output-dir", "."],
    [repoDirectory, "--tool"],
    [repoDirectory, "--tool", "unknown"],
    [repoDirectory, "--unknown"],
  ]) {
    assert.notEqual(install(argumentsList).status, 0, JSON.stringify(argumentsList));
  }
  await assert.rejects(realpath(path.join(repoDirectory, ".agents")), { code: "ENOENT" });
  await assert.rejects(realpath(path.join(repoDirectory, ".claude")), { code: "ENOENT" });
  await assert.rejects(realpath(path.join(repoDirectory, "ai-coding-toolkit")), { code: "ENOENT" });
});

test("preserves conflicting skill paths and runtime links", async (t) => {
  const repoDirectory = await createRepository(t);
  const skillDirectory = path.join(repoDirectory, ".agents", "skills", "hld-gen");
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(path.join(skillDirectory, "SKILL.md"), "existing skill");
  const skillConflict = install([repoDirectory]);
  assert.notEqual(skillConflict.status, 0);
  assert.match(skillConflict.stderr, /Refusing to replace existing path/);
  assert.equal(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8"), "existing skill");

  const otherRepo = await createRepository(t);
  await mkdir(path.join(otherRepo, "ai-coding-toolkit"));
  await symlink(repoDirectory, path.join(otherRepo, "ai-coding-toolkit", "hld-gen-new"), "dir");
  const linkConflict = install([otherRepo]);
  assert.notEqual(linkConflict.status, 0);
  assert.match(linkConflict.stderr, /Refusing to replace existing link/);
  assert.equal(
    await realpath(path.join(otherRepo, "ai-coding-toolkit", "hld-gen-new")),
    await realpath(repoDirectory)
  );
});

test("replaces earlier toolkit links with independent copies", async (t) => {
  const repoDirectory = await realpath(await createRepository(t));
  await mkdir(path.join(repoDirectory, "ai-coding-toolkit"));
  await mkdir(path.join(repoDirectory, ".agents", "skills"), { recursive: true });
  const directories = [
    ["hld-gen-new", "ai-coding-toolkit/hld-gen-new"],
    ["hld-gen-new", ".agents/skills/hld-gen"],
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
