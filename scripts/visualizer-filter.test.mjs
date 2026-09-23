import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { filterGraph } from "../hld-gen/visualizer/src/filter.ts";
import { mergeClassDataflows } from "../hld-gen/visualizer/src/types.ts";

const schema = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

function variable(name, kind, line, method) {
  return { name, kind, ...(method === undefined ? {} : { method }), declaredAt: { file: "src/Flow.ts", line, column: 1 } };
}

function architectureDiff() {
  return {
    schemaVersion: 8,
    stage: "high level design",
    userFlows: [{ name: "Run the flow", steps: [{ id: 1, text: "The user runs the flow and receives its result." }] }],
    classes: [
      {
        name: "Flow", changeType: "modified", hasUserFlowState: false,
        methods: [
          { name: "run", changeType: "modified", userFlow: true },
          { name: "configure", changeType: "added", userFlow: false },
          { name: "read", changeType: "unchanged", userFlow: true },
        ],
        variableExposure: [
          variable("state", "instance", 1),
          variable("input", "parameter", 2, "run"),
          variable("result", "local", 3, "run"),
          variable("config", "parameter", 4, "configure"),
          variable("adapter", "local", 5, "configure"),
          variable("cached", "local", 6, "read"),
        ],
        variableExposureCount: 99,
      },
      { name: "State", changeType: "modified", hasUserFlowState: true, methods: [], variableExposure: [variable("state", "instance", 1)] },
      {
        name: "Support", changeType: "added", hasUserFlowState: false,
        methods: [{ name: "register", changeType: "added", userFlow: false }],
        variableExposure: [variable("registration", "local", 7, "register")],
      },
      { name: "Context", changeType: "unchanged", hasUserFlowState: true, methods: [], variableExposure: [] },
    ],
    components: [
      { name: "Panel", type: "ui", changeType: "modified", userFlow: true },
      { name: "File", type: "external-io", changeType: "unchanged", userFlow: true },
      { name: "Config", type: "external-io", changeType: "added", userFlow: false },
    ],
    relationships: [
      { from: { component: "Panel" }, to: { class: "Flow", method: "run" }, type: "dataflow", dataDescription: "input", purpose: "Starts step 1.", changeType: "modified", userFlow: true },
      { from: { class: "Flow", method: "run" }, to: { class: "State" }, type: "state-update", dataDescription: "state: save result", purpose: "Retains the result from step 1.", changeType: "modified", userFlow: true },
      { from: { class: "Flow", method: "configure" }, to: { component: "Config" }, type: "dataflow", dataDescription: "configuration", purpose: "Writes supporting configuration.", changeType: "added", userFlow: false },
      { from: { class: "Flow", method: "run" }, to: { component: "Panel" }, type: "dataflow", dataDescription: "diagnostic instrumentation", purpose: "Reports supporting diagnostics.", changeType: "added", userFlow: false },
      { from: { component: "File" }, to: { class: "Flow", method: "read" }, type: "dataflow", dataDescription: "contents", purpose: "Supplies file contents used in step 1.", changeType: "modified", userFlow: true },
      { from: { class: "Flow" }, to: { class: "State" }, type: "composition", changeType: "added" },
      { from: { class: "Support" }, to: { class: "Flow" }, type: "composition", changeType: "added" },
    ],
    variableExposureCount: 99,
  };
}

test("schema v8 requires userFlow on methods, components, dataflows, and state updates", () => {
  const input = architectureDiff();
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
  for (const entry of [input.classes[0].methods[0], input.components[0], input.relationships[0], input.relationships[1]]) {
    for (const value of [undefined, "true", null]) {
      entry.userFlow = value;
      assert.equal(validate(input), false);
      assert.ok(validate.errors.some((error) => error.params.missingProperty === "userFlow" || error.instancePath.endsWith("/userFlow")));
    }
    entry.userFlow = true;
  }
  input.schemaVersion = 7;
  assert.equal(validate(input), false);
});

test("schema v8 requires class state classification and forbids class and composition userFlow flags", () => {
  const input = architectureDiff();
  for (const value of [undefined, "true", null]) {
    input.classes[0].hasUserFlowState = value;
    assert.equal(validate(input), false);
    assert.ok(validate.errors.some((error) => error.params.missingProperty === "hasUserFlowState" || error.instancePath.endsWith("/hasUserFlowState")));
  }
  input.classes[0].hasUserFlowState = false;
  for (const entry of [input.classes[0], input.relationships[5]]) {
    for (const value of [true, false]) {
      entry.userFlow = value;
      assert.equal(validate(input), false);
    }
    delete entry.userFlow;
  }
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
});

test("composition-only containers are hidden without hiding real state owners or adding shortcut edges", () => {
  const input = architectureDiff();
  input.classes.push({ name: "ChatWindowState", changeType: "modified", hasUserFlowState: false, methods: [], variableExposure: [] });
  input.relationships = [
    { from: { class: "Flow" }, to: { class: "ChatWindowState" }, type: "composition", changeType: "added" },
    { from: { class: "ChatWindowState" }, to: { class: "State" }, type: "composition", changeType: "added" },
    { from: { class: "Flow" }, to: { class: "State" }, type: "composition", changeType: "unchanged" },
  ];
  assert.equal(validate(input), true, JSON.stringify(validate.errors));
  const graph = filterGraph(input, false, true);
  assert.deepEqual(graph.classes.map((item) => item.name), ["Flow", "State"]);
  assert.equal(graph.relationships.length, 1);
  assert.deepEqual(graph.relationships[0].relationship, input.relationships[2]);
  const restored = filterGraph(input, true, false);
  assert.ok(restored.classes.some((item) => item.name === "ChatWindowState"));
  assert.equal(restored.relationships.length, 3);
});

