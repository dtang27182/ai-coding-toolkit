import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "hld-gen/scripts/validate-architecture-diff.mjs");
const counterPath = path.join(toolkitDirectory, "hld-gen/scripts/count-variable-exposure.mjs");
const examplePath = path.join(toolkitDirectory, "hld-gen/references/architecture-diff.example.json");

async function runScript(t, input, scriptPath = validatorPath) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "components-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "design.json");
  await writeFile(inputPath, JSON.stringify(input));
  return { ...spawnSync(process.execPath, [scriptPath, inputPath], { encoding: "utf8" }), inputPath };
}

test("accepts UI and external I/O flows and preserves them when counting exposure", async (t) => {
  const input = JSON.parse(await readFile(examplePath, "utf8"));
  const result = await runScript(t, input, counterPath);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(result.inputPath, "utf8")), input);
});

test("requires components but accepts an empty collection", async (t) => {
  const input = JSON.parse(await readFile(examplePath, "utf8"));
  input.components = [];
  input.relationships = [];
  const empty = await runScript(t, input);
  assert.equal(empty.status, 0, empty.stderr);
  delete input.components;
  const missing = await runScript(t, input);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /required property 'components'/);
});

test("rejects invalid component definitions", async (t) => {
  for (const component of [
    { name: "Panel", type: "unknown", changeType: "added" },
    { name: "Panel", changeType: "added" },
    { name: "Panel", type: "ui" },
    { name: "Panel", type: "ui", changeType: "unknown" },
    { name: "", type: "external-io", changeType: "unchanged" },
    { name: "Panel", type: "ui", changeType: "added", variableExposure: [] },
  ]) {
    const input = JSON.parse(await readFile(examplePath, "utf8"));
    input.components = [component];
    input.relationships = [];
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /\/components\/0/);
  }
});

test("rejects ambiguous names across components and classes", async (t) => {
  for (const name of ["ChangeService", "Change Panel"]) {
    const input = JSON.parse(await readFile(examplePath, "utf8"));
    input.components.push({ name, type: "external-io", changeType: "unchanged" });
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Duplicate class or component name/);
  }
});

test("rejects unknown source and target endpoints", async (t) => {
  for (const endpoint of ["from", "to"]) {
    const input = JSON.parse(await readFile(examplePath, "utf8"));
    input.relationships.push({ from: "Change Panel", to: "Source Files on Disk", type: "dataflow", changeType: "added" });
    input.relationships.at(-1)[endpoint] = "Missing endpoint";
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown relationship (source|target) class or component: Missing endpoint/);
  }
});
