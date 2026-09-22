import assert from "node:assert/strict";
import test from "node:test";
import { flowPanelEntries } from "../hld-gen/visualizer/src/types.ts";

test("flow panel preserves authored flow order, step order, ids, and text", () => {
  const input = {
    userFlows: [
      { name: "Second alphabetically", steps: [{ id: 7, text: "First authored step" }, { id: 3, text: "Next authored step" }] },
      { name: "Another flow", steps: [{ id: 1, text: "An independent flow" }] },
    ],
  };
  const original = structuredClone(input);
  assert.deepEqual(flowPanelEntries(input), original.userFlows);
  assert.deepEqual(input, original);
});

test("flow panel handles missing and empty user flows", () => {
  assert.deepEqual(flowPanelEntries({}), []);
  assert.deepEqual(flowPanelEntries({ userFlows: [] }), []);
});
