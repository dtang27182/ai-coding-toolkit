import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateEnrichedPatch } from "../common/enriched-patch/generate-enriched-patch.mjs";
import { changeOwnershipErrors } from "../enrich-diff/scripts/validate-enriched-patch.mjs";

const validatorPath = fileURLToPath(new URL("../enrich-diff/scripts/validate-enriched-patch.mjs", import.meta.url));
const patch = [
  "diff --git a/src/run.js b/src/run.js",
  "index 1111111..2222222 100644",
  "--- a/src/run.js",
  "+++ b/src/run.js",
  "@@ -1,3 +1,3 @@",
  " function run() {",
  "-  return 1;",
  "+  return 2;",
  " }",
].join("\n");

test("accepts each changed row assigned to one element", () => {
  assert.deepEqual(changeOwnershipErrors(generateEnrichedPatch(patch)), []);
});

test("reports changed rows missing from every changes list", () => {
  const index = generateEnrichedPatch(patch);
  index.elements["element-2"].changes = [];
  assert.deepEqual(changeOwnershipErrors(index), [
    "src/run.js old line 2 is not assigned to a change.",
    "src/run.js new line 2 is not assigned to a change.",
  ]);
});

test("reports changed rows assigned to multiple elements", () => {
  const index = generateEnrichedPatch(patch);
  index.elements["element-1"].changes.push(structuredClone(index.elements["element-2"].changes[0]));
  assert.deepEqual(changeOwnershipErrors(index), [
    "src/run.js old line 2 is assigned more than once: element-1, element-2.",
    "src/run.js new line 2 is assigned more than once: element-1, element-2.",
  ]);
});

test("rejects a change range that includes an unchanged context row", () => {
  const index = generateEnrichedPatch(patch);
  index.elements["element-2"].changes[0].oldLines = [1, 2];
  assert.deepEqual(changeOwnershipErrors(index), [
    "element-2 assigns src/run.js old line 1, which is not a changed patch row.",
  ]);
});

test("the CLI validates saved enriched patches", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enriched-patch-validation-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const indexPath = path.join(directory, "run.enriched-patch.json");
  const index = generateEnrichedPatch(patch);
  await writeFile(indexPath, JSON.stringify(index));
  assert.equal(spawnSync(process.execPath, [validatorPath, indexPath], { encoding: "utf8" }).status, 0);

  index.elements["element-2"].changes = [];
  await writeFile(indexPath, JSON.stringify(index));
  const invalid = spawnSync(process.execPath, [validatorPath, indexPath], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /old line 2 is not assigned/);
});
