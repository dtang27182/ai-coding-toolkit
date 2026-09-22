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

test("validates a System Dataflow artifact", () => {
  const result = spawnSync(process.execPath, [validatorPath, examplePath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects an illegal node direction", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "annotate-diff-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataflow = JSON.parse(await readFile(examplePath, "utf8"));
  dataflow.relationships[0].from = "Delivery options display";
  const inputPath = path.join(directory, "system-dataflow.json");
  await writeFile(inputPath, JSON.stringify(dataflow));

  const result = spawnSync(process.execPath, [validatorPath, inputPath], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot leave user-output node/);
});
