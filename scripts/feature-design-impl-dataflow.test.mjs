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
import { edgeKey } from "../common/impl-dataflow/visualizer/src/types.ts";
import { dataflowEdges } from "../common/impl-dataflow/visualizer/src/edges.ts";
import { semanticError } from "../common/impl-dataflow/visualizer/src/validation.ts";

const toolkitDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(toolkitDirectory, "common/impl-dataflow/validate-impl-dataflow.mjs");

function highLevelDesign() {
  return {
    schemaVersion: 18,
    stage: "high-level-design",
    containers: [{ id: "service", name: "Service", type: "class", sourceFile: "src/Service.ts" }, { id: "operations", name: "operations", type: "module", sourceFile: "src/operations.ts" }],
    nodes: [
      { id: "inspect", name: "inspect", type: "function", containerId: "service", sourceFile: "src/Service.ts", changeType: "unchanged", initialization: false },
      { id: "value", name: "value", type: "state-variable", containerId: "operations", changeType: "unchanged", initialization: false },
      { id: "rules", name: "Rules", type: "static-data", containerId: "service", changeType: "unchanged", initialization: false },
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

test("functions and containers require repository-relative source files in both stages", async () => {
  const schema = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(schema);
  for (const stage of ["high-level-design", "code-review"]) {
    const input = highLevelDesign();
    input.stage = stage;
    input.nodes.push({ id: "module-inspect", name: "inspect", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "unchanged", initialization: false });
    if (stage === "code-review") input.diffHunks = [];
    assert.equal(validate(input), true, JSON.stringify(validate.errors));

    for (const node of [...input.nodes.filter((node) => node.type === "function"), ...input.containers]) {
      delete node.sourceFile;
      assert.equal(validate(input), false, `${stage} functions and containers must require sourceFile`);
      assert.ok(validate.errors.some((error) => error.keyword === "required" && error.params.missingProperty === "sourceFile"));
      for (const sourceFile of [null, 1, "", "/src/Service.ts", "C:/src/Service.ts", "src\\Service.ts", "../Service.ts", "src/../Service.ts"]) {
        node.sourceFile = sourceFile;
        assert.equal(validate(input), false, `${stage} must reject sourceFile ${JSON.stringify(sourceFile)}`);
        assert.ok(validate.errors.some((error) => error.instancePath.endsWith("/sourceFile")));
      }
      for (const sourceFile of ["Service.ts", "src/proposed/FutureService.ts", "src/deleted/LegacyService.ts"]) {
        node.sourceFile = sourceFile;
        assert.equal(validate(input), true, JSON.stringify(validate.errors));
      }
    }
  }
});

test("rename origins record old names and paths, with optional original function owner", async () => {
  const schema = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(schema);
  const input = highLevelDesign();
  input.containers[0].renamedFrom = { name: "OldService", sourceFile: "src/OldService.ts" };
  input.nodes[0].renamedFrom = { name: "oldInspect", sourceFile: "src/OldService.ts", containerName: "OldOwner" };
  assert.equal(validate(input), true, JSON.stringify(validate.errors));

  input.containers[0].renamedFrom.containerName = "OldOwner";
  assert.equal(validate(input), false);
  delete input.containers[0].renamedFrom.containerName;
  delete input.nodes[0].renamedFrom.sourceFile;
  assert.equal(validate(input), false);
  input.nodes[0].renamedFrom.sourceFile = "../old.ts";
  assert.equal(validate(input), false);
});

test("initialization is a required boolean only on nodes in both stages", async () => {
  const schema = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strictTypes: true }).compile(schema);
  const example = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"), "utf8"));
  example.nodes.push(
    { id: "input", name: "Input", type: "system-input", description: "Incoming request", changeType: "unchanged", initialization: false },
    { id: "output", name: "Output", type: "system-output", description: "Published result", changeType: "unchanged", initialization: false },
  );
  for (const stage of ["high-level-design", "code-review"]) {
    const input = structuredClone(example);
    input.stage = stage;
    if (stage === "code-review") {
      input.diffHunks = [];
      for (const entry of [...input.nodes, ...input.relationships]) {
        entry.changeType = "unchanged";
      }
    }
    assert.equal(validate(input), true, JSON.stringify(validate.errors));
    for (const entry of input.nodes) {
      for (const initialization of [true, false]) {
        entry.initialization = initialization;
        assert.equal(validate(input), true, JSON.stringify(validate.errors));
      }
      for (const initialization of [null, "true", 1]) {
        entry.initialization = initialization;
        assert.equal(validate(input), false, `${stage} ${entry.type} must reject ${JSON.stringify(initialization)}`);
        assert.ok(validate.errors.some((error) => error.instancePath.endsWith("/initialization") && error.keyword === "type"));
      }
      delete entry.initialization;
      assert.equal(validate(input), false, `${stage} ${entry.type} must require initialization`);
      assert.ok(validate.errors.some((error) => error.keyword === "required" && error.params.missingProperty === "initialization"));
      entry.initialization = false;
    }
    for (const relationship of input.relationships) {
      for (const initialization of [true, false]) {
        relationship.initialization = initialization;
        assert.equal(validate(input), false, `${stage} ${relationship.type} must reject initialization`);
        assert.ok(validate.errors.some((error) => error.keyword === "additionalProperties" && error.params.additionalProperty === "initialization"));
      }
      delete relationship.initialization;
    }
  }
});

test("container-free graphs are valid but functions still require an existing owner", async (t) => {
  for (const stage of ["high-level-design", "code-review"]) {
    const input = { schemaVersion: 18, stage, containers: [], nodes: [], relationships: [] };
    if (stage === "code-review") {
      input.diffHunks = [];
    }
    assert.equal((await runValidator(t, input)).status, 0);

    input.nodes.push(
      { id: "panel", name: "Panel", type: "ui-component", description: "Displays results", changeType: "unchanged", initialization: false },
      { id: "rules", name: "Rules", type: "static-data", changeType: "unchanged", initialization: false },
    );
    assert.equal((await runValidator(t, input)).status, 0);

    input.nodes.push({ id: "inspect", name: "inspect", type: "function", sourceFile: "src/Service.ts", changeType: "unchanged", initialization: false });
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
    { id: "module-inspect", name: "inspect", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "added", initialization: false },
    { id: "class-value", name: "value", type: "state-variable", containerId: "service", changeType: "modified", initialization: false },
    { id: "module-rules", name: "Rules", type: "static-data", containerId: "operations", changeType: "unchanged", initialization: false },
    { id: "unowned-rules", name: "Rules", type: "static-data", changeType: "unchanged", initialization: false },
    { id: "same-name", name: "inspect", type: "state-variable", containerId: "service", changeType: "unchanged", initialization: false },
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
    input.nodes.push({ id: "boundary", name: "Boundary", type, description: "System boundary", changeType: "unchanged", initialization: false });
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
  duplicateUnowned.nodes.push({ id: "external-rules", name: "Rules", type: "external-dependency", description: "External rules", changeType: "unchanged", initialization: false });
  assert.match((await runValidator(t, duplicateUnowned)).stderr, /Duplicate unowned node name: Rules/);

  const sharedContainerName = highLevelDesign();
  sharedContainerName.nodes.push({ id: "boundary", name: "Service", type: "ui-component", description: "Service panel", changeType: "unchanged", initialization: false });
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
      transferType: "arguments",
      changeType: "unchanged", dataDescription: "Value", purpose: "Inspect value",
    });
    assert.match((await runValidator(t, input)).stderr, /Unknown relationship node/);
  }
  const mismatched = highLevelDesign();
  mismatched.relationships.push({
    from: { nodeId: "rules", type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow",
    transferType: "arguments",
    changeType: "unchanged", dataDescription: "Rules", purpose: "Inspect rules",
  });
  assert.match((await runValidator(t, mismatched)).stderr, /Relationship node type does not match rules/);
});

