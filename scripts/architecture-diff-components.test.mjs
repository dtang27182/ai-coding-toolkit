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
    input.relationships.push({ from: { component: "Change Panel" }, to: { component: "Source Files on Disk" }, type: "dataflow", changeType: "added" });
    input.relationships.at(-1)[endpoint] = { component: "Missing endpoint" };
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unknown relationship component: Missing endpoint/);
  }
});

test("accepts every dataflow pairing of UI components, methods, and I/O components", async (t) => {
  const input = JSON.parse(await readFile(examplePath, "utf8"));
  input.relationships = [];
  const endpoints = [
    { component: "Change Panel" },
    { class: "ChangeService", method: "buildChangeSet" },
    { component: "Source Files on Disk" },
  ];
  for (const from of endpoints) {
    for (const to of endpoints) {
      input.relationships.push({ from, to, type: "dataflow", changeType: "added" });
    }
  }
  const result = await runScript(t, input);
  assert.equal(result.status, 0, result.stderr);
});

test("accepts state updates to the method's own class or another class", async (t) => {
  const input = JSON.parse(await readFile(examplePath, "utf8"));
  input.relationships = ["ChangeService", "ChangeModel"].map((name) => ({
    from: { class: "ChangeService", method: "buildChangeSet" },
    to: { class: name },
    type: "state-update",
    changeType: "added",
    label: "changes: store computed changes",
  }));
  const result = await runScript(t, input);
  assert.equal(result.status, 0, result.stderr);
});

test("enforces endpoint kinds for dataflows and state updates", async (t) => {
  const method = { class: "ChangeService", method: "buildChangeSet" };
  const classEndpoint = { class: "ChangeModel" };
  const ui = { component: "Change Panel" };
  const io = { component: "Source Files on Disk" };
  for (const [type, from, to] of [
    ["dataflow", classEndpoint, method],
    ["dataflow", method, classEndpoint],
    ["state-update", ui, classEndpoint],
    ["state-update", io, classEndpoint],
    ["state-update", classEndpoint, classEndpoint],
    ["state-update", method, ui],
    ["state-update", method, io],
    ["state-update", method, method],
    ["dataflow", { ...method, component: "Change Panel" }, ui],
  ]) {
    const input = JSON.parse(await readFile(examplePath, "utf8"));
    input.relationships = [{ from, to, type, changeType: "added", label: "changes" }];
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0, JSON.stringify(input.relationships));
    assert.match(result.stderr, /\/relationships\/0/);
  }
});

test("requires state updates to describe the instance variable update", async (t) => {
  const input = JSON.parse(await readFile(examplePath, "utf8"));
  input.relationships = input.relationships.filter((relationship) => relationship.type === "state-update");
  delete input.relationships[0].label;
  const result = await runScript(t, input);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required property 'label'/);
});

test("resolves methods within their explicit class and keeps class and component references distinct", async (t) => {
  for (const [from, error] of [
    [{ class: "ChangeModel", method: "buildChangeSet" }, /Unknown relationship method in ChangeModel/],
    [{ class: "Missing class", method: "buildChangeSet" }, /Unknown relationship class: Missing class/],
    [{ class: "Change Panel", method: "buildChangeSet" }, /Unknown relationship class: Change Panel/],
    [{ component: "ChangeService" }, /Unknown relationship component: ChangeService/],
  ]) {
    const input = JSON.parse(await readFile(examplePath, "utf8"));
    input.relationships = [{ from, to: { component: "Change Panel" }, type: "dataflow", changeType: "added" }];
    const result = await runScript(t, input);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
});
