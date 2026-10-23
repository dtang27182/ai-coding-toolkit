import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "enrich-diff/scripts/validate-impl-dataflow.mjs");

async function runValidator(t, dataflow, ...argumentsList) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "enrich-impl-dataflow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "feature.cr.impl-dataflow.json");
  await writeFile(inputPath, JSON.stringify(dataflow));
  return spawnSync(process.execPath, [validatorPath, ...argumentsList, inputPath], { encoding: "utf8" });
}

function codeReview() {
  return {
    schemaVersion: 18,
    stage: "code-review",
    diffHunks: [{ id: "change", file: "src/Controller.ts", patch: "@@ -1 +1 @@\n-old implementation\n+new implementation" }],
    containers: [
      { id: "controller", name: "Controller", type: "class", sourceFile: "src/Controller.ts", diffHunkIds: ["change"] },
      { id: "repository", name: "Repository", type: "class", sourceFile: "src/Repository.ts" },
    ],
    nodes: [
      { id: "inspect", name: "inspect", type: "function", containerId: "controller", sourceFile: "src/Controller.ts", changeType: "modified", changeSummary: "Modify inspect.", initialization: false, diffHunkIds: ["change"] },
      { id: "result", name: "result", type: "state-variable", containerId: "controller", sourceFile: "src/Controller.ts", changeType: "added", changeSummary: "Add result.", initialization: false, diffHunkIds: ["change"] },
      { id: "read", name: "read", type: "function", containerId: "repository", sourceFile: "src/Repository.ts", changeType: "unchanged", changeSummary: "N/A", initialization: false },
      { id: "panel", name: "Panel", type: "ui-component", location: "Panel", changeType: "modified", changeSummary: "Modify Panel.", initialization: false, diffHunkIds: ["change"] },
      { id: "rules", name: "Rules", type: "static-data", containerId: "controller", sourceFile: "src/Controller.ts", changeType: "modified", changeSummary: "Modify Rules.", initialization: false, diffHunkIds: ["change"] },
    ],
    relationships: [
      {
        from: { nodeId: "panel", type: "ui-component" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
        changeType: "modified", diffHunkIds: ["change"], dataDescription: "Request", purpose: "Requests results.",
      },
      {
        from: { nodeId: "rules", type: "static-data" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
        changeType: "added", diffHunkIds: ["change"], dataDescription: "Rules", purpose: "Interprets the results.",
      },
      {
        from: { nodeId: "read", type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
        transferType: "return",
        changeType: "unchanged", dataDescription: "Source data", purpose: "Supplies the requested data.",
      },
      {
        from: { nodeId: "inspect", type: "function" }, to: { nodeId: "result", type: "state-variable" }, type: "dataflow",
        changeType: "added", diffHunkIds: ["change"], dataDescription: "Processed result", purpose: "Retains the result.",
      },
      {
        from: { nodeId: "inspect", type: "function" }, to: { nodeId: "panel", type: "ui-component" }, type: "dataflow",
        changeType: "modified", diffHunkIds: ["change"], dataDescription: "Result", purpose: "Displays results.",
      },
      { from: { containerId: "controller", type: "class" }, to: { containerId: "repository", type: "class" }, type: "composition", changeType: "added", diffHunkIds: ["change"] },
    ],
  };
}

test("validates flat implementation entities and direct transfers sharing diff hunks", async (t) => {
  const result = await runValidator(t, codeReview());
  assert.equal(result.status, 0, result.stderr);
});

test("represents module-owned functions, state, and static data without requiring a class", async (t) => {
  const value = codeReview();
  value.containers = [{ id: "operations", name: "src/operations", type: "module", sourceFile: "src/operations.ts" }];
  value.nodes = value.nodes.filter((node) => node.id !== "read");
  for (const node of value.nodes) {
    if (node.containerId !== undefined) {
      node.containerId = "operations";
    }
  }
  value.relationships = value.relationships.filter((relationship) => relationship.type === "dataflow" && relationship.from.nodeId !== "read");
  const result = await runValidator(t, value);
  assert.equal(result.status, 0, result.stderr);
});

test("free functions can read and update class state", async (t) => {
  const value = codeReview();
  value.containers.push({ id: "operations", name: "src/operations", type: "module", sourceFile: "src/operations.ts" });
  value.nodes.push({ id: "process", name: "process", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "modified", changeSummary: "Modify process.", initialization: false, diffHunkIds: ["change"] });
  value.relationships.push(
    { from: { nodeId: "result", type: "state-variable" }, to: { nodeId: "process", type: "function" }, type: "dataflow", changeType: "added", diffHunkIds: ["change"], dataDescription: "Current result", purpose: "Reads the result." },
    { from: { nodeId: "process", type: "function" }, to: { nodeId: "result", type: "state-variable" }, type: "dataflow", changeType: "added", diffHunkIds: ["change"], dataDescription: "Updated result", purpose: "Stores the processed result." },
  );
  const result = await runValidator(t, value);
  assert.equal(result.status, 0, result.stderr);
});

test("requires relevant hunks for every changed node subtype and relationship", async (t) => {
  for (const index of [0, 1, 3, 4]) {
    const value = codeReview();
    delete value.nodes[index].diffHunkIds;
    const result = await runValidator(t, value);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /required property 'diffHunkIds'/);
  }
  for (const index of [0, 5]) {
    const value = codeReview();
    delete value.relationships[index].diffHunkIds;
    const result = await runValidator(t, value);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /required property 'diffHunkIds'/);
  }
});

test("container evidence is optional and independent of owned-node change status", async (t) => {
  const optional = codeReview();
  delete optional.containers[0].diffHunkIds;
  assert.equal((await runValidator(t, optional)).status, 0);

  const containerOnly = codeReview();
  for (const entry of [...containerOnly.nodes, ...containerOnly.relationships]) {
    entry.changeType = "unchanged";
    delete entry.diffHunkIds;
  }
  const result = await runValidator(t, containerOnly);
  assert.equal(result.status, 0, result.stderr);
});

test("rejects unknown hunk references on containers, all node kinds, and relationships", async (t) => {
  const value = codeReview();
  const entries = [value.containers[0], value.nodes[0], value.nodes[1], value.nodes[3], value.nodes[4], value.relationships[0]];
  for (const [index, entry] of entries.entries()) {
    entry.diffHunkIds = [`missing-${index}`];
  }
  const result = await runValidator(t, value);
  assert.equal(result.status, 1);
  for (const index of entries.keys()) {
    assert.ok(result.stderr.includes(`Unknown diff hunk reference: missing-${index}`));
  }
});

test("rejects diff hunk references on unchanged nodes and relationships", async (t) => {
  for (const collection of ["nodes", "relationships"]) {
    const value = codeReview();
    value[collection][2].diffHunkIds = ["change"];
    const result = await runValidator(t, value);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`/${collection}/2/diffHunkIds`));
  }
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

test("diff-hunk references must be nonempty and unique", async (t) => {
  for (const diffHunkIds of [[], [""], ["change", "change"]]) {
    const value = codeReview();
    value.containers[0].diffHunkIds = diffHunkIds;
    assert.equal((await runValidator(t, value)).status, 1);
  }
});

test("keeps diff evidence out of high-level design artifacts", async (t) => {
  const value = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"), "utf8"));
  for (const collection of ["nodes", "containers", "relationships"]) {
    const input = structuredClone(value);
    input[collection][0].diffHunkIds = ["change"];
    const result = await runValidator(t, input);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`/${collection}/0/diffHunkIds`));
  }
  value.diffHunks = [];
  assert.equal((await runValidator(t, value)).status, 1);
});

test("evaluated validation applies only to high-level designs", async (t) => {
  const result = await runValidator(t, codeReview(), "--evaluated");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--evaluated applies only to high-level-design/);
});
