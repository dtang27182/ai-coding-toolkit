import assert from "node:assert/strict";
import test from "node:test";

import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { edgeKey, isInternalDataRelationship } from "../common/impl-dataflow/visualizer/src/types.ts";
import { dataflowEdges, relationshipsForEdge } from "../common/impl-dataflow/visualizer/src/edges.ts";

function implementation(relationships = []) {
  return {
    schemaVersion: 16,
    stage: "high-level-design",
    containers: [{ id: "model", name: "Model", type: "class" }, { id: "controller", name: "Controller", type: "module" }],
    nodes: [
      { id: "write", name: "update", type: "function", containerId: "model", changeType: "added", initialization: false },
      { id: "read", name: "read", type: "function", containerId: "model", changeType: "added", initialization: false },
      { id: "handle", name: "update", type: "function", containerId: "controller", changeType: "added", initialization: false },
      { id: "value", name: "value", type: "state-variable", containerId: "model", changeType: "added", initialization: false },
      { id: "rules", name: "Rules", type: "static-data", containerId: "model", changeType: "added", initialization: false },
    ],
    relationships,
  };
}

function dataflow(fromId, fromType, toId, toType) {
  return { from: { nodeId: fromId, type: fromType }, to: { nodeId: toId, type: toType }, type: "dataflow", ...(fromType === "function" && toType === "function" ? { transferType: "arguments" } : {}), changeType: "added", dataDescription: "Value", purpose: "Process value" };
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

test("collapsed dataflows merge function calls and state accesses and retain inspector references", () => {
  const graph = filterGraph(implementation([
    dataflow("handle", "function", "read", "function"),
    dataflow("handle", "function", "value", "state-variable"),
    dataflow("value", "state-variable", "handle", "function"),
  ]), true);
  const merged = dataflowEdges(graph.relationships, true);
  assert.equal(merged.length, 1);
  assert.deepEqual(relationshipsForEdge(graph.relationships, merged[0].key, true), graph.relationships);
  assert.notEqual(edgeKey(graph.relationships[0], false), edgeKey(graph.relationships[1], false));
});
