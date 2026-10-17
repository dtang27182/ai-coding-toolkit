import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { mergeClassDataflows } from "../common/impl-dataflow/visualizer/src/types.ts";
import { semanticError } from "../common/impl-dataflow/visualizer/src/validation.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "common/impl-dataflow/validate-impl-dataflow.mjs");

function highLevelDesign() {
  return {
    schemaVersion: 14,
    stage: "high-level-design",
    containers: [{ id: "service", name: "Service", type: "class" }, { id: "operations", name: "operations", type: "module" }],
    nodes: [
      { id: "inspect", name: "inspect", type: "function", containerId: "service", changeType: "unchanged" },
      { id: "value", name: "value", type: "state-variable", containerId: "operations", changeType: "unchanged" },
      { id: "rules", name: "Rules", type: "static-data", containerId: "service", changeType: "unchanged" },
    ],
    relationships: [],
  };
}

async function runValidator(t, input, ...argumentsList) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "feature-design validation "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "input.impl-dataflow.json");
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  return spawnSync(process.execPath, [validatorPath, ...argumentsList, inputPath], { encoding: "utf8" });
}

test("high-level designs use flat owned nodes without exposure inventories", async (t) => {
  const result = await runValidator(t, highLevelDesign());
  assert.equal(result.status, 0, result.stderr);

  for (const field of ["variableExposure", "changeType"]) {
    const input = highLevelDesign();
    input.containers[0][field] = field === "variableExposure" ? [] : "unchanged";
    assert.equal((await runValidator(t, input)).status, 1);
  }
});

test("high-level-design validation accepts the implementation example", async (t) => {
  const input = JSON.parse(await readFile(
    path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"),
    "utf8"
  ));
  const result = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);
});

test("container-free graphs are valid but functions still require an existing owner", async (t) => {
  for (const stage of ["high-level-design", "code-review"]) {
    const input = { schemaVersion: 14, stage, containers: [], nodes: [], relationships: [] };
    if (stage === "code-review") {
      input.diffHunks = [];
    }
    assert.equal((await runValidator(t, input)).status, 0);

    input.nodes.push(
      { id: "panel", name: "Panel", type: "ui-component", description: "Displays results", changeType: "unchanged" },
      { id: "rules", name: "Rules", type: "static-data", changeType: "unchanged" },
    );
    assert.equal((await runValidator(t, input)).status, 0);

    input.nodes.push({ id: "inspect", name: "inspect", type: "function", changeType: "unchanged" });
    const missingOwner = await runValidator(t, input);
    assert.equal(missingOwner.status, 1);
    assert.match(missingOwner.stderr, /required property 'containerId'/);

    input.nodes[2].containerId = "missing";
    const unknownOwner = await runValidator(t, input);
    assert.equal(unknownOwner.status, 1);
    assert.match(unknownOwner.stderr, /Unknown container for node inspect: missing/);
  }
});

test("classes and modules can own state, functions, and optionally static data", async (t) => {
  const input = highLevelDesign();
  input.nodes.push(
    { id: "module-inspect", name: "inspect", type: "function", containerId: "operations", changeType: "added" },
    { id: "class-value", name: "value", type: "state-variable", containerId: "service", changeType: "modified" },
    { id: "module-rules", name: "Rules", type: "static-data", containerId: "operations", changeType: "unchanged" },
    { id: "unowned-rules", name: "Rules", type: "static-data", changeType: "unchanged" },
    { id: "same-name", name: "inspect", type: "state-variable", containerId: "service", changeType: "unchanged" },
  );
  input.relationships.push({
    from: { nodeId: "value", type: "state-variable" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
    changeType: "added", dataDescription: "Current value", purpose: "Inspect module state",
  }, {
    from: { nodeId: "module-inspect", type: "function" }, to: { nodeId: "class-value", type: "state-variable" }, type: "dataflow",
    changeType: "added", dataDescription: "Updated value", purpose: "Update class state",
  });
  const result = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);
});

