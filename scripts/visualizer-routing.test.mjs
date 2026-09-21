import assert from "node:assert/strict";
import test from "node:test";
import { edgePortSpreads, routeCompositionEdge, routeEdge } from "../hld-gen/visualizer/src/routing.ts";

function pathPoints(path) {
  const commands = path.match(/[MLC][^MLC]*/g);
  const points = [];
  for (const command of commands) {
    const values = command.slice(1).trim().split(/\s+/).map(Number);
    if (command[0] === "M" || command[0] === "L") {
      points.push({ x: values[0], y: values[1] });
    } else if (command[0] === "C") {
      const start = points.at(-1);
      for (let sample = 1; sample <= 1024; sample += 1) {
        const t = sample / 1024;
        points.push({
          x: (1 - t) ** 3 * start.x + 3 * (1 - t) ** 2 * t * values[0] + 3 * (1 - t) * t ** 2 * values[2] + t ** 3 * values[4],
          y: (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * values[1] + 3 * (1 - t) * t ** 2 * values[3] + t ** 3 * values[5],
        });
      }
    }
  }
  return points;
}

function assertAvoids(path, obstacles) {
  const points = pathPoints(path);
  for (const [index, from] of points.slice(0, -1).entries()) {
    const to = points[index + 1];
    for (const box of obstacles) {
      // Clip the segment to the rectangle, then check whether it enters the interior.
      let enter = 0;
      let exit = 1;
      for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
        const delta = to[axis] - from[axis];
        if (delta === 0) {
          if (from[axis] <= box[axis] || from[axis] >= box[axis] + box[size]) exit = -1;
        } else {
          const first = (box[axis] - from[axis]) / delta;
          const last = (box[axis] + box[size] - from[axis]) / delta;
          enter = Math.max(enter, Math.min(first, last));
          exit = Math.min(exit, Math.max(first, last));
        }
      }
      assert.ok(enter >= exit, `Edge crosses ${JSON.stringify(box)}: ${path}`);
    }
  }
}

function assertVertical(route, from, to) {
  const commands = route.path.match(/[MLC][^MLC]*/g);
  const first = commands[1].slice(1).trim().split(/\s+/).map(Number);
  const last = commands.at(-1).slice(1).trim().split(/\s+/).map(Number);
  const previous = commands.at(-2).slice(1).trim().split(/\s+/).map(Number);
  const arrivalX = commands.at(-1)[0] === "C" ? last[2] : previous.at(-2);
  const arrivalY = commands.at(-1)[0] === "C" ? last[3] : previous.at(-1);
  assert.equal(first[0], route.start.x);
  assert.equal(arrivalX, route.end.x);
  assert.ok(route.start.y === from.y || route.start.y === from.y + from.height);
  assert.ok(route.end.y === to.y || route.end.y === to.y + to.height);
  assert.ok(route.start.y === from.y ? first[1] < route.start.y : first[1] > route.start.y);
  assert.ok(route.end.y === to.y ? arrivalY < route.end.y : arrivalY > route.end.y);
  assertSmooth(route.path);
}

function assertSmooth(path) {
  let position;
  let tangent;
  for (const command of path.match(/[MLC][^MLC]*/g)) {
    const values = command.slice(1).trim().split(/\s+/).map(Number);
    const end = { x: values.at(-2), y: values.at(-1) };
    if (command[0] !== "M") {
      const startTangent = { x: values[0] - position.x, y: values[1] - position.y };
      const endTangent = command[0] === "C" ? { x: end.x - values[2], y: end.y - values[3] } : startTangent;
      if (Math.hypot(startTangent.x, startTangent.y) > 0) {
        if (tangent) {
          assert.ok(Math.abs(tangent.x * startTangent.y - tangent.y * startTangent.x) < 1e-6, `Sharp corner: ${path}`);
          assert.ok(tangent.x * startTangent.x + tangent.y * startTangent.y > 0, `Reversed tangent: ${path}`);
        }
        tangent = endTangent;
      }
    }
    position = end;
  }
}

test("routes past an unrelated middle class in both directions and display modes", () => {
  const obstacle = { x: 250, y: 200, width: 260, height: 100 };
  for (const height of [32, 82]) {
    const upper = { x: 240, y: 20, width: 200, height };
    const lower = { x: 240, y: 430, width: 200, height };
    for (const [from, to] of [[upper, lower], [lower, upper]]) {
      for (const spread of [-8, -4, 0, 4, 8]) {
        const route = routeEdge(from, to, spread, [obstacle]);
        assertAvoids(route.path, [obstacle]);
        assertVertical(route, from, to);
      }
    }
  }
});

