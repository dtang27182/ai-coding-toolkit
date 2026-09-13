import assert from "node:assert/strict";
import test from "node:test";
import { mergeClassDataflows, resolveEndpoint } from "../hld-gen/visualizer/src/types.ts";

function resolved(from, to, changeType = "added", type = "dataflow") {
  return { relationship: { from, to, changeType, type }, from: resolveEndpoint(from), to: resolveEndpoint(to) };
}

test("merges dataflows between the same classes regardless of methods and labels", () => {
  const relationships = [
    resolved({ class: "Source", method: "first" }, { class: "Target", method: "read" }),
    resolved({ class: "Source", method: "second" }, { class: "Target", method: "write" }),
  ];
  relationships[0].relationship.label = "first value";
  relationships[1].relationship.label = "second value";
  const original = structuredClone(relationships);
  const merged = mergeClassDataflows(relationships);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].from, { nodeName: "Source", component: false });
  assert.deepEqual(merged[0].to, { nodeName: "Target", component: false });
  assert.deepEqual(relationships, original, "Method-level relationships remain available for expanded view and the inspector");
});

test("keeps change types, directions, and different class pairs separate", () => {
  const from = { class: "Source", method: "send" };
  const to = { class: "Target", method: "receive" };
  const relationships = [
    ...["added", "modified", "deleted", "unchanged"].flatMap((changeType) => [
      resolved(from, to, changeType),
      resolved({ ...from, method: "sendAgain" }, to, changeType),
    ]),
    resolved(to, from),
    resolved(from, { class: "Other", method: "receive" }),
    resolved({ class: "Other", method: "send" }, to),
  ];
  const merged = mergeClassDataflows(relationships);
  assert.deepEqual(merged.map((item) => [item.from.nodeName, item.to.nodeName, item.relationship.changeType]), [
    ["Source", "Target", "added"],
    ["Source", "Target", "modified"],
    ["Source", "Target", "deleted"],
    ["Source", "Target", "unchanged"],
    ["Target", "Source", "added"],
    ["Source", "Other", "added"],
    ["Other", "Target", "added"],
  ]);
});

test("keeps state updates, composition, and component flows separate", () => {
  const relationships = [
    resolved({ class: "Source", method: "first" }, { class: "Target", method: "read" }),
    resolved({ class: "Source", method: "first" }, { class: "Target" }, "added", "state-update"),
    resolved({ class: "Source", method: "second" }, { class: "Target" }, "added", "state-update"),
    resolved({ class: "Source" }, { class: "Target" }, "added", "composition"),
    resolved({ class: "Source", method: "first" }, { component: "Panel" }),
    resolved({ class: "Source", method: "second" }, { component: "Panel" }),
    resolved({ component: "Panel" }, { class: "Target", method: "read" }),
    resolved({ component: "Panel" }, { class: "Target", method: "write" }),
  ];
  const merged = mergeClassDataflows(relationships);
  assert.equal(merged.length, relationships.length);
  assert.deepEqual(merged.slice(1), relationships.slice(1));
});
