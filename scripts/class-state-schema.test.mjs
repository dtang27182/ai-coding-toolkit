import assert from "node:assert/strict";
import test from "node:test";

import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { edgeKey, isInternalDataRelationship, mergeContainerDataflows } from "../common/impl-dataflow/visualizer/src/types.ts";

function implementation(relationships = []) {
  return {
    schemaVersion: 14,
    stage: "high-level-design",
    containers: [{ id: "model", name: "Model", type: "class" }, { id: "controller", name: "Controller", type: "module" }],
    nodes: [
      { id: "write", name: "update", type: "function", containerId: "model", changeType: "added" },
      { id: "read", name: "read", type: "function", containerId: "model", changeType: "added" },
      { id: "handle", name: "update", type: "function", containerId: "controller", changeType: "added" },
      { id: "value", name: "value", type: "state-variable", containerId: "model", changeType: "added" },
      { id: "rules", name: "Rules", type: "static-data", containerId: "model", changeType: "added" },
    ],
    relationships,
  };
}

function dataflow(fromId, fromType, toId, toType) {
  return { from: { nodeId: fromId, type: fromType }, to: { nodeId: toId, type: toType }, type: "dataflow", changeType: "added", dataDescription: "Value", purpose: "Process value" };
}

test("collapsed layout hides functions, state, and owned static data", () => {
  const graph = filterGraph(implementation(), true);
  const collapsed = computeLayout(graph.nodes, graph.relationships, true, () => 80, () => 90, () => 160, new Set());
  assert.equal(collapsed.memberRects.size, 0);
  assert.equal(collapsed.stateRects.size, 0);
  const expanded = computeLayout(graph.nodes, graph.relationships, false, () => 80, () => 90, () => 160, new Set());
  assert.equal(expanded.memberRects.size, 5);
  assert.ok(expanded.memberRects.has("rules"));
  assert.ok(expanded.memberRects.has("value"));
});

test("only same-container state and static-data accesses are internal", () => {
  const graph = filterGraph(implementation([
    dataflow("write", "function", "value", "state-variable"),
    dataflow("value", "state-variable", "read", "function"),
    dataflow("handle", "function", "value", "state-variable"),
    dataflow("write", "function", "read", "function"),
    dataflow("rules", "static-data", "read", "function"),
  ]), true);
  assert.deepEqual(graph.relationships.map(isInternalDataRelationship), [true, true, false, false, true]);
});

test("collapsed dataflows merge by container IDs and retain all inspector references", () => {
  const graph = filterGraph(implementation([
    dataflow("handle", "function", "read", "function"),
    dataflow("handle", "function", "value", "state-variable"),
    dataflow("value", "state-variable", "handle", "function"),
  ]), true);
  const merged = mergeContainerDataflows(graph.relationships);
  assert.equal(merged.length, 2);
  assert.deepEqual(graph.relationships.filter((relationship) => edgeKey(relationship, true) === edgeKey(merged[0], true)), graph.relationships.slice(0, 2));
  assert.deepEqual(graph.relationships.filter((relationship) => edgeKey(relationship, true) === edgeKey(merged[1], true)), graph.relationships.slice(2));
  assert.notEqual(edgeKey(graph.relationships[0], false), edgeKey(graph.relationships[1], false));
});
