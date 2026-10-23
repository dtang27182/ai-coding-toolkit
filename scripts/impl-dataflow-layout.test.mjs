import assert from "node:assert/strict";
import test from "node:test";

import { dataflowEdges, relationshipsForEdge } from "../common/impl-dataflow/visualizer/src/edges.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { findUiPairs } from "../common/impl-dataflow/visualizer/src/pairing.ts";

function implementation() {
  const nodes = [
    { id: "panel", name: "Panel", type: "ui-component", location: "Panel", changeType: "added", changeSummary: "Add Panel.", initialization: false },
    { id: "unused-panel", name: "Unused panel", type: "ui-component", location: "UnusedPanel", changeType: "added", changeSummary: "Add Unused panel.", initialization: false },
    { id: "input", name: "Input", type: "system-input", location: "incoming requests", changeType: "added", changeSummary: "Add Input.", initialization: false },
    { id: "output", name: "Output", type: "system-output", location: "published results", changeType: "added", changeSummary: "Add Output.", initialization: false },
    { id: "storage", name: "Storage", type: "external-dependency", location: "storage service", changeType: "added", changeSummary: "Add Storage.", initialization: false },
    { id: "rules", name: "Rules", type: "static-data", containerId: "child", sourceFile: "src/Child.ts", changeType: "added", changeSummary: "Add Rules.", initialization: false },
    { id: "defaults", name: "Defaults", type: "static-data", sourceFile: "src/defaults.ts", changeType: "added", changeSummary: "Add Defaults.", initialization: false },
    { id: "handle", name: "handle", type: "function", containerId: "parent", sourceFile: "src/Parent.ts", changeType: "added", changeSummary: "Add handle.", initialization: false },
    { id: "process", name: "process", type: "function", containerId: "child", sourceFile: "src/Child.ts", changeType: "added", changeSummary: "Add process.", initialization: false },
  ];
  const flow = (from, to) => ({
    from: { nodeId: from, type: nodes.find((node) => node.id === from).type },
    to: { nodeId: to, type: nodes.find((node) => node.id === to).type },
    type: "dataflow", changeType: "added", dataDescription: "Value", purpose: "Transfer value",
  });
  return {
    schemaVersion: 18,
    stage: "high-level-design",
    containers: [{ id: "parent", name: "Parent", type: "class", sourceFile: "src/Parent.ts" }, { id: "child", name: "Child", type: "class", sourceFile: "src/Child.ts" }],
    nodes,
    relationships: [
      { from: { containerId: "parent", type: "class" }, to: { containerId: "child", type: "class" }, type: "composition", changeType: "added" },
      flow("panel", "handle"), flow("handle", "panel"), flow("input", "process"),
      flow("rules", "process"), flow("defaults", "handle"), flow("process", "output"),
      flow("process", "storage"), flow("storage", "process"),
    ],
  };
}

test("UI reads and writes use separate boxes while retaining original nodes and relationships", () => {
  const input = implementation();
  const original = structuredClone(input);
  const graph = filterGraph(input, true);
  const read = graph.components.find((node) => node.nodeId === "panel" && node.uiDirection === "read");
  const write = graph.components.find((node) => node.nodeId === "panel" && node.uiDirection === "write");
  assert.notEqual(read.id, write.id);
  assert.equal(graph.relationships[1].from.boxId, read.id);
  assert.equal(graph.relationships[2].to.boxId, write.id);
  assert.equal(graph.relationships[1].from.nodeId, "panel");
  assert.equal(graph.relationships[2].to.nodeId, "panel");
  assert.deepEqual(findUiPairs(graph.components), [{ label: "A", read, write }]);
  assert.deepEqual(graph.relationships.map((item) => item.relationship), input.relationships);
  assert.deepEqual(input, original);

  for (const collapsed of [false, true]) {
    const edges = dataflowEdges(graph.relationships, collapsed).filter((edge) => edge.relationships.some((item) => item.from.nodeId === "panel" || item.to.nodeId === "panel"));
    assert.equal(edges.length, 2);
    assert.ok(edges.every((edge) => edge.back === undefined));
    assert.notEqual(edges[0].key, edges[1].key);
    for (const edge of edges) {
      assert.deepEqual(relationshipsForEdge(graph.relationships, edge.key, collapsed), [edge.forward]);
    }
  }
});

test("UI reads, system inputs, and all static data share the top row above processing and outputs", () => {
  const graph = filterGraph(implementation(), true);
  for (const collapsed of [false, true]) {
    const layout = computeLayout(graph.nodes, graph.relationships, collapsed, () => 80, () => 80, () => 100, new Set());
    const sources = graph.nodes.filter((node) => node.uiDirection === "read" || node.nodeType === "system-input" || node.nodeType === "static-data");
    const outputs = graph.nodes.filter((node) => node.uiDirection === "write" || node.nodeType === "system-output");
    const middle = graph.nodes.filter((node) => node.nodeType === undefined || node.nodeType === "external-dependency");
    assert.ok(sources.every((node) => layout.boxes.get(node.id).y === 0));
    assert.equal(new Set(outputs.map((node) => layout.boxes.get(node.id).y)).size, 1);
    for (const node of middle) {
      for (const source of sources) {
        assert.ok(layout.boxes.get(source.id).y + layout.boxes.get(source.id).height < layout.boxes.get(node.id).y);
      }
      for (const output of outputs) {
        assert.ok(layout.boxes.get(node.id).y + layout.boxes.get(node.id).height < layout.boxes.get(output.id).y);
      }
    }
    assert.equal(layout.memberRects.has("rules"), false);
    assert.equal(graph.staticData.find((node) => node.id === "rules").containerId, "child");
    assert.ok(layout.boxes.get("parent").y < layout.boxes.get("child").y);
  }
});