test("class composition is separate from membership and excludes module endpoints", async (t) => {
  const input = highLevelDesign();
  input.containers.push({ id: "model", name: "Model", type: "class", sourceFile: "src/Model.ts" });
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
  for (const field of ["dataDescription", "purpose", "transferType"]) {
    const metadata = structuredClone(input);
    metadata.relationships[0][field] = field === "transferType" ? "arguments" : "Not applicable";
    assert.equal((await runValidator(t, metadata)).status, 1);
  }
});

test("function transfers require arguments or return in both development stages", async (t) => {
  for (const stage of ["high-level-design", "code-review"]) {
    for (const transferType of ["arguments", "return", undefined, "request"]) {
      const input = highLevelDesign();
      input.stage = stage;
      if (stage === "code-review") input.diffHunks = [];
      input.nodes.push({ id: "process", name: "process", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "unchanged", initialization: false });
      input.relationships.push({
        from: { nodeId: "inspect", type: "function" }, to: { nodeId: "process", type: "function" }, type: "dataflow",
        transferType, changeType: "unchanged", dataDescription: "Value", purpose: "Process value",
      });
      const result = await runValidator(t, input);
      assert.equal(result.status, transferType === "arguments" || transferType === "return" ? 0 : 1, result.stderr);
    }
  }
});

