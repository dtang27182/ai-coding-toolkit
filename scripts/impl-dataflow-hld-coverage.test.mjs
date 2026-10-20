import assert from "node:assert/strict";
import test from "node:test";

import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";

function review() {
  return {
    schemaVersion: 18,
    stage: "code-review",
    containers: [
      { id: "service", name: "Service", type: "class", sourceFile: "src/Service.ts" },
      { id: "other", name: "Other", type: "class", sourceFile: "src/Other.ts" },
    ],
    nodes: [
      { id: "actual", name: "run", type: "function", containerId: "service", sourceFile: "src/service.ts", initialization: false, changeType: "added", "hld-change-mismatch": true },
      ...["added", "modified", "deleted"].map((changeType, index) => ({
        id: `missing-${index}`, name: `expected${index}`, type: "function", subtype: "missing-from-cr",
        containerId: index === 0 ? "service" : "other", sourceFile: "src/service.ts",
        initialization: false, changeType, "hld-change-mismatch": true,
      })),
    ],
    relationships: [],
    diffHunks: [],
  };
}

function layoutFor(graph, collapsed = false) {
  return computeLayout(graph.nodes, graph.relationships, collapsed,
    (name, writesState, mismatch) => mismatch ? 190 : 100, () => 80, () => 120, new Set(), graph.missingFunctions);
}

test("separates missing functions from actual members and container statuses", () => {
  const input = review();
  const original = structuredClone(input);
  const graph = filterGraph(input, true, false);
  assert.deepEqual(graph.missingFunctions.map((node) => node.changeType), ["added", "modified", "deleted"]);
  assert.deepEqual(graph.containers.map((container) => [container.id, container.changeType]), [["service", "new"]]);
  assert.deepEqual(graph.containers[0].functions.map((node) => node.id), ["actual"]);
  assert.equal(graph.containers[0].functions[0]["hld-change-mismatch"], true);
  assert.deepEqual(input, original);
});

test("marks containers with any mismatching child, including filtered and missing functions", () => {
  const input = review();
  input.nodes[0].changeType = "unchanged";
  input.nodes.push({ ...input.nodes[0], id: "service-visible", name: "visible", changeType: "added", "hld-change-mismatch": false });
  input.nodes.push({ ...input.nodes[0], id: "other-visible", name: "other", containerId: "other", changeType: "added", "hld-change-mismatch": false });
  input.containers.push({ id: "matching", name: "Matching", type: "class", sourceFile: "src/Matching.ts" });
  input.nodes.push({ ...input.nodes[0], id: "matching-visible", name: "matching", containerId: "matching", changeType: "added", "hld-change-mismatch": false });
  const graph = filterGraph(input, false, false);
  assert.deepEqual(graph.containers.map((container) => [container.id, container.hldMismatch]), [
    ["service", true], ["other", true], ["matching", false],
  ]);
  assert.deepEqual(graph.containers.find((container) => container.id === "service").functions.map((node) => node.id), ["service-visible"]);
});

test("groups missing functions from different owners to the left in expanded and collapsed views", () => {
  const graph = filterGraph(review(), false, false);
  for (const collapsed of [false, true]) {
    const layout = layoutFor(graph, collapsed);
    const missingRects = graph.missingFunctions.map((node) => layout.missingFunctionRects.get(node.id));
    assert.equal(new Set(missingRects.map((rect) => rect.x)).size, 1);
    for (const [index, rect] of missingRects.entries()) {
      assert.ok([...layout.boxes.values()].every((box) => rect.x + rect.width < box.x));
      if (index > 0) assert.ok(missingRects[index - 1].y + missingRects[index - 1].height < rect.y);
      assert.ok(rect.y + rect.height <= layout.height);
      assert.equal(layout.memberRects.has(graph.missingFunctions[index].id), false);
    }
    assert.equal(layout.memberRects.has("actual"), !collapsed);
  }
});

test("lays out reviews containing only missing functions without empty owner boxes", () => {
  const input = review();
  input.nodes = input.nodes.filter((node) => node.subtype === "missing-from-cr");
  const graph = filterGraph(input, false, false);
  for (const collapsed of [false, true]) {
    const layout = layoutFor(graph, collapsed);
    assert.deepEqual(graph.nodes, []);
    assert.equal(layout.boxes.size, 0);
    assert.equal(layout.missingFunctionRects.size, input.nodes.length);
    for (const rect of layout.missingFunctionRects.values()) {
      assert.ok(rect.x + rect.width <= layout.width);
      assert.ok(rect.y + rect.height <= layout.height);
    }
  }
});

test("applies initialization filtering to missing functions and keeps them when unchanged functions are hidden", () => {
  const input = review();
  input.nodes[1].initialization = true;
  const graph = filterGraph(input, false, true);
  assert.equal(graph.missingFunctions.length, 2);
  assert.ok(graph.missingFunctions.every((node) => !node.initialization));
  assert.equal(filterGraph(input, false, false).missingFunctions.length, 3);
});

test("reserves space for mismatch badges without overlapping neighboring functions", () => {
  const input = review();
  input.nodes.push({ ...input.nodes[0], id: "matching", name: "matches", "hld-change-mismatch": false });
  const graph = filterGraph(input, false, false);
  const layout = layoutFor(graph);
  const mismatch = layout.memberRects.get("actual");
  const matching = layout.memberRects.get("matching");
  assert.ok(mismatch.width > matching.width);
  assert.ok(mismatch.x + mismatch.width < matching.x);
  const owner = layout.boxes.get("service");
  assert.ok(matching.x + matching.width <= owner.x + owner.width);
});