test("boundary nodes require descriptions and cannot have container owners", async (t) => {
  for (const type of ["ui-component", "system-input", "system-output", "external-dependency"]) {
    const input = highLevelDesign();
    input.nodes.push({ id: "boundary", name: "Boundary", type, description: "System boundary", changeType: "unchanged" });
    assert.equal((await runValidator(t, input)).status, 0);

    const missingDescription = structuredClone(input);
    delete missingDescription.nodes[3].description;
    assert.equal((await runValidator(t, missingDescription)).status, 1);

    input.nodes[3].containerId = "service";
    assert.equal((await runValidator(t, input)).status, 1);
  }
});

test("entity IDs must be unique across nodes and containers", async (t) => {
  for (const [collection, id] of [["nodes", "value"], ["nodes", "service"], ["containers", "operations"]]) {
    const input = highLevelDesign();
    input[collection][0].id = id;
    const result = await runValidator(t, input);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Duplicate entity ID/);
  }
});

test("name uniqueness follows owner and subtype rather than entity IDs", async (t) => {
  const duplicateContainer = highLevelDesign();
  duplicateContainer.containers[1].name = "Service";
  assert.match((await runValidator(t, duplicateContainer)).stderr, /Duplicate container name: Service/);

  const duplicateOwned = highLevelDesign();
  duplicateOwned.nodes.push({ ...duplicateOwned.nodes[0], id: "other-inspect" });
  assert.match((await runValidator(t, duplicateOwned)).stderr, /Duplicate function name in container service: inspect/);

  const duplicateStatic = highLevelDesign();
  duplicateStatic.nodes.push({ ...duplicateStatic.nodes[2], id: "other-rules" });
  assert.match((await runValidator(t, duplicateStatic)).stderr, /Duplicate static-data name in container service: Rules/);

  const duplicateUnowned = highLevelDesign();
  delete duplicateUnowned.nodes[2].containerId;
  duplicateUnowned.nodes.push({ id: "external-rules", name: "Rules", type: "external-dependency", description: "External rules", changeType: "unchanged" });
  assert.match((await runValidator(t, duplicateUnowned)).stderr, /Duplicate unowned node name: Rules/);

  const sharedContainerName = highLevelDesign();
  sharedContainerName.nodes.push({ id: "boundary", name: "Service", type: "ui-component", description: "Service panel", changeType: "unchanged" });
  assert.equal((await runValidator(t, sharedContainerName)).status, 0);
});

test("membership requires an explicit existing container ID", async (t) => {
  for (const index of [0, 1, 2]) {
    for (const containerId of ["missing", "inspect"]) {
      const input = highLevelDesign();
      input.nodes[index].containerId = containerId;
      assert.match((await runValidator(t, input)).stderr, /Unknown container for node/);
    }
  }
  for (const index of [0, 1]) {
    const input = highLevelDesign();
    delete input.nodes[index].containerId;
    assert.equal((await runValidator(t, input)).status, 1);
  }
  const unownedStaticData = highLevelDesign();
  delete unownedStaticData.nodes[2].containerId;
  assert.equal((await runValidator(t, unownedStaticData)).status, 0);
});