test("schema enforces all node-type connection combinations and limits transferType to function pairs", async () => {
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
        const node = { id: type, name: type, type, description: type, changeType: "unchanged", initialization: false };
        if (type === "function" || type === "state-variable") {
          node.containerId = "service";
        }
        if (type === "function") {
          node.sourceFile = "src/Service.ts";
        }
        return node;
      });
      input.relationships = [{
        from: { nodeId: from, type: from }, to: { nodeId: to, type: to }, type: "dataflow",
        changeType: "unchanged", dataDescription: "Value", purpose: "Transfer value",
      }];
      if (from === "function" && to === "function") {
        input.relationships[0].transferType = "arguments";
      }
      assert.equal(validate(input), targets.includes(to), `${from} -> ${to}: ${JSON.stringify(validate.errors)}`);
      if (targets.includes(to) && (from !== "function" || to !== "function")) {
        for (const transferType of ["arguments", "return"]) {
          input.relationships[0].transferType = transferType;
          assert.equal(validate(input), false, `${from} -> ${to} must omit transferType`);
        }
      }
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
  input.containers.push({ id: "model", name: "Model", type: "class", sourceFile: "src/Model.ts" });
  input.relationships.push({ from: { containerId: "service", type: "class" }, to: { containerId: "model", type: "class" }, type: "composition", changeType: "added" });
  input.nodes.push({ id: "panel", name: "Panel", type: "ui-component", description: "Shows inspection results", changeType: "modified", initialization: false });
  Object.assign(input, { changedClassCount: 0, changedFunctionCount: 0, changedComponentCount: 1, changedDataflowRelationshipCount: 1 });
  const result = await runValidator(t, input, "--evaluated");
  assert.equal(result.status, 0, result.stderr);

  input.changedComponentCount = 0;
  assert.match((await runValidator(t, input)).stderr, /changedComponentCount must equal the derived count: 1/);
});

test("visualizer loads version 18 examples with owned static data", async () => {
  const input = JSON.parse(await readFile(path.join(toolkitDirectory, "common/impl-dataflow/impl-dataflow.example.json"), "utf8"));
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true, false);
  assert.equal(graph.containers.length, input.containers.length);
  const service = graph.containers.find((container) => container.name === "ChangeService");
  assert.equal(service.changeType, "changed");
  assert.equal(graph.containers.find((container) => container.name === "ChangeModel").changeType, "new");
  assert.equal(graph.containers.find((container) => container.name === "LegacyChangeAdapter").changeType, "deleted");
  assert.deepEqual(service.staticData.map((node) => node.name), ["Diff Format Rules"]);
  assert.deepEqual(graph.staticData.map((node) => node.name), ["Diff Format Rules"]);
  const layout = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 80, () => 100, new Set());
  for (const node of input.nodes) {
    assert.ok(layout.memberRects.has(node.id) || layout.boxes.has(node.id));
  }
});

test("visualizer keeps repeated member names and container/node names distinct by ID", () => {
  const input = highLevelDesign();
  input.nodes.push(
    { id: "module-inspect", name: "inspect", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "unchanged", initialization: false },
    { id: "module-rules", name: "Rules", type: "static-data", containerId: "operations", changeType: "unchanged", initialization: false },
    { id: "service-panel", name: "Service", type: "ui-component", description: "Service panel", changeType: "unchanged", initialization: false },
  );
  for (const nodeId of ["inspect", "module-inspect"]) {
    input.relationships.push({ from: { nodeId: "service-panel", type: "ui-component" }, to: { nodeId, type: "function" }, type: "dataflow", changeType: "added", dataDescription: "Request", purpose: "Inspect" });
  }
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, true);
  const layout = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 80, () => 100, new Set());
  assert.notDeepEqual(layout.memberRects.get("inspect"), layout.memberRects.get("module-inspect"));
  assert.notDeepEqual(layout.boxes.get("rules"), layout.boxes.get("module-rules"));
  assert.notDeepEqual(layout.boxes.get("service"), layout.boxes.get("service-panel"));
  assert.notEqual(edgeKey(graph.relationships[0], false), edgeKey(graph.relationships[1], false));
  assert.equal(dataflowEdges(graph.relationships, true).length, 2);
});

