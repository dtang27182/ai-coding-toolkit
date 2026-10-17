import assert from "node:assert/strict";
import test from "node:test";

import { dataflowEdges, relationshipsForEdge } from "../common/impl-dataflow/visualizer/src/edges.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";

function implementation(relationships) {
  return {
    schemaVersion: 16,
    stage: "high-level-design",
    containers: [{ id: "client", name: "Client", type: "module" }, { id: "service", name: "Service", type: "class" }],
    nodes: [
      ...["a", "a2"].map((id) => ({ id, name: id, type: "function", containerId: "client", changeType: "added", initialization: false })),
      ...["b", "b2"].map((id) => ({ id, name: id, type: "function", containerId: "service", changeType: "added", initialization: false })),
      { id: "state", name: "State", type: "state-variable", containerId: "service", changeType: "added", initialization: false },
      { id: "boundary", name: "Boundary", type: "external-dependency", description: "Storage", changeType: "added", initialization: false },
    ],
    relationships,
  };
}

function flow(from, to, transferType, changeType = "added") {
  const endpoint = (nodeId) => ({ nodeId, type: nodeId === "state" ? "state-variable" : nodeId === "boundary" ? "external-dependency" : "function" });
  return { from: endpoint(from), to: endpoint(to), type: "dataflow", transferType, changeType, dataDescription: `${from} to ${to}`, purpose: `Transfer ${from} to ${to}` };
}

test("arguments own the arrow direction even when the return appears first", () => {
  const args = flow("a", "b", "arguments");
  const back = flow("b", "a", "return", "modified");
  for (const relationships of [[args, back], [back, args]]) {
    const graph = filterGraph(implementation(relationships), true);
    const edges = dataflowEdges(graph.relationships, false);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].forward.relationship, args);
    assert.equal(edges[0].back.relationship, back);
    assert.deepEqual(relationshipsForEdge(graph.relationships, edges[0].key, false).map((item) => item.relationship), [args, back]);
  }
});

test("standalone arguments and return flows keep their original direction", () => {
  for (const item of [flow("a", "b", "arguments"), flow("b", "a", "return")]) {
    const graph = filterGraph(implementation([item]), true);
    const edges = dataflowEdges(graph.relationships, false);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].forward.relationship, item);
    assert.equal(edges[0].back, undefined);
  }
});

test("opposite calls or opposite returns do not pair", () => {
  for (const transferType of ["arguments", "return"]) {
    const graph = filterGraph(implementation([flow("a", "b", transferType), flow("b", "a", transferType)]), true);
    const edges = dataflowEdges(graph.relationships, false);
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.back === undefined));
    assert.notEqual(edges[0].key, edges[1].key);
  }
});

test("state reads and writes and boundary traffic remain separate", () => {
  const graph = filterGraph(implementation([
    flow("a", "state"), flow("state", "a"), flow("a", "boundary"), flow("boundary", "a"),
  ]), true);
  for (const collapsed of [false, true]) {
    const edges = dataflowEdges(graph.relationships, collapsed);
    assert.equal(edges.length, 4);
    assert.ok(edges.every((edge) => edge.back === undefined));
  }
});

test("collapsed containers do not pair flows between different functions", () => {
  const graph = filterGraph(implementation([flow("a", "b", "arguments"), flow("b2", "a2", "return")]), true);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 2);
  assert.ok(edges.every((edge) => edge.back === undefined));
  assert.notEqual(edges[0].key, edges[1].key);
});

test("collapsed pairs retain every original relationship in the inspector", () => {
  const input = implementation([
    flow("a", "b", "arguments"), flow("b", "a", "return", "modified"),
    flow("a2", "b2", "arguments"), flow("b2", "a2", "return", "modified"),
  ]);
  const graph = filterGraph(input, true);
  assert.equal(dataflowEdges(graph.relationships, false).length, 2);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 1);
  assert.deepEqual(relationshipsForEdge(graph.relationships, edges[0].key, true).map((item) => item.relationship), input.relationships);
});

test("collapsed pairs with different return colors remain distinct", () => {
  const graph = filterGraph(implementation([
    flow("a", "b", "arguments"), flow("b", "a", "return", "modified"),
    flow("a2", "b2", "arguments"), flow("b2", "a2", "return", "deleted"),
  ]), true);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 2);
  assert.notEqual(edges[0].key, edges[1].key);
  assert.deepEqual(edges.map((edge) => edge.back.relationship.changeType), ["modified", "deleted"]);
});

test("hide unchanged pairs only the remaining visible relationships", () => {
  for (const unchangedType of ["arguments", "return"]) {
    const args = flow("a", "b", "arguments", unchangedType === "arguments" ? "unchanged" : "added");
    const back = flow("b", "a", "return", unchangedType === "return" ? "unchanged" : "modified");
    const input = implementation([args, back]);
    for (const collapsed of [false, true]) {
      assert.ok(dataflowEdges(filterGraph(input, true).relationships, collapsed)[0].back);
      const edges = dataflowEdges(filterGraph(input, false).relationships, collapsed);
      assert.equal(edges.length, 1);
      assert.equal(edges[0].back, undefined);
      assert.equal(edges[0].forward.relationship, unchangedType === "arguments" ? back : args);
    }
  }
});

test("each relationship participates in at most one pair", () => {
  const graph = filterGraph(implementation([
    flow("a", "b", "arguments"), flow("a", "b", "arguments", "modified"), flow("b", "a", "return"),
  ]), true);
  const edges = dataflowEdges(graph.relationships, false);
  assert.equal(edges.length, 2);
  assert.equal(edges.filter((edge) => edge.back !== undefined).length, 1);
  const members = edges.flatMap((edge) => edge.relationships);
  assert.equal(members.length, 3);
  assert.equal(new Set(members).size, 3);
});
