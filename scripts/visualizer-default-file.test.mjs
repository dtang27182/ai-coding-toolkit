import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findNewestArchitectureDiff } from "../hld-gen/visualizer/default-architecture-diff.mjs";
import { findNewestArchitectureDiff as findNewestNewArchitectureDiff } from "../common/arch-diff/visualizer/default-architecture-diff.mjs";

test("finds the most recently modified architecture diff in the configured output directory", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "alpha"), { recursive: true });
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "bravo"), { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  await writeFile(path.join(repositoryDirectory, "docs", "plans", "notes.json"), "{}");
  const newestPath = path.join(repositoryDirectory, "docs", "plans", "bravo", "bravo.architecture-diff.hld.json");
  await writeFile(newestPath, "{}");
  const firstPath = path.join(repositoryDirectory, "docs", "plans", "alpha", "alpha.architecture-diff.hld.json");
  await writeFile(firstPath, "{}");
  await utimes(firstPath, 1000, 1000);
  await utimes(newestPath, 2000, 2000);

  assert.equal(await findNewestArchitectureDiff(repositoryDirectory, toolkitDirectory), newestPath);

  await utimes(firstPath, 3000, 3000);
  assert.equal(await findNewestArchitectureDiff(repositoryDirectory, toolkitDirectory), firstPath);
});

test("returns no default when the configured output directory has no architecture diff", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');

  assert.equal(await findNewestArchitectureDiff(repositoryDirectory, toolkitDirectory), undefined);
});

test("finds arch-diff files for hld-gen-new", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "alpha"), { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  const archDiffPath = path.join(repositoryDirectory, "docs", "plans", "alpha", "alpha.arch-diff.hld.json");
  await writeFile(archDiffPath, "{}");

  assert.equal(await findNewestNewArchitectureDiff(repositoryDirectory, toolkitDirectory), archDiffPath);
});
