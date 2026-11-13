import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findNewestUiDiff } from "../common/ui-spec/viewer/default-ui-diff.mjs";

test("opens the newest UI diff under the configured output directory", async (t) => {
  const repositoryDirectory = await mkdtemp(path.join(os.tmpdir(), "ui-spec-default-"));
  t.after(() => rm(repositoryDirectory, { recursive: true, force: true }));
  const toolkitDirectory = path.join(repositoryDirectory, "ai-coding-toolkit");
  const outputDirectory = path.join(repositoryDirectory, "docs/plans/feature");
  await mkdir(toolkitDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(toolkitDirectory, "config.json"), '{"outputDirectory":"docs/plans"}\n');
  assert.equal(await findNewestUiDiff(repositoryDirectory, toolkitDirectory), undefined);

  const requestedName = path.join(outputDirectory, "requested.ui.diff.json");
  const skillName = path.join(outputDirectory, "skill.diff.ui.json");
  const unrelated = path.join(outputDirectory, "unrelated.ui.json");
  await Promise.all([requestedName, skillName, unrelated].map((file) => writeFile(file, "{}")));
  await utimes(requestedName, new Date(1000), new Date(1000));
  await utimes(skillName, new Date(2000), new Date(2000));
  await utimes(unrelated, new Date(3000), new Date(3000));
  assert.equal(await findNewestUiDiff(repositoryDirectory, toolkitDirectory), skillName);

  await utimes(requestedName, new Date(4000), new Date(4000));
  assert.equal(await findNewestUiDiff(repositoryDirectory, toolkitDirectory), requestedName);
});
