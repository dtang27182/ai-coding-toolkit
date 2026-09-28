import type { Rect } from "./types.ts";

interface Point {
  x: number;
  y: number;
}

export function routeEdge(
  from: Rect,
  to: Rect,
  startSpread = 0,
  endSpread = 0,
  obstacles: Rect[] = [],
): { path: string; start: Point; end: Point } {
  const widestSpread = Math.max(Math.abs(startSpread), Math.abs(endSpread));
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;
  let start: Point;
  let end: Point;
  let firstControl: Point;
  let lastControl: Point;
  if (from === to || (Math.abs(toCenterX - fromCenterX) < 1 && Math.abs(toCenterY - fromCenterY) < 1)) {
    start = { x: from.x + from.width * 0.34 + startSpread, y: from.y + from.height };
    end = { x: to.x + to.width * 0.66 + endSpread, y: to.y + to.height };
    const bow = 46 + widestSpread;
    firstControl = { x: start.x, y: start.y + bow };
    lastControl = { x: end.x, y: end.y + bow };
  } else if (toCenterY > from.y + from.height + 12 || toCenterY < from.y - 12) {
    const down = toCenterY > fromCenterY;
    start = { x: fromCenterX + startSpread, y: down ? from.y + from.height : from.y };
    end = { x: toCenterX + endSpread, y: down ? to.y : to.y + to.height };
    const bend = Math.max(36, Math.abs(end.y - start.y) / 2);
    firstControl = { x: start.x, y: down ? start.y + bend : start.y - bend };
    lastControl = { x: end.x, y: down ? end.y - bend : end.y + bend };
  } else {
    start = { x: fromCenterX + startSpread, y: from.y + from.height };
    end = { x: toCenterX + endSpread, y: to.y + to.height };
    const bend = 48 + Math.abs(end.x - start.x) / 8 + widestSpread;
    firstControl = { x: start.x, y: start.y + bend };
    lastControl = { x: end.x, y: end.y + bend };
  }

  const clearance = 20 + Math.min(10, widestSpread * 0.25);
  const blocked = expandObstacles(obstacles, clearance);
  let path: string;
  if (curveBlocked([start, firstControl, lastControl, end], blocked)) {
    const departure = Math.sign(firstControl.y - start.y);
    const arrival = Math.sign(lastControl.y - end.y);
    path = curvedPath(detour(start, end, departure, arrival, blocked, clearance), departure, arrival, obstacles, clearance);
  } else {
    path = `M ${start.x} ${start.y} C ${firstControl.x} ${firstControl.y} ${lastControl.x} ${lastControl.y} ${end.x} ${end.y}`;
  }
  return { path, start, end };
}

function expandObstacles(obstacles: Rect[], clearance: number): Rect[] {
  return obstacles.map((box) => ({
    x: box.x - clearance,
    y: box.y - clearance,
    width: box.width + clearance * 2,
    height: box.height + clearance * 2,
  }));
}

function segmentBlocked(from: Point, to: Point, obstacles: Rect[]): boolean {
  return obstacles.some((box) =>
    from.x === to.x
      ? from.x > box.x && from.x < box.x + box.width && Math.max(from.y, to.y) > box.y && Math.min(from.y, to.y) < box.y + box.height
      : from.y > box.y && from.y < box.y + box.height && Math.max(from.x, to.x) > box.x && Math.min(from.x, to.x) < box.x + box.width,
  );
}

function curveBlocked(points: Point[], obstacles: Rect[], depth = 0): boolean {
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const intersecting = obstacles.filter((box) => left < box.x + box.width && right > box.x && top < box.y + box.height && bottom > box.y);
  if (intersecting.length === 0) {
    return false;
  } else if (depth === 12) {
    return true;
  } else {
    const halves = [points[0]];
    const ends = [points[3]];
    let level = points;
    while (level.length > 1) {
      level = level.slice(1).map((point, index) => ({ x: (level[index].x + point.x) / 2, y: (level[index].y + point.y) / 2 }));
      halves.push(level[0]);
      ends.unshift(level[level.length - 1]);
    }
    return curveBlocked(halves, intersecting, depth + 1) || curveBlocked(ends, intersecting, depth + 1);
  }
}

