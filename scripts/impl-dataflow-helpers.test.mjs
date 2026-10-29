import assert from "node:assert/strict";
import test from "node:test";

import { dataflowEdges } from "../common/impl-dataflow/visualizer/src/edges.ts";
import { filterGraph } from "../common/impl-dataflow/visualizer/src/filter.ts";
import { computeLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { routeEdge } from "../common/impl-dataflow/visualizer/src/routing.ts";

function fn(id, containerId = "service", helperOf) {
  return { id, name: id, type: "function", containerId, sourceFile: "src/service.ts", changeType: "modified", changeSummary: id, initialization: false, ...(helperOf === undefined ? {} : { helperOf }) };
}

function flow(from, to, transferType = "arguments") {
  return { type: "dataflow", from: { nodeId: from, type: "function" }, to: { nodeId: to, type: "function" }, transferType, dataDescription: "value", purpose: "Process value", changeType: "modified" };
}

function graph() {
  return {
    schemaVersion: 18,
    stage: "high-level-design",
    containers: [
      { id: "service", name: "Service", type: "class", sourceFile: "src/service.ts" },
      { id: "worker", name: "Worker", type: "class", sourceFile: "src/worker.ts" },
    ],
    nodes: [fn("root"), fn("child", "service", "root"), fn("grandchild", "service", "child"), fn("peer"), fn("downstream", "worker")],
    relationships: [flow("root", "child"), flow("child", "grandchild"), flow("grandchild", "peer"), flow("root", "downstream")],
  };
}

function layout(visible) {
  return computeLayout(visible.nodes, visible.relationships, false, (_name, _writesState, _mismatch, hasHelpers) => hasHelpers ? 115 : 80, () => 80, () => 100, new Set(), [], visible.expandedHelperGroups, visible.helperGroups);
}

test("Hide helpers folds descendants and reroutes their external relationships to the parent", () => {
  const visible = filterGraph(graph(), true);
  assert.deepEqual(visible.containers[0].functions.map((node) => node.id), ["root", "peer"]);
  assert.deepEqual(visible.helperGroups.get("root").map(({ node, parentId, depth }) => [node.id, parentId, depth]), [
    ["child", "root", 1],
    ["grandchild", "child", 2],
  ]);
  assert.deepEqual(visible.relationships.map((item) => item.relationship), graph().relationships.slice(2));
  assert.deepEqual(visible.relationships.map((item) => [item.from.nodeId, item.to.nodeId]), [["root", "peer"], ["root", "downstream"]]);
  assert.equal(dataflowEdges(visible.relationships, false).length, 2);
});

test("a UI component connected only to collapsed helpers remains visible and points to their parent", () => {
  const input = graph();
  input.nodes.push({ id: "provider-page", name: "Provider-selection page", type: "ui-component", location: "ProviderSelectionPage", changeType: "modified", changeSummary: "Page action", initialization: false });
  input.relationships = [
    { type: "dataflow", from: { nodeId: "provider-page", type: "ui-component" }, to: { nodeId: "child", type: "function" }, dataDescription: "select_openai event", purpose: "Handle selection", changeType: "modified" },
    { type: "dataflow", from: { nodeId: "grandchild", type: "function" }, to: { nodeId: "provider-page", type: "ui-component" }, dataDescription: "page update", purpose: "Show selection", changeType: "modified" },
  ];
  const folded = filterGraph(input, true);
  assert.deepEqual(folded.components.filter((node) => node.nodeId === "provider-page").map((node) => node.uiDirection), ["read", "write"]);
  assert.deepEqual(folded.relationships.map((item) => [item.from.nodeId, item.to.nodeId]), [["provider-page", "root"], ["root", "provider-page"]]);
  assert.equal(dataflowEdges(folded.relationships, false).length, 2);
  assert.deepEqual(folded.relationships.map((item) => item.relationship), input.relationships);

  const expanded = filterGraph(input, true, true, true, new Set(["root"]));
  assert.deepEqual(expanded.relationships.map((item) => [item.from.nodeId, item.to.nodeId]), [["provider-page", "child"], ["grandchild", "provider-page"]]);
});

test("folding helpers preserves merged dataflows in the collapsed container view", () => {
  const input = graph();
  input.relationships.push(flow("child", "downstream"));
  const folded = filterGraph(input, true);
  const merged = dataflowEdges(folded.relationships, true);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].relationships.map((item) => item.relationship), [input.relationships[3], input.relationships[4]]);
  assert.deepEqual(merged[0].relationships.map((item) => item.from.nodeId), ["root", "root"]);

  const expanded = filterGraph(input, true, true, true, new Set(["root"]));
  assert.equal(dataflowEdges(expanded.relationships, false).filter((edge) => edge.forward.to.nodeId === "downstream").length, 2);
});

test("turning Hide helpers off restores the original graph without helper grouping", () => {
  const visible = filterGraph(graph(), true, true, false);
  assert.deepEqual(visible.containers[0].functions.map((node) => node.id), ["root", "child", "grandchild", "peer"]);
  assert.equal(visible.helperGroups.size, 0);
  assert.equal(visible.relationships.length, 4);
  assert.equal(dataflowEdges(visible.relationships, false).length, 4);
  const rects = layout(visible).memberRects;
  assert.equal(rects.get("root").y, rects.get("child").y);
  assert.equal(rects.get("root").y, rects.get("grandchild").y);
});

