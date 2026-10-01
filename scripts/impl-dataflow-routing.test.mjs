import assert from "node:assert/strict";
import test from "node:test";

import { routeEdge } from "../common/impl-dataflow/visualizer/src/routing.ts";

test("routes a crowded edge beside an unrelated node", () => {
  const route = routeEdge(
    { x: 188, y: 800, width: 125, height: 32 },
    { x: 1242.5, y: 574, width: 164, height: 46 },
    { start: 32, end: -72 },
    [{ x: 981.5, y: 574, width: 197, height: 46 }],
  );

  assert.deepEqual(route.end, { x: 1252.5, y: 620 });
  assert.match(route.path, /^M .* C /);
});
