import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { mergeClassDataflows } from "../common/impl-dataflow/visualizer/src/types.ts";
import { semanticError } from "../common/impl-dataflow/visualizer/src/validation.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "common/impl-dataflow/validate-impl-dataflow.mjs");

function codeReview() {
  return {
    schemaVersion: 13,
    stage: "code-review",
    diffHunks: [],
    classes: [{
      name: "Service",
      changeType: "unchanged",
      functions: [{ name: "inspect", changeType: "unchanged" }],
      stateVariables: [],
    }],
    components: [],
    staticData: [],
    relationships: [],
  };
}

test("code-review graphs filter without variable exposure inventories", () => {
  const graph = filterGraph(codeReview(), true);
  assert.equal(graph.classes.length, 1);
  assert.equal(graph.classes[0].variableExposure, null);
});

async function runValidator(t, input, ...argumentsList) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "feature-design validation "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "input.impl-dataflow.json");
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  return {
    inputPath,
    result: spawnSync(process.execPath, [validatorPath, ...argumentsList, inputPath], { encoding: "utf8" }),
  };
}

test("code-review implementation dataflows omit HLD-only fields", async (t) => {
  const input = codeReview();
  const { result } = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);

  const graph = filterGraph(input, true);
  assert.equal(graph.classes[0].variableExposure, null);
});

test("high-level-design validation requires HLD fields", async (t) => {
  const input = codeReview();
  input.stage = "high-level-design";
  delete input.diffHunks;
  input.classes[0].stateVariables.push({ name: "value", changeType: "unchanged" });
  input.components.push({ name: "Panel", description: "Displays the inspection result.", type: "ui-component", changeType: "unchanged" });
  input.relationships.push({
    from: { component: "Panel" },
    to: { class: "Service", function: "inspect" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "request",
    purpose: "Inspect the service",
  });

  const { result } = await runValidator(t, input);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires variableExposure/);
});

test("high-level-design validation accepts the implementation example", async (t) => {
  const input = JSON.parse(await readFile(
    path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"),
    "utf8"
  ));
  const { result } = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);
});

test("generic validation rejects invalid architecture references and changes", async (t) => {
  const duplicate = codeReview();
  duplicate.components.push({ name: "Service", description: "Supplies external data.", type: "external-dependency", changeType: "unchanged" });
  const duplicateResult = await runValidator(t, duplicate);
  assert.equal(duplicateResult.result.status, 1);
  assert.match(duplicateResult.result.stderr, /Duplicate component name/);

  const unknownEndpoint = codeReview();
  unknownEndpoint.relationships.push({
    from: { class: "Service", function: "inspect" },
    to: { component: "Missing" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "result",
    purpose: "Return the inspection result",
  });
  const endpointResult = await runValidator(t, unknownEndpoint);
  assert.equal(endpointResult.result.status, 1);
  assert.match(endpointResult.result.stderr, /Unknown relationship component/);

  const changedMember = codeReview();
  changedMember.classes[0].functions[0].changeType = "modified";
  const memberResult = await runValidator(t, changedMember);
  assert.equal(memberResult.result.status, 1);

  const invalidStateAccess = codeReview();
  invalidStateAccess.classes[0].stateVariables.push({ name: "value", changeType: "unchanged" });
  invalidStateAccess.relationships.push({
    from: { class: "Service", stateVariable: "value" },
    to: { class: "Service", stateVariable: "value" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "value",
    purpose: "Read the value",
  });
  const stateAccessResult = await runValidator(t, invalidStateAccess);
  assert.equal(stateAccessResult.result.status, 1);
});

test("component roles enforce system input and output directions", async (t) => {
  const input = codeReview();
  input.components.push(
    { name: "Panel", description: "Receives input and displays results.", type: "ui-component", changeType: "unchanged" },
    { name: "Incoming Event", description: "Supplies the incoming request.", type: "system-input", changeType: "unchanged" },
    { name: "Outgoing Event", description: "Receives the final result.", type: "system-output", changeType: "unchanged" },
    { name: "Remote Service", description: "Processes remote requests and returns responses.", type: "external-dependency", changeType: "unchanged" },
  );
  for (const name of ["Panel", "Incoming Event", "Remote Service"]) {
    input.relationships.push({
      from: { component: name }, to: { class: "Service", function: "inspect" }, type: "dataflow",
      changeType: "unchanged", dataDescription: "input", purpose: "Inspect the input",
    });
  }
  for (const name of ["Panel", "Outgoing Event", "Remote Service"]) {
    input.relationships.push({
      from: { class: "Service", function: "inspect" }, to: { component: name }, type: "dataflow",
      changeType: "unchanged", dataDescription: "result", purpose: "Deliver the result",
    });
  }
  const valid = await runValidator(t, input);
  assert.equal(valid.result.status, 0, valid.result.stderr);
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true);
  assert.deepEqual(graph.components.map((component) => component.type), ["ui-component", "system-input", "system-output", "external-dependency"]);
  assert.equal(graph.relationships.length, 6);

  const oldType = structuredClone(input);
  oldType.components[0].type = "ui";
  assert.equal((await runValidator(t, oldType)).result.status, 1);

  const missingDescription = structuredClone(input);
  delete missingDescription.components[3].description;
  assert.equal((await runValidator(t, missingDescription)).result.status, 1);

  const outputAsSource = structuredClone(input);
  outputAsSource.relationships[0].from.component = "Outgoing Event";
  assert.match((await runValidator(t, outputAsSource)).result.stderr, /System-output component cannot send data/);
  assert.match(semanticError(outputAsSource), /System-output component cannot send data/);

  const inputAsTarget = structuredClone(input);
  inputAsTarget.relationships.at(-1).to.component = "Incoming Event";
  assert.match((await runValidator(t, inputAsTarget)).result.stderr, /System-input component cannot receive data/);
  assert.match(semanticError(inputAsTarget), /System-input component cannot receive data/);
});

test("static data is a read-only source for functions", async (t) => {
  const input = codeReview();
  input.diffHunks.push({ id: "hunk-1", file: "src/Service.ts", patch: "@@ -1 +1 @@\n-inspect()\n+inspect(rules)" });
  input.staticData.push({ name: "Lookup Rules", changeType: "unchanged" });
  input.relationships.push({
    from: { staticData: "Lookup Rules" },
    to: { class: "Service", function: "inspect" },
    type: "dataflow",
    changeType: "added",
    diffHunkIds: ["hunk-1"],
    dataDescription: "Fixed lookup rules",
    purpose: "Guide inspection",
  });
  const valid = await runValidator(t, input);
  assert.equal(valid.result.status, 0, valid.result.stderr);
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true);
  assert.equal(graph.staticData.length, 1);
  assert.ok(graph.nodes.some((node) => node.name === "Lookup Rules"));
  assert.equal(graph.relationships[0].from.staticData, true);
  assert.equal(mergeClassDataflows(graph.relationships)[0].from.staticData, true);
  assert.equal(filterGraph(input, false).relationships.length, 0);
  const layout = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 80, () => 100, new Set());
  assert.ok(layout.boxes.get("Lookup Rules").y < layout.boxes.get("Service").y);

  const reversed = structuredClone(input);
  [reversed.relationships[0].from, reversed.relationships[0].to] = [reversed.relationships[0].to, reversed.relationships[0].from];
  assert.equal((await runValidator(t, reversed)).result.status, 1);

  const componentTarget = structuredClone(input);
  componentTarget.components.push({ name: "File", description: "Stores external data.", type: "external-dependency", changeType: "unchanged" });
  componentTarget.relationships[0].to = { component: "File" };
  assert.equal((await runValidator(t, componentTarget)).result.status, 1);
});

