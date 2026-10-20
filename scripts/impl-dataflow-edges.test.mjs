import assert from "node:assert/strict";
import test from "node:test";

import { dataflowEdges, relationshipsForEdge } from "../common/impl-dataflow/visualizer/src/edges.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";

function implementation(relationships) {
  return {
    schemaVersion: 17,
    stage: "high-level-design",
    containers: [{ id: "client", name: "Client", type: "module" }, { id: "service", name: "Service", type: "class" }],
    nodes: [
      ...["a", "a2"].map((id) => ({ id, name: id, type: "function", containerId: "client", sourceFile: "src/client.ts", changeType: "added", initialization: false })),
      ...["b", "b2"].map((id) => ({ id, name: id, type: "function", containerId: "service", sourceFile: "src/Service.ts", changeType: "added", initialization: false })),
      { id: "state", name: "State", type: "state-variable", containerId: "service", changeType: "added", initialization: false },
      { id: "static", name: "Static", type: "static-data", containerId: "service", changeType: "added", initialization: false },
      { id: "boundary", name: "Boundary", type: "external-dependency", description: "Storage", changeType: "added", initialization: false },
    ],
    relationships,
  };
}

function flow(from, to, transferType, changeType = "added") {
  const endpoint = (nodeId) => ({ nodeId, type: nodeId === "state" ? "state-variable" : nodeId === "static" ? "static-data" : nodeId === "boundary" ? "external-dependency" : "function" });
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
    const collapsed = dataflowEdges(graph.relationships, true);
    assert.equal(collapsed.length, 1);
    assert.ok(collapsed[0].back);
    assert.deepEqual(relationshipsForEdge(graph.relationships, collapsed[0].key, true), graph.relationships);
  }
});

test("collapsed state reads and writes and boundary traffic merge by visible pair", () => {
  const graph = filterGraph(implementation([
    flow("a", "state"), flow("state", "a"), flow("a", "boundary"), flow("boundary", "a"),
  ]), true);
  const expanded = dataflowEdges(graph.relationships, false);
  assert.equal(expanded.length, 4);
  assert.ok(expanded.every((edge) => edge.back === undefined));
  const collapsed = dataflowEdges(graph.relationships, true);
  assert.equal(collapsed.length, 2);
  assert.ok(collapsed.every((edge) => edge.back !== undefined));
  assert.deepEqual(collapsed.map((edge) => edge.relationships.length), [2, 2]);
});

test("collapsed containers merge opposite flows between different functions", () => {
  const graph = filterGraph(implementation([flow("a", "b", "arguments"), flow("b2", "a2", "return")]), true);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].back.relationship, graph.relationships[1].relationship);
  assert.deepEqual(relationshipsForEdge(graph.relationships, edges[0].key, true), graph.relationships);
});

test("collapsed flows hide internal members and retain static data sources", () => {
  const graph = filterGraph(implementation([
    flow("a", "a2", "arguments"), flow("a", "a", "arguments"),
    flow("b", "state"), flow("state", "b"), flow("static", "b"),
    flow("boundary", "boundary"),
  ]), true);
  assert.equal(dataflowEdges(graph.relationships, false).length, graph.relationships.length);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].forward.relationship, graph.relationships[4].relationship);
});

test("collapsed flows merge across transfer types and change types in either order", () => {
  const relationships = [
    flow("a", "b", "arguments"), flow("a2", "b2", "return", "modified"),
    flow("a", "state", undefined, "deleted"), flow("a2", "state", undefined, "unchanged"),
  ];
  for (const items of [relationships, [...relationships].reverse()]) {
    const graph = filterGraph(implementation(items), true);
    assert.equal(dataflowEdges(graph.relationships, false).length, items.length);
    const edges = dataflowEdges(graph.relationships, true);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].back, undefined);
    assert.deepEqual(relationshipsForEdge(graph.relationships, edges[0].key, true), graph.relationships);
  }
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

test("collapsed pairs with different return colors merge and retain inspector details", () => {
  const graph = filterGraph(implementation([
    flow("a", "b", "arguments"), flow("b", "a", "return", "modified"),
    flow("a2", "b2", "arguments"), flow("b2", "a2", "return", "deleted"),
  ]), true);
  const edges = dataflowEdges(graph.relationships, true);
  assert.equal(edges.length, 1);
  assert.ok(edges[0].back);
  assert.deepEqual(relationshipsForEdge(graph.relationships, edges[0].key, true), graph.relationships);
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