test("container status reflects uniform and mixed statuses across all child types", () => {
  const cases = [
    [["added", "added", "added"], "new"],
    [["unchanged", "unchanged", "unchanged"], "unchanged"],
    [["deleted", "deleted", "deleted"], "deleted"],
    [["modified", "modified", "modified"], "changed"],
    [["added", "unchanged", "unchanged"], "changed"],
    [["added", "deleted", "added"], "changed"],
    [["modified", "added", "added"], "changed"],
    [["unchanged", "deleted", "unchanged"], "changed"],
    [["unchanged", "modified", "unchanged"], "changed"],
    [["deleted", "deleted", "modified"], "changed"],
  ];
  for (const type of ["class", "module"]) {
    for (const [childStatuses, expected] of cases) {
      const input = highLevelDesign();
      input.containers = [{ id: "service", name: "Service", type }];
      for (const [index, node] of input.nodes.entries()) {
        node.containerId = "service";
        node.changeType = childStatuses[index];
      }
      assert.equal(filterGraph(input, true).containers[0].changeType, expected, `${type}: ${childStatuses.join(", ")}`);
    }
  }
});

test("hidden initialization and unchanged children still contribute to container status", () => {
  for (const hiddenStatus of ["unchanged", "modified", "deleted"]) {
    const input = highLevelDesign();
    input.nodes[0].changeType = hiddenStatus;
    input.nodes[0].initialization = true;
    input.nodes[2].changeType = "added";
    for (const showUnchanged of [true, false]) {
      for (const hideInitialization of [true, false]) {
        const graph = filterGraph(input, showUnchanged, hideInitialization);
        assert.equal(graph.containers.find((container) => container.id === "service").changeType, "changed");
      }
    }
  }
});

test("visualizer filters all member types and derives status from changed owned nodes", () => {
  const input = highLevelDesign();
  assert.equal(filterGraph(input, false).nodes.length, 0);
  input.nodes[1].changeType = "modified";
  input.nodes[2].changeType = "added";
  const graph = filterGraph(input, false);
  assert.equal(graph.containers.length, 2);
  assert.ok(graph.containers.every((container) => container.changeType === "changed"));
  assert.equal(graph.containers[0].functions.length, 0);
  assert.equal(graph.containers[0].staticData.length, 1);
  assert.equal(graph.containers[1].stateVariables.length, 1);

  const unchanged = filterGraph(highLevelDesign(), true);
  assert.ok(unchanged.containers.every((container) => container.changeType === "unchanged"));
});

test("initialization filtering hides every node subtype and restores it when disabled", () => {
  for (const type of ["function", "state-variable", "static-data", "ui-component", "system-input", "system-output", "external-dependency"]) {
    const input = highLevelDesign();
    input.nodes = [{ id: "setup", name: "Setup", type, description: "Initialization", changeType: "added", initialization: true }];
    if (type === "function" || type === "state-variable" || type === "static-data") {
      input.nodes[0].containerId = "service";
    }
    if (type === "ui-component") {
      input.nodes.push({ id: "output", name: "Output", type: "system-output", description: "Setup result", changeType: "added", initialization: false });
      input.relationships.push({ from: { nodeId: "setup", type }, to: { nodeId: "output", type: "system-output" }, type: "dataflow", changeType: "added", dataDescription: "Setup result", purpose: "Publish setup" });
    }
    for (const hideInitialization of [true, false]) {
      const graph = filterGraph(input, true, hideInitialization);
      const members = graph.containers.flatMap((container) => [...container.functions, ...container.stateVariables, ...container.staticData]);
      assert.equal([...members, ...graph.components, ...graph.staticData].some((node) => node.id === "setup"), !hideInitialization, type);
    }
  }
});

