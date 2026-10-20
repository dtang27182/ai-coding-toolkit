import type { GraphComponent } from "./filter.ts";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function tokenLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function boundaryPoint(box: Rect, toward: Point): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const tx = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Edge-to-edge pairing link, bowed away from straight dataflows. */
export function linkPath(from: Rect, to: Rect): { d: string; start: Point; end: Point } {
  const start = boundaryPoint(from, { x: to.x + to.width / 2, y: to.y + to.height / 2 });
  const end = boundaryPoint(to, { x: from.x + from.width / 2, y: from.y + from.height / 2 });
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const control = { x: (start.x + end.x) / 2 - dy * 0.08, y: (start.y + end.y) / 2 + dx * 0.08 };
  const round = (value: number): number => Math.round(value * 100) / 100;
  return {
    d: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
    start,
    end,
  };
}

export interface UiPair {
  label: string;
  read: GraphComponent;
  write: GraphComponent;
}

export function findUiPairs(components: readonly GraphComponent[]): UiPair[] {
  const writes = new Map(components.filter((node) => node.uiDirection === "write").map((node) => [node.nodeId, node]));
  return components.filter((node) => node.uiDirection === "read" && writes.has(node.nodeId))
    .map((read, index) => ({ label: tokenLabel(index), read, write: writes.get(read.nodeId)! }));
}