test("class participation considers user-flow dataflows in either direction independently of method flags", () => {
  for (const reversed of [true, false]) {
    const input = architectureDiff();
    input.classes[0].methods.forEach((method) => { method.userFlow = false; });
    input.relationships = [{
      from: reversed ? { class: "Flow", method: "run" } : { component: "Panel" },
      to: reversed ? { component: "Panel" } : { class: "Flow", method: "run" },
      type: "dataflow", dataDescription: "input", purpose: "Carries the step 1 input.", changeType: "modified", userFlow: true,
    }];
    assert.ok(filterGraph(input, true, true).classes.some((item) => item.name === "Flow"));
    input.relationships[0].userFlow = false;
    assert.ok(!filterGraph(input, true, true).classes.some((item) => item.name === "Flow"));
  }
});

test("filters contributing methods, components, and relationships while retaining mixed classes and state owners", () => {
  const input = architectureDiff();
  const original = structuredClone(input);
  const graph = filterGraph(input, true, true);
  assert.deepEqual(graph.classes.map((item) => item.name), ["Flow", "State", "Context"]);
  assert.deepEqual(graph.classes[0].methods.map((item) => item.name), ["run", "read"]);
  assert.deepEqual(graph.components.map((item) => item.name), ["Panel", "File"]);
  assert.deepEqual(graph.relationships.map((item) => item.relationship.dataDescription ?? item.relationship.type), ["input", "state: save result", "contents", "composition"]);
  assert.deepEqual(graph.classes[0].variableExposure.map((item) => item.name), ["state", "input", "result", "cached"]);
  assert.equal(graph.classes[0].variableExposureCount, 4);
  assert.equal(graph.classes[1].variableExposureCount, 1);
  assert.equal(graph.variableExposureCount, 4, "Shared declarations count once across visible classes");
  assert.deepEqual(input, original, "Display filtering preserves the source diff and saved evaluation counts");
  const restored = filterGraph(input, true, false);
  assert.equal(restored.classes.length, 4);
  assert.equal(restored.relationships.length, 7);
  assert.equal(restored.classes[0].variableExposureCount, 6);
  assert.equal(restored.variableExposureCount, 7);
});

test("combines unchanged and user-flow filters, including endpoint visibility and local exposure", () => {
  const graph = filterGraph(architectureDiff(), false, true);
  assert.deepEqual(graph.classes.map((item) => item.name), ["Flow", "State"]);
  assert.deepEqual(graph.classes[0].methods.map((item) => item.name), ["run"]);
  assert.deepEqual(graph.components.map((item) => item.name), ["Panel"]);
  assert.deepEqual(graph.relationships.map((item) => item.relationship.dataDescription ?? item.relationship.type), ["input", "state: save result", "composition"]);
  assert.equal(graph.classes[0].variableExposureCount, 3);
  assert.equal(graph.variableExposureCount, 3);
  const changed = filterGraph(architectureDiff(), false, false);
  assert.deepEqual(changed.classes[0].methods.map((item) => item.name), ["run", "configure"]);
  assert.equal(changed.variableExposureCount, 6);
});

test("unknown exposure affects only visible classes and an empty filtered view has zero exposure", () => {
  const input = architectureDiff();
  input.classes[2].variableExposure = null;
  assert.equal(filterGraph(input, true, false).variableExposureCount, null);
  assert.equal(filterGraph(input, true, true).variableExposureCount, 4);
  input.classes[0].variableExposure = null;
  const unknown = filterGraph(input, true, true);
  assert.equal(unknown.variableExposureCount, null);
  assert.equal(unknown.classes[0].variableExposureCount, null);
  for (const classDiff of input.classes) {
    classDiff.hasUserFlowState = false;
    for (const method of classDiff.methods) method.userFlow = false;
  }
  for (const component of input.components) component.userFlow = false;
  for (const relationship of input.relationships) {
    if (relationship.type !== "composition") relationship.userFlow = false;
  }
  const empty = filterGraph(input, true, true);
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.relationships, []);
  assert.equal(empty.variableExposureCount, 0);
});

test("filters before collapsing parallel dataflows between the same classes", () => {
  const input = architectureDiff();
  input.relationships = [
    { from: { class: "Flow", method: "run" }, to: { class: "Flow", method: "read" }, type: "dataflow", dataDescription: "supporting", purpose: "Carries supporting data.", changeType: "added", userFlow: false },
    { from: { class: "Flow", method: "run" }, to: { class: "Flow", method: "read" }, type: "dataflow", dataDescription: "user flow", purpose: "Carries data needed in step 1.", changeType: "added", userFlow: true },
  ];
  const graph = filterGraph(input, true, true);
  assert.deepEqual(mergeClassDataflows(graph.relationships).map((item) => item.relationship.dataDescription), ["user flow"]);
  assert.equal(graph.variableExposureCount, 4);
});