function detour(start: Point, end: Point, departure: number, arrival: number, obstacles: Rect[], clearance: number): Point[] {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((box) => [box.x, box.x + box.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, start.y + departure * clearance, end.y + arrival * clearance, ...obstacles.flatMap((box) => [box.y, box.y + box.height])])].sort((a, b) => a - b);
  const points = xs.flatMap((x) => ys.map((y) => ({ x, y })));
  const startIndex = xs.indexOf(start.x) * ys.length + ys.indexOf(start.y);
  const endIndex = xs.indexOf(end.x) * ys.length + ys.indexOf(end.y);
  const costs = Array<number>(points.length * 2).fill(Infinity);
  const previous = Array<number>(points.length * 2).fill(-1);
  const pending = new Set([startIndex * 2 + 1]);
  costs[startIndex * 2 + 1] = 0;
  let finish = -1;
  while (pending.size > 0) {
    let current = -1;
    let best = Infinity;
    for (const state of pending) {
      const point = points[Math.floor(state / 2)];
      const estimate = costs[state] + Math.abs(point.x - end.x) + Math.abs(point.y - end.y);
      if (estimate < best) {
        best = estimate;
        current = state;
      }
    }
    pending.delete(current);
    const pointIndex = Math.floor(current / 2);
    if (pointIndex === endIndex) {
      finish = current;
      break;
    }
    const xIndex = Math.floor(pointIndex / ys.length);
    const yIndex = pointIndex % ys.length;
    for (const [x, y, direction] of [[xIndex - 1, yIndex, 0], [xIndex + 1, yIndex, 0], [xIndex, yIndex - 1, 1], [xIndex, yIndex + 1, 1]]) {
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
      const nextIndex = x * ys.length + y;
      const from = points[pointIndex];
      const to = points[nextIndex];
      if (pointIndex === startIndex && (direction !== 1 || Math.sign(to.y - from.y) !== departure)) continue;
      if (nextIndex === endIndex && (direction !== 1 || Math.sign(from.y - to.y) !== arrival)) continue;
      if (segmentBlocked(from, to, obstacles)) continue;
      const state = nextIndex * 2 + direction;
      const cost = costs[current] + Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + (current % 2 === direction ? 0 : 16);
      if (cost < costs[state]) {
        costs[state] = cost;
        previous[state] = current;
        pending.add(state);
      }
    }
  }

  if (finish === -1) {
    throw new Error("No edge route avoids the unrelated entities.");
  } else {
    const path: Point[] = [];
    for (let state = finish; state !== -1; state = previous[state]) path.unshift(points[Math.floor(state / 2)]);
    return path;
  }
}

function curvedPath(points: Point[], departure: number, arrival: number, obstacles: Rect[], clearance: number): string {
  let knots = pathTurns(points);
  const blocked = expandObstacles(obstacles, clearance / 4);
  let curves = fitCurves(knots, departure, arrival, blocked, clearance)!;
  for (let start = 0; start < knots.length - 2; start += 1) {
    for (let end = knots.length - 1; end > start + 1; end -= 1) {
      const candidate = [...knots.slice(0, start + 1), ...knots.slice(end)];
      const fitted = fitCurves(candidate, departure, arrival, blocked, clearance);
      if (fitted !== undefined) {
        knots = candidate;
        curves = fitted;
        break;
      }
    }
  }
  return `M ${knots[0].x} ${knots[0].y} ${curves.map((curve) => `C ${curve.slice(1).map((point) => `${point.x} ${point.y}`).join(" ")}`).join(" ")}`;
}

function fitCurves(points: Point[], departure: number, arrival: number, obstacles: Rect[], clearance: number): Point[][] | undefined {
  const tangents = points.map((_, index) => {
    if (index === 0) {
      return { x: 0, y: departure };
    } else if (index === points.length - 1) {
      return { x: 0, y: -arrival };
    } else {
      const x = points[index + 1].x - points[index - 1].x;
      const y = points[index + 1].y - points[index - 1].y;
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    }
  });
  const curves: Point[][] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    let handle = Math.hypot(to.x - from.x, to.y - from.y) / 3;
    const minimum = Math.min(handle, clearance / 2);
    let curve: Point[];
    while (true) {
      curve = [
        from,
        { x: from.x + tangents[index].x * handle, y: from.y + tangents[index].y * handle },
        { x: to.x - tangents[index + 1].x * handle, y: to.y - tangents[index + 1].y * handle },
        to,
      ];
      if (!curveBlocked(curve, obstacles)) break;
      if (handle === minimum) return undefined;
      handle = Math.max(minimum, handle / 2);
    }
    curves.push(curve);
  }
  return curves;
}

function pathTurns(points: Point[]): Point[] {
  const turns: Point[] = [];
  for (const point of points) {
    if (turns.length >= 2) {
      const previous = turns[turns.length - 2];
      const current = turns[turns.length - 1];
      if ((previous.x === current.x && current.x === point.x) || (previous.y === current.y && current.y === point.y)) turns.pop();
    }
    turns.push(point);
  }
  return turns;
}
