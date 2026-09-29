import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "enrich-diff/scripts/validate-impl-dataflow.mjs");

async function runValidator(t, dataflow) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enrich-impl-dataflow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "feature.cr.impl-dataflow.json");
  await writeFile(inputPath, JSON.stringify(dataflow));
  return spawnSync(process.execPath, [validatorPath, inputPath], { encoding: "utf8" });
}

function codeReview() {
  return {
    schemaVersion: 13,
    stage: "code-review",
    userFlows: [{ name: "Inspect results", steps: [{ id: 1, text: "Request results." }, { id: 2, text: "Display results." }] }],
    diffHunks: [{ id: "change", file: "src/Controller.ts", patch: "@@ -1 +1 @@\n-old implementation\n+new implementation" }],
    classes: [
      {
        name: "Controller", changeType: "modified", diffHunkIds: ["change"],
        methods: [{ name: "inspect", changeType: "modified", userFlow: true, diffHunkIds: ["change"] }],
        stateVariables: [{ name: "result", changeType: "added", userFlow: true, diffHunkIds: ["change"] }],
      },
      {
        name: "Repository", changeType: "unchanged",
        methods: [{ name: "read", changeType: "unchanged", userFlow: true }], stateVariables: [],
      },
    ],
    components: [{ name: "Panel", description: "Displays results.", type: "ui-component", changeType: "modified", userFlow: true, diffHunkIds: ["change"] }],
    staticData: [{ name: "Rules", changeType: "modified", userFlow: true, diffHunkIds: ["change"] }],
    relationships: [
      {
        from: { component: "Panel" }, to: { class: "Controller", method: "inspect" }, type: "dataflow",
        changeType: "modified", userFlow: true, diffHunkIds: ["change"], dataDescription: "Request", purpose: "Starts step 1.",
      },
      {
        from: { staticData: "Rules" }, to: { class: "Controller", method: "inspect" }, type: "dataflow",
        changeType: "added", userFlow: true, diffHunkIds: ["change"], dataDescription: "Rules", purpose: "Interprets the results.",
      },
      {
        from: { class: "Repository", method: "read" }, to: { class: "Controller", method: "inspect" }, type: "dataflow",
        changeType: "unchanged", userFlow: true, dataDescription: "Source data", purpose: "Supplies the requested data.",
      },
      {
        from: { class: "Controller", method: "inspect" }, to: { class: "Controller", stateVariable: "result" }, type: "state-update",
        changeType: "added", userFlow: true, diffHunkIds: ["change"], dataDescription: "Processed result", purpose: "Retains the result.",
      },
      {
        from: { class: "Controller", method: "inspect" }, to: { component: "Panel" }, type: "dataflow",
        changeType: "modified", userFlow: true, diffHunkIds: ["change"], dataDescription: "Result", purpose: "Completes step 2.",
      },
      { from: { class: "Controller" }, to: { class: "Repository" }, type: "composition", changeType: "added", diffHunkIds: ["change"] },
    ],
  };
}

test("validates implementation entities and direct transfers sharing diff hunks", async (t) => {
  const result = await runValidator(t, codeReview());
  assert.equal(result.status, 0, result.stderr);
});

test("requires relevant hunks for changed implementation entries", async (t) => {
  const value = codeReview();
  delete value.classes[0].methods[0].diffHunkIds;
  delete value.classes[0].stateVariables[0].diffHunkIds;
  delete value.relationships[0].diffHunkIds;
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Changed entry requires relevant diff hunks: inspect/);
  assert.match(result.stderr, /Changed entry requires relevant diff hunks: result/);
  assert.match(result.stderr, /Changed entry requires relevant diff hunks: dataflow/);
});

test("rejects unknown references on classes, methods, state, components, static data, and relationships", async (t) => {
  const value = codeReview();
  const entries = [value.classes[0], value.classes[0].methods[0], value.classes[0].stateVariables[0], value.components[0], value.staticData[0], value.relationships[0]];
  for (const [index, entry] of entries.entries()) entry.diffHunkIds = [`missing-${index}`];
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  for (const index of entries.keys()) assert.ok(result.stderr.includes(`Unknown diff hunk reference: missing-${index}`));
});

test("rejects diff hunk references on unchanged entries", async (t) => {
  const value = codeReview();
  value.classes[1].methods[0].diffHunkIds = ["change"];
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unchanged entry must not reference diff hunks: read/);
});

test("rejects duplicate and unreferenced hunks", async (t) => {
  const value = codeReview();
  value.diffHunks.push({ ...value.diffHunks[0] }, { ...value.diffHunks[0], id: "unused" });
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Diff hunk IDs must be unique: change/);
  assert.match(result.stderr, /Diff hunk must be referenced: unused/);
});

test("requires a code-review hunk inventory and valid unified diff text", async (t) => {
  const value = codeReview();
  delete value.diffHunks;
  assert.equal((await runValidator(t, value)).status, 1);
  const malformed = codeReview();
  malformed.diffHunks[0].patch = "description instead of a diff";
  assert.equal((await runValidator(t, malformed)).status, 1);
});

test("rejects unresolved implementation endpoints", async (t) => {
  const value = codeReview();
  value.relationships[0].to.method = "missing";
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown relationship method in Controller: missing/);
});

test("keeps diff evidence out of high-level design artifacts", async (t) => {
  const value = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"), "utf8"));
  value.classes[0].methods[0].diffHunkIds = ["change"];
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /High-level-design entries must not reference diff hunks/);
  delete value.classes[0].methods[0].diffHunkIds;
  value.diffHunks = [];
  assert.equal((await runValidator(t, value)).status, 1);
});
