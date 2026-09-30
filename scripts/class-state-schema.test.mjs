import assert from "node:assert/strict";
import test from "node:test";

import { computeLayout as computeNewLayout } from "../common/impl-dataflow/visualizer/src/layout.ts";
import { isInternalStateRelationship, resolveEndpoint as resolveNewEndpoint } from "../common/impl-dataflow/visualizer/src/types.ts";

test("hld-gen-new collapsed layout hides class internals", () => {
  const nodes = [{
    name: "ChangeModel",
    changeType: "added",
    functions: [{ name: "applyChanges", changeType: "added", userFlow: true }],
    stateVariables: [{ name: "changes", changeType: "added", userFlow: true }],
  }];
  const layout = computeNewLayout(nodes, [], true, () => 80, () => 90, () => 160, new Set());

  assert.equal(layout.functionRects.size, 0);
  assert.equal(layout.stateRects.size, 0);
});

test("hld-gen-new identifies only same-class state relationships as internal", () => {
  const relationship = (type, from, to) => ({
    relationship: { type },
    from: resolveNewEndpoint(from),
    to: resolveNewEndpoint(to),
  });

  assert.equal(isInternalStateRelationship(relationship("state-update", { class: "Model", function: "write" }, { class: "Model", stateVariable: "value" })), true);
  assert.equal(isInternalStateRelationship(relationship("state-read", { class: "Model", stateVariable: "value" }, { class: "Model", function: "read" })), true);
  assert.equal(isInternalStateRelationship(relationship("state-update", { class: "Controller", function: "write" }, { class: "Model", stateVariable: "value" })), false);
  assert.equal(isInternalStateRelationship(relationship("dataflow", { class: "Model", function: "first" }, { class: "Model", function: "second" })), false);
});
