import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findNewestImplementationDataflow } from "../common/impl-dataflow/visualizer/default-impl-dataflow.mjs";

test("finds implementation dataflow files for hld-gen-new", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "visualizer repository "));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  await mkdir(path.join(repositoryDirectory, "docs", "plans", "alpha"), { recursive: true });
  await mkdir(toolkitDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  const implementationDataflowPath = path.join(repositoryDirectory, "docs", "plans", "alpha", "alpha.impl-dataflow.json");
  await writeFile(implementationDataflowPath, "{}");

  assert.equal(await findNewestImplementationDataflow(repositoryDirectory, toolkitDirectory), implementationDataflowPath);
});
