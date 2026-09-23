import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "annotate-diff", "scripts", "validate-system-dataflow.mjs");
const examplePath = path.join(toolkitDirectory, "common", "system-dataflow", "system-dataflow.example.json");

async function runValidator(t, dataflow) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "annotate-diff-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "system-dataflow.json");
  await writeFile(inputPath, JSON.stringify(dataflow));
  return spawnSync(process.execPath, [validatorPath, inputPath], { encoding: "utf8" });
}

async function codeReviewDataflow() {
  const dataflow = JSON.parse(await readFile(examplePath, "utf8"));
  dataflow.stage = "code-review";
  dataflow.diffHunks = [{
    id: "hunk-1",
    file: "src/delivery-options.ts",
    patch: "@@ -1 +1 @@\n-old value\n+new value",
  }];
  dataflow.nodes[0].diffHunkIds = ["hunk-1"];
  dataflow.relationships[0].diffHunkIds = ["hunk-1"];
  return dataflow;
}

test("validates a System Dataflow artifact", () => {
  const result = spawnSync(process.execPath, [validatorPath, examplePath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects an illegal node direction", async (t) => {
  const dataflow = JSON.parse(await readFile(examplePath, "utf8"));
  dataflow.relationships[0].from = "Delivery options display";
  const result = await runValidator(t, dataflow);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot leave user-output node/);
});

test("validates a shared diff hunk reference", async (t) => {
  const result = await runValidator(t, await codeReviewDataflow());
  assert.equal(result.status, 0, result.stderr);
});

test("rejects an unknown diff hunk reference", async (t) => {
  const dataflow = await codeReviewDataflow();
  dataflow.nodes[0].diffHunkIds = ["hunk-missing"];
  const result = await runValidator(t, dataflow);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown diff hunk reference: hunk-missing/);
});

test("rejects an unused diff hunk", async (t) => {
  const dataflow = await codeReviewDataflow();
  dataflow.diffHunks.push({
    id: "hunk-2",
    file: "src/unused.ts",
    patch: "@@ -1 +1 @@\n-old value\n+new value",
  });
  const result = await runValidator(t, dataflow);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Diff hunk must be referenced: hunk-2/);
});

test("rejects duplicate diff hunk IDs", async (t) => {
  const dataflow = await codeReviewDataflow();
  dataflow.diffHunks.push({
    id: "hunk-1",
    file: "src/duplicate.ts",
    patch: "@@ -1 +1 @@\n-old value\n+new value",
  });
  const result = await runValidator(t, dataflow);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Diff hunk IDs must be unique: hunk-1/);
});

test("rejects diff hunks from a high-level-design artifact", async (t) => {
  const dataflow = JSON.parse(await readFile(examplePath, "utf8"));
  dataflow.diffHunks = [];
  const result = await runValidator(t, dataflow);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must NOT be valid/);
});