test("UI self-flows connect the read icon to the write icon in both views", () => {
  const input = implementation();
  input.relationships = [{ from: { nodeId: "panel", type: "ui-component" }, to: { nodeId: "panel", type: "ui-component" }, type: "dataflow", changeType: "added", dataDescription: "Value", purpose: "Update UI" }];
  const graph = filterGraph(input, true);
  assert.notEqual(graph.relationships[0].from.boxId, graph.relationships[0].to.boxId);
  for (const collapsed of [false, true]) {
    assert.equal(dataflowEdges(graph.relationships, collapsed).length, 1);
  }
});

test("UI icons appear only for directions with visible dataflow", () => {
  for (const directions of [[], ["read"], ["write"], ["read", "write"]]) {
    const input = implementation();
    input.relationships = input.relationships.filter((relationship) => relationship.type === "dataflow"
      && ((directions.includes("read") && relationship.from.nodeId === "panel")
        || (directions.includes("write") && relationship.to.nodeId === "panel")));
    const graph = filterGraph(input, true);
    assert.deepEqual(graph.components.filter((node) => node.nodeId === "panel").map((node) => node.uiDirection), directions);
    assert.equal(graph.components.some((node) => node.nodeId === "unused-panel"), false);
    assert.equal(findUiPairs(graph.components).length, directions.length === 2 ? 1 : 0);
    for (const collapsed of [false, true]) {
      const layout = computeLayout(graph.nodes, graph.relationships, collapsed, () => 80, () => 80, () => 100, new Set());
      for (const relationship of graph.relationships) {
        assert.ok(layout.boxes.has(relationship.from.boxId));
        assert.ok(layout.boxes.has(relationship.to.boxId));
      }
    }
  }
});

test("filtering dataflows and their other endpoints removes the unused UI direction", () => {
  for (const direction of ["read", "write"]) {
    for (const hiddenBy of ["relationship", "unchanged-endpoint", "initialization-endpoint"]) {
      const input = implementation();
      const relationship = input.relationships.find((item) => item.type === "dataflow"
        && (direction === "read" ? item.from.nodeId === "panel" : item.to.nodeId === "panel"));
      if (hiddenBy === "relationship") {
        relationship.changeType = "unchanged";
      } else if (hiddenBy === "unchanged-endpoint") {
        input.nodes.find((node) => node.id === "handle").changeType = "unchanged";
      } else if (hiddenBy === "initialization-endpoint") {
        input.nodes.find((node) => node.id === "handle").initialization = true;
      }
      const hidden = filterGraph(input, false);
      assert.deepEqual(findUiPairs(hidden.components), []);
      assert.equal(hidden.components.some((node) => node.nodeId === "panel" && node.uiDirection === direction), false);
      if (hiddenBy === "relationship") {
        assert.deepEqual(hidden.components.filter((node) => node.nodeId === "panel").map((node) => node.uiDirection), [direction === "read" ? "write" : "read"]);
      }
      const shown = filterGraph(input, true, false);
      assert.deepEqual(shown.components.filter((node) => node.nodeId === "panel").map((node) => node.uiDirection), ["read", "write"]);
    }
  }
});

test("UI pair badges follow component order and connect only the same original ID", () => {
  const input = implementation();
  input.relationships.push(
    { from: { nodeId: "panel", type: "ui-component" }, to: { nodeId: "unused-panel", type: "ui-component" }, type: "dataflow", changeType: "added", dataDescription: "Value", purpose: "Show value" },
    { from: { nodeId: "unused-panel", type: "ui-component" }, to: { nodeId: "handle", type: "function" }, type: "dataflow", changeType: "added", dataDescription: "Action", purpose: "Handle action" },
  );
  const graph = filterGraph(input, true);
  const pairs = findUiPairs(graph.components);
  assert.deepEqual(pairs.map((pair) => [pair.label, pair.read.nodeId, pair.write.nodeId]), [
    ["A", "panel", "panel"], ["B", "unused-panel", "unused-panel"],
  ]);
  assert.ok(pairs.every((pair) => pair.read.uiDirection === "read" && pair.write.uiDirection === "write" && pair.read.id !== pair.write.id));
});

test("unchanged and initialization filters hide both UI icons and their edges", () => {
  for (const field of ["changeType", "initialization"]) {
    const input = implementation();
    input.nodes[0][field] = field === "changeType" ? "unchanged" : true;
    const hidden = filterGraph(input, false);
    assert.equal(hidden.components.some((node) => node.nodeId === "panel"), false);
    assert.equal(hidden.relationships.some((item) => item.from.nodeId === "panel" || item.to.nodeId === "panel"), false);
    const shown = filterGraph(input, true, false);
    assert.equal(shown.components.filter((node) => node.nodeId === "panel").length, 2);
    assert.equal(shown.relationships.filter((item) => item.from.nodeId === "panel" || item.to.nodeId === "panel").length, 2);
  }
});