test("static data names are validated", async (t) => {
  const input = codeReview();
  input.staticData.push({ name: "Lookup Rules", changeType: "unchanged" });
  input.relationships.push({
    from: { staticData: "Lookup Rules" },
    to: { class: "Service", function: "inspect" },
    type: "dataflow",
    changeType: "unchanged",
    dataDescription: "Fixed lookup rules",
    purpose: "Guide inspection",
  });
  const missing = structuredClone(input);
  missing.relationships[0].from.staticData = "Missing";
  assert.match((await runValidator(t, missing)).result.stderr, /Unknown relationship static data/);

  const duplicate = structuredClone(input);
  duplicate.staticData[0].name = "Service";
  assert.match((await runValidator(t, duplicate)).result.stderr, /Duplicate static data name/);
});

test("filtering keeps static data and its reader", async () => {
  const example = JSON.parse(await readFile(
    path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"),
    "utf8"
  ));
  const graph = filterGraph(example, true);
  assert.ok(graph.staticData.some((entry) => entry.name === "Diff Format Rules"));
  assert.ok(graph.relationships.some((relationship) => relationship.from.staticData && relationship.to.functionName === "buildChangeSet"));
});

test("functions share implementation state and static data", async (t) => {
  const input = JSON.parse(await readFile(
    path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"),
    "utf8"
  ));
  input.classes[0].functions.push({ name: "previewChanges", changeType: "added" });
  input.relationships.push({
    from: { staticData: "Diff Format Rules" },
    to: { class: "ChangeService", function: "previewChanges" },
    type: "dataflow",
    changeType: "added",
    dataDescription: "Fixed hunk formatting rules",
    purpose: "Format the preview.",
  }, {
    from: { class: "ChangeModel", stateVariable: "changes" },
    to: { class: "ChangeService", function: "previewChanges" },
    type: "dataflow",
    changeType: "added",
    dataDescription: "The retained change set",
    purpose: "Supply the preview input.",
  }, {
    from: { class: "ChangeService", function: "previewChanges" },
    to: { component: "Change Panel" },
    type: "dataflow",
    changeType: "added",
    dataDescription: "The formatted preview",
    purpose: "Display the preview.",
  });
  const { result } = await runValidator(t, input);
  assert.equal(result.status, 0, result.stderr);
  const graph = filterGraph(input, true);
  assert.equal(graph.staticData.filter((entry) => entry.name === "Diff Format Rules").length, 1);
  assert.equal(graph.relationships.filter((relationship) => relationship.from.staticData).length, 2);
  assert.ok(graph.relationships.some((relationship) => relationship.from.stateVariableName === "changes" && relationship.to.functionName === "previewChanges"));
  assert.ok(graph.components.some((component) => component.name === "Source Files on Disk"));
});

test("evaluated validation requires complete HLD metrics", async (t) => {
  const example = JSON.parse(await readFile(
    path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"),
    "utf8"
  ));
  const pending = await runValidator(t, example, "--evaluated");
  assert.equal(pending.result.status, 1);
  assert.match(pending.result.stderr, /requires non-null changedClassCount/);

  example.changedClassCount = 3;
  example.changedFunctionCount = 4;
  example.changedComponentCount = 1;
  example.changedDataflowRelationshipCount = 8;
  const evaluated = await runValidator(t, example, "--evaluated");
  assert.equal(evaluated.result.status, 0, evaluated.result.stderr);
});
