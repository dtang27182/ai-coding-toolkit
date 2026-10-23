import assert from "node:assert/strict";
import test from "node:test";

import { dataflowEdges, relationshipsForEdge } from "../common/sys-dataflow/visualizer/src/edges.ts";

function flow(id, from, to, changeType) {
  return { id, from, to, type: "dataflow", data: id, purpose: id, changeType };
}

test("pairs opposite dataflows between the same nodes and retains both for inspection", () => {
  const forward = flow("request", "Client", "Service", "added");
  const back = flow("response", "Service", "Client", "modified");
  for (const relationships of [[forward, back], [back, forward]]) {
    const edges = dataflowEdges(relationships);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].forward, relationships[0]);
    assert.equal(edges[0].back, relationships[1]);
    assert.deepEqual(relationshipsForEdge(relationships, forward.id), relationships);
    assert.deepEqual(relationshipsForEdge(relationships, back.id), relationships);
  }
});

test("each dataflow belongs to at most one pair", () => {
  const relationships = [
    flow("request-1", "Client", "Service"),
    flow("request-2", "Client", "Service"),
    flow("response", "Service", "Client"),
    flow("other", "Client", "Store"),
  ];
  const edges = dataflowEdges(relationships);
  assert.deepEqual(edges.map((edge) => edge.relationships.map((item) => item.id)), [
    ["request-1", "response"],
    ["request-2"],
    ["other"],
  ]);
  assert.equal(new Set(edges.flatMap((edge) => edge.relationships)).size, relationships.length);
});

test("self loops and filtered out responses remain separate", () => {
  const first = flow("first", "Cache", "Cache");
  const second = flow("second", "Cache", "Cache");
  assert.deepEqual(dataflowEdges([first, second]).map((edge) => edge.relationships), [[first], [second]]);

  const forward = flow("request", "Client", "Service", "added");
  const back = flow("response", "Service", "Client", "unchanged");
  assert.equal(dataflowEdges([forward, back]).length, 1);
  assert.deepEqual(dataflowEdges([forward]), [{ forward, back: undefined, relationships: [forward] }]);
  assert.deepEqual(relationshipsForEdge([forward], back.id), []);
});
