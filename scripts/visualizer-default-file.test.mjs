import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findFirstArchitectureDiff } from "../hld-gen/visualizer/default-architecture-diff.mjs";

test("finds the first architecture diff in the configured output directory", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "alpha"), { recursive: true });
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "bravo"), { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  await writeFile(path.join(repositoryDirectory, "docs", "plans", "notes.json"), "{}");
  await writeFile(path.join(repositoryDirectory, "docs", "plans", "bravo", "bravo.architecture-diff.hld.json"), "{}");
  const firstPath = path.join(repositoryDirectory, "docs", "plans", "alpha", "alpha.architecture-diff.hld.json");
  await writeFile(firstPath, "{}");

  assert.equal(await findFirstArchitectureDiff(repositoryDirectory, toolkitDirectory), firstPath);
});

test("returns no default when the configured output directory has no architecture diff", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');

  assert.equal(await findFirstArchitectureDiff(repositoryDirectory, toolkitDirectory), undefined);
});
