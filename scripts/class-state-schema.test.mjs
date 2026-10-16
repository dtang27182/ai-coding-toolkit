import assert from "node:assert/strict";
import test from "node:test";

import { computeLayout as computeNewLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { edgeKey, isInternalStateRelationship, mergeClassDataflows, resolveEndpoint as resolveNewEndpoint } from "../common/impl-dataflow/visualizer/src/types.ts";

test("feature-design collapsed layout hides class internals", () => {
  const nodes = [{
    name: "ChangeModel",
    changeType: "added",
    functions: [{ name: "applyChanges", changeType: "added" }],
    stateVariables: [{ name: "changes", changeType: "added" }],
  }];
  const layout = computeNewLayout(nodes, [], true, () => 80, () => 90, () => 160, new Set());

  assert.equal(layout.functionRects.size, 0);
  assert.equal(layout.stateRects.size, 0);
});

test("feature-design identifies only same-class state relationships as internal", () => {
  const relationship = (type, from, to) => ({
    relationship: { type },
    from: resolveNewEndpoint(from),
    to: resolveNewEndpoint(to),
  });

  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Model", function: "write" }, { class: "Model", stateVariable: "value" })), true);
  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Model", stateVariable: "value" }, { class: "Model", function: "read" })), true);
  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Controller", function: "write" }, { class: "Model", stateVariable: "value" })), false);
  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Model", function: "first" }, { class: "Model", function: "second" })), false);
});

test("collapsed dataflows merge state accesses and retain their inspector references", () => {
  const relationships = [
    { from: { class: "Controller", function: "handle" }, to: { class: "Model", function: "refresh" } },
    { from: { class: "Controller", function: "handle" }, to: { class: "Model", stateVariable: "value" } },
    { from: { class: "Model", stateVariable: "value" }, to: { class: "Controller", function: "handle" } },
  ].map(({ from, to }) => ({
    relationship: { type: "dataflow", changeType: "added" },
    from: resolveNewEndpoint(from),
    to: resolveNewEndpoint(to),
  }));
  const merged = mergeClassDataflows(relationships);

  assert.equal(merged.length, 2);
  assert.deepEqual(relationships.filter((relationship) => edgeKey(relationship, true) === edgeKey(merged[0], true)), relationships.slice(0, 2));
  assert.deepEqual(relationships.filter((relationship) => edgeKey(relationship, true) === edgeKey(merged[1], true)), relationships.slice(2));
  assert.notEqual(edgeKey(relationships[0], false), edgeKey(relationships[1], false));
});
