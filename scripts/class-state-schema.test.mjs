import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { computeLayout } from "../hld-gen/visualizer/src/layout.ts";
import { computeLayout as computeNewLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { isInternalStateRelationship, resolveEndpoint as resolveNewEndpoint } from "../common/impl-dataflow/visualizer/src/types.ts";
import { resolveEndpoint } from "../hld-gen/visualizer/src/types.ts";
import { semanticError } from "../hld-gen/visualizer/src/validation.ts";

const schema = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.schema.json", import.meta.url), "utf8"));
const example = JSON.parse(await readFile(new URL("../hld-gen/references/architecture-diff.example.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

test("schema v9 requires state inventories and exact read and update endpoints", () => {
  assert.equal(validate(example), true, JSON.stringify(validate.errors));

  const missingInventory = structuredClone(example);
  delete missingInventory.classes[0].stateVariables;
  assert.equal(validate(missingInventory), false);

  const classUpdateTarget = structuredClone(example);
  classUpdateTarget.relationships.find((relationship) => relationship.type === "state-update").to = { class: "ChangeModel" };
  assert.equal(validate(classUpdateTarget), false);

  const reversedRead = structuredClone(example);
  const stateRead = reversedRead.relationships.find((relationship) => relationship.type === "state-read");
  [stateRead.from, stateRead.to] = [stateRead.to, stateRead.from];
  assert.equal(validate(reversedRead), false);
});

test("semantic validation resolves state variables and their user-flow classification", () => {
  assert.equal(semanticError(example), undefined);

  const unknown = structuredClone(example);
  unknown.relationships.find((relationship) => relationship.type === "state-read").from.stateVariable = "missing";
  assert.equal(semanticError(unknown), "Relationship references unknown state variable “ChangeModel.missing”.");

  const supporting = structuredClone(example);
  supporting.classes.find((classDiff) => classDiff.name === "ChangeModel").stateVariables[0].userFlow = false;
  assert.equal(semanticError(supporting), "User-flow relationship references a supporting state variable: ChangeModel.changes");
});

test("visualizer layout gives each class one shared state endpoint", () => {
  const nodes = [{
    name: "ChangeModel",
    changeType: "added",
    methods: [{ name: "applyChanges", changeType: "added", userFlow: true }],
    stateVariables: [
      { name: "changes", changeType: "added", userFlow: true },
      { name: "selection", changeType: "added", userFlow: true },
    ],
  }];
  const layout = computeLayout(nodes, [], false, () => 80, () => 90, () => 160, new Set());
  const endpoint = resolveEndpoint({ class: "ChangeModel", stateVariable: "changes" });

  assert.equal(endpoint.stateVariableName, "changes");
  assert.equal(layout.stateRects.size, 1);
  assert.ok(layout.stateRects.has("ChangeModel"));
  const stateRect = layout.stateRects.get("ChangeModel");
  const methodRect = [...layout.methodRects.values()][0];
  assert.equal(stateRect.y, methodRect.y);
  assert.ok(stateRect.x < methodRect.x);
});

test("hld-gen-new collapsed layout hides class internals", () => {
  const nodes = [{
    name: "ChangeModel",
    changeType: "added",
    methods: [{ name: "applyChanges", changeType: "added", userFlow: true }],
    stateVariables: [{ name: "changes", changeType: "added", userFlow: true }],
  }];
  const layout = computeNewLayout(nodes, [], true, () => 80, () => 90, () => 160, new Set());

  assert.equal(layout.methodRects.size, 0);
  assert.equal(layout.stateRects.size, 0);
});

test("hld-gen-new identifies only same-class state relationships as internal", () => {
  const relationship = (type, from, to) => ({
    relationship: { type },
    from: resolveNewEndpoint(from),
    to: resolveNewEndpoint(to),
  });

  assert.equal(isInternalStateRelationship(relationship("state-update", { class: "Model", method: "write" }, { class: "Model", stateVariable: "value" })), true);
  assert.equal(isInternalStateRelationship(relationship("state-read", { class: "Model", stateVariable: "value" }, { class: "Model", method: "read" })), true);
  assert.equal(isInternalStateRelationship(relationship("state-update", { class: "Controller", method: "write" }, { class: "Model", stateVariable: "value" })), false);
  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Model", method: "first" }, { class: "Model", method: "second" })), false);
});
