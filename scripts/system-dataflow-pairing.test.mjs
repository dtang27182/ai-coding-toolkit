import assert from "node:assert/strict";
import test from "node:test";
import { findPairs, linkPath, partnersOf, tokenLabel } from "../common/sys-dataflow/visualizer/src/pairing.ts";

function node(type, name, location) {
  return { type, name, location, medium: "Shared medium", description: name };
}

const nodes = [
  node("user-input", "Choose model", "ModelSelector"),
  node("user-input", "Submit chat", "ChatInput"),
  node("system-state-read", "Read conversation", "Conversation"),
  node("system-state-read", "Read model", "selectedModelId"),
  node("system-state-write", "Write model", "selectedModelId"),
  node("user-output", "Show model selector", "ModelSelector"),
  node("data-processing", "Apply selection", "applySelection"),
];

test("pairs follow document order and exclude nodes without a visible partner", () => {
  const pairs = findPairs(nodes);
  assert.deepEqual(pairs.map((pair) => [pair.label, pair.members.map((node) => node.name)]), [
    ["A", ["Choose model", "Show model selector"]],
    ["B", ["Read model", "Write model"]],
  ]);
  const filtered = findPairs(nodes.filter((node) => node.name !== "Show model selector"));
  assert.deepEqual(filtered.map((pair) => pair.members.map((node) => node.name)), [["Read model", "Write model"]]);
  assert.equal(filtered[0].label, "A");
});

test("focus finds every other member, including repeated reads", () => {
  const repeated = [...nodes, node("system-state-read", "Read model again", "selectedModelId")];
  const pairs = findPairs(repeated);
  assert.deepEqual(partnersOf(pairs, repeated[4].name).map((node) => node.name), ["Read model", "Read model again"]);
  assert.deepEqual(partnersOf(pairs, repeated[6].name), []);
});

test("pair letters continue beyond Z", () => {
  assert.deepEqual([0, 25, 26, 27, 51, 52].map(tokenLabel), ["A", "Z", "AA", "AB", "AZ", "BA"]);
});

const card = (x, y) => ({ x, y, width: 248, height: 92 });

test("links join the facing card edges with a bowed curve", () => {
  const from = card(1306, 96);
  const to = card(508, 512);
  const { start, end, d } = linkPath(from, to);
  assert.equal(start.y, from.y + from.height);
  assert.equal(end.y, to.y);
  assert.ok(start.x > from.x && start.x < from.x + from.width);
  assert.ok(end.x > to.x && end.x < to.x + to.width);
  assert.match(d, /^M [\d.]+ [\d.]+ Q [\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
});

test("horizontal and vertical links end on the facing edges", () => {
  const horizontal = linkPath(card(0, 0), card(500, 0));
  assert.deepEqual(horizontal.start, { x: 248, y: 46 });
  assert.deepEqual(horizontal.end, { x: 500, y: 46 });
  const vertical = linkPath(card(0, 0), card(0, 400));
  assert.deepEqual(vertical.start, { x: 124, y: 92 });
  assert.deepEqual(vertical.end, { x: 124, y: 400 });
});

test("pairing uses exact locations within each kind, never names or media", () => {
  const sameLocation = [
    node("user-input", "Input", "Shared"),
    node("system-state-read", "Read", "Shared"),
    node("static-data", "Static", "Shared"),
    node("external-dependency", "External", "Shared"),
    node("system-input", "System input", "Shared"),
    node("system-output", "System output", "Shared"),
  ];
  assert.deepEqual(findPairs(sameLocation), []);
  assert.deepEqual(findPairs(nodes.map((node, index) => ({ ...node, location: `Location ${index}` }))), []);
  const pairs = findPairs([
    ...sameLocation,
    node("user-output", "Output", "Shared"),
    node("system-state-write", "Write", "Shared"),
  ]);
  assert.deepEqual(pairs.map((pair) => pair.members.map((node) => node.name)), [["Input", "Output"], ["Read", "Write"]]);
});

test("repeated reads of the same state can form a group without a write", () => {
  const reads = [node("system-state-read", "First read", "State"), node("system-state-read", "Second read", "State")];
  assert.deepEqual(findPairs(reads)[0].members, reads);
});