test("routes around multiple staggered obstacles", () => {
  const from = { x: 240, y: 0, width: 200, height: 32 };
  const to = { x: 240, y: 700, width: 200, height: 32 };
  const obstacles = [
    { x: 100, y: 120, width: 300, height: 80 },
    { x: 320, y: 270, width: 320, height: 100 },
    { x: 80, y: 450, width: 290, height: 90 },
  ];
  const route = routeEdge(from, to, 0, obstacles);
  assertAvoids(route.path, obstacles);
  assertVertical(route, from, to);
});

test("detours bend throughout the route instead of joining straight runs with rounded elbows", () => {
  const from = { x: 0, y: 400, width: 200, height: 32 };
  const to = { x: 900, y: 0, width: 200, height: 32 };
  const obstacles = [{ x: 650, y: 150, width: 300, height: 120 }];
  const route = routeEdge(from, to, 0, obstacles);
  assertAvoids(route.path, obstacles);
  assertVertical(route, from, to);
  let start = route.start;
  for (const command of route.path.match(/[LC][^MLC]*/g)) {
    const values = command.slice(1).trim().split(/\s+/).map(Number);
    const end = { x: values.at(-2), y: values.at(-1) };
    const chord = { x: end.x - start.x, y: end.y - start.y };
    const bends = values.slice(0, -2).some((value, index) => index % 2 === 0 &&
      Math.abs((value - start.x) * chord.y - (values[index + 1] - start.y) * chord.x) > 1e-6);
    assert.ok(bends, `Straight section in a detour: ${command}`);
    start = end;
  }
});

test("keeps same-row connections and self-loops clear of components", () => {
  const from = { x: 0, y: 0, width: 200, height: 32 };
  for (const [to, obstacle] of [
    [{ x: 500, y: 0, width: 200, height: 32 }, { x: 260, y: 70, width: 180, height: 70 }],
    [from, { x: 90, y: 60, width: 20, height: 10 }],
  ]) {
    const route = routeEdge(from, to, 0, [obstacle]);
    assertAvoids(route.path, [obstacle]);
    assertVertical(route, from, to);
  }
});

test("routes composition edges around unrelated boxes", () => {
  const from = { x: 0, y: 0, width: 200, height: 80 };
  const to = { x: 400, y: 400, width: 200, height: 80 };
  const obstacles = [{ x: 200, y: 180, width: 150, height: 100 }];
  const path = routeCompositionEdge(from, to, obstacles);
  const points = pathPoints(path);
  assertAvoids(path, obstacles);
  assert.equal(points[0].x, points[1].x);
  assert.equal(points.at(-1).x, points.at(-2).x);
  assert.equal(points[0].y, from.y + from.height);
  assert.equal(points.at(-1).y, to.y);
});

test("preserves unobstructed curves and distinct same-row fan-out", () => {
  const from = { x: 0, y: 0, width: 200, height: 32 };
  const paths = [];
  for (const [index, x] of [400, 700, 1000, 1300].entries()) {
    const to = { x, y: 0, width: 200, height: 32 };
    const spread = (index - 2) * 4;
    const route = routeEdge(from, to, spread, [{ x: 0, y: -400, width: 200, height: 100 }]);
    assert.equal(route.path, routeEdge(from, to, spread).path);
    assertVertical(route, from, to);
    paths.push(route.path);
  }
  assert.equal(new Set(paths).size, 4);
});

test("spaces dense fan-in and fan-out at their shared entities", () => {
  const source = { x: 200, y: 0, width: 200, height: 32 };
  const target = { x: 200, y: 500, width: 200, height: 32 };
  const fanOutTargets = [0, 150, 300, 450].map((x) => ({ x, y: 250, width: 100, height: 32 }));
  const fanInSources = [0, 150, 300, 450].map((x) => ({ x, y: 250, width: 100, height: 32 }));
  const edges = [
    ...fanOutTargets.map((to, index) => ({ fromKey: "source", toKey: `out-${index}`, from: source, to })),
    ...fanInSources.map((from, index) => ({ fromKey: `in-${index}`, toKey: "target", from, to: target })),
  ];
  const spreads = edgePortSpreads(edges);
  const fanOutStarts = fanOutTargets.map((to, index) => routeEdge(source, to, spreads[index]).start.x);
  const fanInEnds = fanInSources.map((from, index) => routeEdge(from, target, spreads[index + fanOutTargets.length]).end.x);

  assert.deepEqual(fanOutStarts, [276, 292, 308, 324]);
  assert.deepEqual(fanInEnds, [276, 292, 308, 324]);
});