test("dataflow endpoints resolve exact node IDs and verify their declared types", async (t) => {
  for (const nodeId of ["missing", "service"]) {
    const input = highLevelDesign();
    input.relationships.push({
      from: { nodeId, type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
      changeType: "unchanged", dataDescription: "Value", purpose: "Inspect value",
    });
    assert.match((await runValidator(t, input)).stderr, /Unknown relationship node/);
  }
  const mismatched = highLevelDesign();
  mismatched.relationships.push({
    from: { nodeId: "rules", type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
    changeType: "unchanged", dataDescription: "Rules", purpose: "Inspect rules",
  });
  assert.match((await runValidator(t, mismatched)).stderr, /Relationship node type does not match rules/);
});

test("class composition is separate from membership and excludes module endpoints", async (t) => {
  const input = highLevelDesign();
  input.containers.push({ id: "model", name: "Model", type: "class" });
  input.relationships.push({ from: { containerId: "service", type: "class" }, to: { containerId: "model", type: "class" }, type: "composition", changeType: "added" });
  assert.equal((await runValidator(t, input)).status, 0);

  for (const containerId of ["missing", "inspect"]) {
    const missing = structuredClone(input);
    missing.relationships[0].to.containerId = containerId;
    assert.match((await runValidator(t, missing)).stderr, /Unknown relationship container/);
  }
  const moduleEndpoint = structuredClone(input);
  moduleEndpoint.relationships[0].to.containerId = "operations";
  assert.match((await runValidator(t, moduleEndpoint)).stderr, /Relationship container type does not match operations/);
  moduleEndpoint.relationships[0].to.type = "module";
  assert.equal((await runValidator(t, moduleEndpoint)).status, 1);

  const nodeEndpoint = structuredClone(input);
  nodeEndpoint.relationships[0].to = { nodeId: "inspect", type: "function" };
  assert.equal((await runValidator(t, nodeEndpoint)).status, 1);
  for (const field of ["dataDescription", "purpose"]) {
    const metadata = structuredClone(input);
    metadata.relationships[0][field] = "Not applicable";
    assert.equal((await runValidator(t, metadata)).status, 1);
  }
});

test("schema enforces all node-type connection combinations", async () => {
  const schema = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(schema);
  const permittedTargets = {
    function: ["function", "ui-component", "system-output", "external-dependency", "state-variable"],
    "ui-component": ["function", "ui-component", "system-output", "external-dependency"],
    "system-input": ["function", "ui-component", "system-output", "external-dependency"],
    "system-output": [],
    "external-dependency": ["function", "ui-component", "system-output", "external-dependency"],
    "static-data": ["function"],
    "state-variable": ["function"],
  };
  for (const [from, targets] of Object.entries(permittedTargets)) {
    for (const to of Object.keys(permittedTargets)) {
      const input = highLevelDesign();
      input.nodes = Object.keys(permittedTargets).map((type) => {
        const node = { id: type, name: type, type, description: type, changeType: "unchanged" };
        if (type === "function" || type === "state-variable") {
          node.containerId = "service";
        }
        return node;
      });
      input.relationships = [{
        from: { nodeId: from, type: from }, to: { nodeId: to, type: to }, type: "dataflow",
        changeType: "unchanged", dataDescription: "Value", purpose: "Transfer value",
      }];
      assert.equal(validate(input), targets.includes(to), `${from} -> ${to}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test("evaluated designs require accurate derived metrics without exposure inventories", async (t) => {
  const input = highLevelDesign();
  const pending = await runValidator(t, input, "--evaluated");
  assert.equal(pending.status, 1);
  assert.match(pending.stderr, /requires non-null changedClassCount/);

  Object.assign(input, { changedClassCount: 0, changedFunctionCount: 0, changedComponentCount: 0, changedDataflowRelationshipCount: 0 });
  assert.equal((await runValidator(t, input, "--evaluated")).status, 0);

  input.nodes[2].changeType = "modified";
  assert.match((await runValidator(t, input)).stderr, /changedClassCount must equal the derived count: 1/);
  input.changedClassCount = 1;
  input.nodes[1].changeType = "added";
  assert.equal((await runValidator(t, input, "--evaluated")).status, 0);

  input.nodes[0].changeType = "deleted";
  assert.match((await runValidator(t, input)).stderr, /changedFunctionCount must equal the derived count: 1/);
  input.changedFunctionCount = 1;
  assert.equal((await runValidator(t, input, "--evaluated")).status, 0);
});

test("changed relationships do not independently mark containers changed", async (t) => {
  const input = highLevelDesign();
  input.relationships.push({
    from: { nodeId: "rules", type: "static-data" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
    changeType: "added", dataDescription: "Rules", purpose: "Inspect rules",
  });
  input.containers.push({ id: "model", name: "Model", type: "class" });
  input.relationships.push({ from: { containerId: "service", type: "class" }, to: { containerId: "model", type: "class" }, type: "composition", changeType: "added" });
  input.nodes.push({ id: "panel", name: "Panel", type: "ui-component", description: "Shows inspection results", changeType: "modified" });
  Object.assign(input, { changedClassCount: 0, changedFunctionCount: 0, changedComponentCount: 1, changedDataflowRelationshipCount: 1 });
  const result = await runValidator(t, input, "--evaluated");
  assert.equal(result.status, 0, result.stderr);

  input.changedComponentCount = 0;
  assert.match((await runValidator(t, input)).stderr, /changedComponentCount must equal the derived count: 1/);
});

// The visualizer remains on version 13 until its separate migration.
function legacyCodeReview() {
  return {
    schemaVersion: 13,
    stage: "code-review",
    diffHunks: [],
    classes: [{ name: "Service", changeType: "unchanged", functions: [{ name: "inspect", changeType: "unchanged" }], stateVariables: [] }],
    components: [],
    staticData: [],
    relationships: [],
  };
}

test("code-review graphs filter without variable exposure inventories", () => {
  const graph = filterGraph(legacyCodeReview(), true);
  assert.equal(graph.classes.length, 1);
  assert.equal(graph.classes[0].variableExposure, null);
});

test("legacy visualizer keeps static data, shared readers, and state accesses", () => {
  const input = legacyCodeReview();
  input.classes[0].functions.push({ name: "preview", changeType: "unchanged" });
  input.classes[0].stateVariables.push({ name: "value", changeType: "unchanged" });
  input.staticData.push({ name: "Lookup Rules", changeType: "unchanged" });
  for (const functionName of ["inspect", "preview"]) {
    input.relationships.push({ from: { staticData: "Lookup Rules" }, to: { class: "Service", function: functionName }, type: "dataflow", changeType: "added", dataDescription: "Rules", purpose: "Guide inspection" });
  }
  input.relationships.push({ from: { class: "Service", stateVariable: "value" }, to: { class: "Service", function: "preview" }, type: "dataflow", changeType: "added", dataDescription: "Value", purpose: "Preview value" });
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true);
  assert.equal(graph.staticData.length, 1);
  assert.equal(graph.relationships.filter((entry) => entry.from.staticData).length, 2);
  assert.ok(graph.relationships.some((entry) => entry.from.stateVariableName === "value"));
  assert.equal(mergeClassDataflows(graph.relationships)[0].from.staticData, true);
  assert.equal(filterGraph(input, false).relationships.length, 0);
  const layout = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 80, () => 100, new Set());
  assert.ok(layout.boxes.get("Lookup Rules").y < layout.boxes.get("Service").y);
});

test("legacy visualizer retains module grouping and component direction checks", () => {
  const input = legacyCodeReview();
  input.classes = [];
  input.modules = [{ name: "operations", changeType: "modified", functions: [{ name: "read", changeType: "modified" }] }];
  input.components.push({ name: "Output", description: "Final result", type: "system-output", changeType: "unchanged" });
  input.relationships.push({ from: { module: "operations", function: "read" }, to: { component: "Output" }, type: "dataflow", changeType: "modified", dataDescription: "Result", purpose: "Publish result" });
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true);
  assert.equal(graph.classes[0].containerType, "module");
  assert.deepEqual(graph.classes[0].functions.map((entry) => entry.name), ["read"]);
  [input.relationships[0].from, input.relationships[0].to] = [input.relationships[0].to, input.relationships[0].from];
  assert.match(semanticError(input), /System-output component cannot send data/);
  input.components[0].type = "system-input";
  [input.relationships[0].from, input.relationships[0].to] = [input.relationships[0].to, input.relationships[0].from];
  assert.match(semanticError(input), /System-input component cannot receive data/);
});