test("initialization filtering removes empty owners and relationships with hidden endpoints", () => {
  const input = highLevelDesign();
  input.containers[1].type = "class";
  input.nodes[0].initialization = true;
  input.nodes[2].initialization = true;
  input.nodes.push({ id: "process", name: "process", type: "function", containerId: "operations", sourceFile: "src/operations.ts", changeType: "added", initialization: false });
  input.relationships.push(
    { from: { nodeId: "inspect", type: "function" }, to: { nodeId: "process", type: "function" }, type: "dataflow", transferType: "arguments", changeType: "added", dataDescription: "Setup", purpose: "Hidden source" },
    { from: { nodeId: "process", type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow", transferType: "arguments", changeType: "added", dataDescription: "Setup", purpose: "Hidden target" },
    { from: { containerId: "service", type: "class" }, to: { containerId: "operations", type: "class" }, type: "composition", changeType: "added" },
    { from: { containerId: "operations", type: "class" }, to: { containerId: "service", type: "class" }, type: "composition", changeType: "added" },
    { from: { nodeId: "process", type: "function" }, to: { nodeId: "value", type: "state-variable" }, type: "dataflow", changeType: "added", dataDescription: "Updated value", purpose: "Runtime write" },
    { from: { nodeId: "value", type: "state-variable" }, to: { nodeId: "process", type: "function" }, type: "dataflow", changeType: "added", dataDescription: "Current value", purpose: "Runtime read" },
  );
  const graph = filterGraph(input, true);
  assert.deepEqual(graph.containers.map((container) => container.id), ["operations"]);
  assert.deepEqual(graph.relationships.map((item) => item.relationship), input.relationships.slice(4));
  const shown = filterGraph(input, true, false);
  assert.equal(shown.containers.length, 2);
  assert.equal(shown.relationships.length, input.relationships.length);
});

test("initialization and unchanged filters compose without retaining containers through composition", () => {
  const input = highLevelDesign();
  input.containers[1].type = "class";
  input.nodes[0].changeType = "added";
  input.nodes[0].initialization = true;
  input.nodes[1].changeType = "added";
  input.relationships.push({ from: { containerId: "service", type: "class" }, to: { containerId: "operations", type: "class" }, type: "composition", changeType: "added" });
  assert.deepEqual(filterGraph(input, false).containers.map((container) => container.id), ["operations"]);
  assert.equal(filterGraph(input, false).relationships.length, 0);
  assert.equal(filterGraph(input, true).containers.length, 2);
  assert.equal(filterGraph(input, false, false).containers.length, 2);
});

test("composition-only changes retain unchanged containers without implying member changes", () => {
  const input = highLevelDesign();
  input.nodes = [];
  input.containers[1].type = "class";
  input.relationships.push({ from: { containerId: "service", type: "class" }, to: { containerId: "operations", type: "class" }, type: "composition", changeType: "added" });
  const graph = filterGraph(input, false);
  assert.equal(graph.containers.length, 2);
  assert.ok(graph.containers.every((container) => container.changeType === "unchanged"));
  const layout = computeLayout(graph.nodes, graph.relationships, true, () => 80, () => 80, () => 100, new Set());
  assert.equal(layout.compositionRelationships.length, 1);
});

test("visualizer supports boundary-only graphs and an empty graph", () => {
  const input = highLevelDesign();
  input.containers = [];
  input.nodes = [
    { id: "input", name: "Input", type: "system-input", description: "Incoming request", changeType: "added", initialization: false },
    { id: "output", name: "Output", type: "system-output", description: "Published result", changeType: "added", initialization: false },
    { id: "rules", name: "Rules", type: "static-data", changeType: "added", initialization: false },
  ];
  input.relationships.push({ from: { nodeId: "input", type: "system-input" }, to: { nodeId: "output", type: "system-output" }, type: "dataflow", changeType: "added", dataDescription: "Result", purpose: "Publish" });
  assert.equal(semanticError(input), undefined);
  const graph = filterGraph(input, false);
  const layout = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 80, () => 100, new Set());
  assert.equal(graph.containers.length, 0);
  assert.equal(layout.boxes.size, 3);
  assert.ok(layout.boxes.get("input").y < layout.boxes.get("output").y);
  input.nodes = [];
  input.relationships = [];
  const empty = filterGraph(input, true);
  assert.equal(computeLayout(empty.nodes, empty.relationships, false, () => 80, () => 80, () => 100, new Set()).boxes.size, 0);
});

test("visualizer and CLI share semantic validation for ownership, endpoints, and hunk references", async (t) => {
  const missingOwner = highLevelDesign();
  missingOwner.nodes[0].containerId = "missing";
  const mismatchedEndpoint = highLevelDesign();
  mismatchedEndpoint.relationships.push({ from: { nodeId: "rules", type: "function" }, to: { nodeId: "inspect", type: "function" }, type: "dataflow", transferType: "arguments", changeType: "unchanged", dataDescription: "Rules", purpose: "Inspect" });
  const invalidEvidence = highLevelDesign();
  invalidEvidence.stage = "code-review";
  invalidEvidence.diffHunks = [];
  invalidEvidence.containers[0].diffHunkIds = ["missing"];
  for (const input of [missingOwner, mismatchedEndpoint, invalidEvidence]) {
    const error = semanticError(input);
    const result = await runValidator(t, input);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(error));
  }
});