test("expanding a parent lays helpers beside it and draws their calls as ordinary edges", () => {
  const input = graph();
  const folded = filterGraph(input, true);
  const expanded = filterGraph(input, true, true, true, new Set(["root"]));
  assert.deepEqual(expanded.containers[0].functions.map((node) => node.id), ["root", "child", "grandchild", "peer"]);
  assert.equal(dataflowEdges(expanded.relationships, false).length, 4);

  const foldedLayout = layout(folded);
  const expandedLayout = layout(expanded);
  assert.equal(foldedLayout.helperFrameRects.size, 0);
  assert.equal(foldedLayout.memberRects.get("root").width, 115);
  const root = expandedLayout.memberRects.get("root");
  const child = expandedLayout.memberRects.get("child");
  const grandchild = expandedLayout.memberRects.get("grandchild");
  const frame = expandedLayout.helperFrameRects.get("root");
  for (const rect of [root, child, grandchild]) {
    assert.ok(frame.x < rect.x && frame.y < rect.y);
    assert.ok(frame.x + frame.width > rect.x + rect.width);
    assert.ok(frame.y + frame.height > rect.y + rect.height);
  }
  const service = expandedLayout.boxes.get("service");
  assert.ok(frame.x > service.x && frame.y > service.y);
  assert.ok(frame.x + frame.width < service.x + service.width);
  assert.ok(frame.y + frame.height < service.y + service.height);
  assert.ok(child.x > root.x && grandchild.x > child.x);
  assert.equal(child.y, root.y);
  assert.equal(grandchild.y, root.y);
  assert.equal(service.height, foldedLayout.boxes.get("service").height);
  assert.equal(expandedLayout.boxes.get("worker").y, foldedLayout.boxes.get("worker").y);
  assert.ok(expandedLayout.memberRects.get("peer").x > foldedLayout.memberRects.get("peer").x);
  assert.ok(expandedLayout.boxes.get("service").width >= grandchild.x + grandchild.width - expandedLayout.boxes.get("service").x);
  assert.match(routeEdge(root, child).path, /^M /);
  assert.match(routeEdge(child, grandchild).path, /^M /);
  assert.match(routeEdge(grandchild, expandedLayout.memberRects.get("peer")).path, /^M /);
  assert.match(routeEdge(root, expandedLayout.memberRects.get("downstream"), 0, [child, grandchild]).path, /^M /);
});

test("several parents can be expanded independently", () => {
  const input = graph();
  input.nodes.splice(3, 0, fn("second"), fn("second-helper", "service", "second"));
  input.relationships.push(flow("second", "second-helper"));
  const one = filterGraph(input, true, true, true, new Set(["root"]));
  assert.equal(one.containers[0].functions.some((node) => node.id === "second-helper"), false);
  const both = filterGraph(input, true, true, true, new Set(["root", "second"]));
  assert.equal(both.containers[0].functions.some((node) => node.id === "second-helper"), true);
  const bothLayout = layout(both);
  assert.ok(bothLayout.memberRects.get("second-helper").x > bothLayout.memberRects.get("second").x);
  assert.equal(bothLayout.memberRects.get("second-helper").y, bothLayout.memberRects.get("second").y);
  assert.deepEqual([...bothLayout.helperFrameRects.keys()], ["root", "second"]);
  const firstFrame = bothLayout.helperFrameRects.get("root");
  const secondFrame = bothLayout.helperFrameRects.get("second");
  assert.ok(firstFrame.x + firstFrame.width < secondFrame.x);
});

test("a wide helper row leaves room for its dataflow curves below", () => {
  const input = graph();
  input.nodes = [fn("root"), ...Array.from({ length: 6 }, (_, index) => fn(`helper-${index}`, "service", "root")), fn("downstream", "worker")];
  input.relationships = [flow("root", "helper-5"), flow("root", "downstream")];
  const folded = layout(filterGraph(input, true));
  const expanded = layout(filterGraph(input, true, true, true, new Set(["root"])));
  assert.equal(expanded.boxes.get("service").height, folded.boxes.get("service").height);
  assert.ok(expanded.boxes.get("worker").y > folded.boxes.get("worker").y);
  assert.ok(expanded.memberRects.get("helper-5").x > expanded.memberRects.get("helper-0").x);
});

test("an expanded parent can still route a state update beside its helper", () => {
  const input = graph();
  input.nodes.push({ id: "state", name: "state", type: "state-variable", containerId: "service", sourceFile: "src/service.ts", changeType: "modified", changeSummary: "state", initialization: false });
  input.relationships.push({ type: "dataflow", from: { nodeId: "root", type: "function" }, to: { nodeId: "state", type: "state-variable" }, dataDescription: "state", purpose: "Update state", changeType: "modified" });
  const visible = filterGraph(input, true, true, true, new Set(["root"]));
  const rects = layout(visible).memberRects;
  const root = rects.get("root");
  assert.match(routeEdge(root, rects.get("state"), 0, [rects.get("child"), rects.get("grandchild")]).path, /^M /);
});

test("a helper disappears when its nonhelper parent is filtered out", () => {
  const input = graph();
  input.nodes[0].changeType = "unchanged";
  input.relationships = [];
  const visible = filterGraph(input, false);
  assert.deepEqual(visible.containers[0].functions.map((node) => node.id), ["peer"]);
  assert.equal(visible.helperGroups.size, 0);
});

test("cyclic helper pointers remain visible without a fold target", () => {
  const input = graph();
  input.nodes[0].helperOf = "child";
  const visible = filterGraph(input, true);
  assert.deepEqual(visible.containers[0].functions.map((node) => node.id), ["root", "child", "grandchild", "peer"]);
  assert.equal(visible.helperGroups.size, 0);
});
