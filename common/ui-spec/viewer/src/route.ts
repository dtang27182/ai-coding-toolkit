/**
 * Obstacle-aware edge routing. Pure geometry, no DOM.
 *
 * An edge first tries its plain bezier curve. If that curve passes through any node other than its own
 * endpoints, it is routed instead: a shortest path with few bends over a sparse grid built from the
 * (inflated) node outlines, then drawn with large rounded corners so it still reads as a curve.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
/** A point on a node's outline plus the outward normal of that side. */
export interface Port extends Point { nx: number; ny: number }

/** Space kept between a routed edge and any node it passes. */
export const MARGIN = 32
/** How far an edge leaves its node straight along the port normal before it may turn. */
export const STUB = 18
const BEND_COST = 60

export function bezierControls(a: Port, b: Port) {
  const c = Math.max(40, Math.min(220, Math.hypot(b.x - a.x, b.y - a.y) * 0.42))
  return [{ x: a.x + a.nx * c, y: a.y + a.ny * c }, { x: b.x + b.nx * c, y: b.y + b.ny * c }] as const
}

export function bezierPoint(a: Point, c0: Point, c1: Point, b: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * b.y,
  }
}

export const stub = (p: Port): Point => ({ x: p.x + p.nx * STUB, y: p.y + p.ny * STUB })

interface Box { x0: number; y0: number; x1: number; y1: number }
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

export class Router {
  private boxes: Box[]
  private raw: Box[]
  private xs: number[]
  private ys: number[]
  private nodeCover: (number[] | null)[]
  private hCover: (number[] | null)[]
  private vCover: (number[] | null)[]

  /** `extra` points (edge stubs) are added to the grid so routes can start and end on them exactly. */
  constructor(obstacles: Rect[], extra: Point[], margin = MARGIN) {
    this.raw = obstacles.map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }))
    this.boxes = obstacles.map((r) => ({ x0: r.x - margin, y0: r.y - margin, x1: r.x + r.w + margin, y1: r.y + r.h + margin }))
    this.xs = gridLines([...this.boxes.flatMap((b) => [b.x0, b.x1]), ...extra.map((p) => p.x)])
    this.ys = gridLines([...this.boxes.flatMap((b) => [b.y0, b.y1]), ...extra.map((p) => p.y)])
    const { xs, ys } = this
    this.nodeCover = new Array(xs.length * ys.length)
    this.hCover = new Array(xs.length * ys.length)
    this.vCover = new Array(xs.length * ys.length)
    for (let j = 0; j < ys.length; j++) {
      for (let i = 0; i < xs.length; i++) {
        const k = j * xs.length + i
        this.nodeCover[k] = this.cover(xs[i], ys[j])
        this.hCover[k] = i + 1 < xs.length ? this.cover((xs[i] + xs[i + 1]) / 2, ys[j]) : null
        this.vCover[k] = j + 1 < ys.length ? this.cover(xs[i], (ys[j] + ys[j + 1]) / 2) : null
      }
    }
  }

  private cover(x: number, y: number, boxes = this.boxes): number[] | null {
    let hits: number[] | null = null
    boxes.forEach((b, i) => {
      if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) (hits ??= []).push(i)
    })
    return hits
  }

  /** True when no segment crosses a non-exempt node's real outline. */
  clear(points: Point[], exempt: ReadonlySet<number>): boolean {
    return points.slice(1).every((point, n) => this.raw.every((box, i) => {
      if (exempt.has(i)) return true
      const previous = points[n]
      let enter = 0, exit = 1
      for (const [start, delta, min, max] of [[previous.x, point.x - previous.x, box.x0, box.x1], [previous.y, point.y - previous.y, box.y0, box.y1]]) {
        if (delta === 0) {
          if (start <= min || start >= max) return true
        } else {
          enter = Math.max(enter, Math.min((min - start) / delta, (max - start) / delta))
          exit = Math.min(exit, Math.max((min - start) / delta, (max - start) / delta))
        }
      }
      return enter >= exit || enter >= 1 || exit <= 0
    }))
  }

  /** Route from port a to port b avoiding obstacles; `exempt` are the endpoint nodes' obstacle indices. */
  route(a: Port, b: Port, exempt: ReadonlySet<number>): Point[] | null {
    const { xs, ys } = this
    const W = xs.length
    const sa = stub(a), sb = stub(b)
    const near = (lines: number[], v: number) => lines.findIndex((l) => Math.abs(l - v) < 0.01)
    const si = near(xs, sa.x), sj = near(ys, sa.y), gi = near(xs, sb.x), gj = near(ys, sb.y)
    if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null
    // A stub that lands in a neighbour's margin (e.g. a method just under its backend tab) may use that
    // neighbour's margin, but never its outline.
    const soft = new Set([...(this.cover(sa.x, sa.y) ?? []), ...(this.cover(sb.x, sb.y) ?? [])])
    const raw = this.raw
    const blocked = (c: number[] | null, x: number, y: number) => !!c && c.some((i) =>
      !exempt.has(i) && (!soft.has(i) || (x > raw[i].x0 && x < raw[i].x1 && y > raw[i].y0 && y < raw[i].y1)))
    const dirOf = (dx: number, dy: number) => DIRS.findIndex(([x, y]) => x === Math.sign(dx) && y === Math.sign(dy))
    const startDir = dirOf(a.nx, a.ny)
    const goalDir = dirOf(-b.nx, -b.ny)
    const state = (i: number, j: number, d: number) => (j * W + i) * 4 + d
    const dist = new Float64Array(W * ys.length * 4).fill(Infinity)
    const prev = new Int32Array(W * ys.length * 4).fill(-1)
    const heap = new Heap()
    dist[state(si, sj, startDir)] = 0
    heap.push(0, state(si, sj, startDir))
    let best = -1
    let bestCost = Infinity
    while (heap.size) {
      const [cost, s] = heap.pop()
      if (cost > dist[s] || cost >= bestCost) continue
      const d = s % 4, cell = (s - d) / 4, i = cell % W, j = (cell - i) / W
      if (i === gi && j === gj) {
        const total = cost + (d === goalDir ? 0 : BEND_COST)
        if (total < bestCost) { bestCost = total; best = s }
        continue
      }
      for (let nd = 0; nd < 4; nd++) {
        const [dx, dy] = DIRS[nd]
        if (dx === -DIRS[d][0] && dy === -DIRS[d][1]) continue
        const ni = i + dx, nj = j + dy
        if (ni < 0 || nj < 0 || ni >= W || nj >= ys.length) continue
        const edgeCover = dx !== 0 ? this.hCover[j * W + Math.min(i, ni)] : this.vCover[Math.min(j, nj) * W + i]
        const goal = ni === gi && nj === gj
        const mx = (xs[i] + xs[ni]) / 2, my = (ys[j] + ys[nj]) / 2
        if (blocked(edgeCover, mx, my) || (!goal && blocked(this.nodeCover[nj * W + ni], xs[ni], ys[nj]))) continue
        const ns = state(ni, nj, nd)
        const nc = cost + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd === d ? 0 : BEND_COST)
        if (nc < dist[ns]) { dist[ns] = nc; prev[ns] = s; heap.push(nc, ns) }
      }
    }
    if (best < 0) return null
    const path: Point[] = []
    for (let s = best; s >= 0; s = prev[s]) {
      const cell = (s - (s % 4)) / 4
      path.push({ x: xs[cell % W], y: ys[Math.floor(cell / W)] })
    }
    path.reverse()
    return simplify([{ x: a.x, y: a.y }, ...path, { x: b.x, y: b.y }])
  }
}

/** Sorted unique grid lines, plus a line midway between each neighbouring pair so routes can run down the middle of gaps. */
function gridLines(values: number[]): number[] {
  const sorted = [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)
  const lines: number[] = []
  sorted.forEach((v, i) => {
    if (i > 0) lines.push((sorted[i - 1] + v) / 2)
    lines.push(v)
  })
  return lines
}

/** Drop repeated and collinear points. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const before = out[out.length - 2]
    if (before && last && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) out[out.length - 1] = p
    else out.push(p)
  }
  return out
}

/** Gap between parallel routed edges that would otherwise share a line. */
export const LANE_GAP = 16

/**
 * Pull apart routed paths that run along the same line (no two edges may fully overlap). Each path's stub
 * (STUB long, along the port normal) stays put; every other segment that shares a line and overlaps another
 * path's segment is moved sideways into its own lane, LANE_GAP apart. Mutates and returns the paths.
 */
export function separate(paths: Point[][], gap = LANE_GAP): Point[][] {
  // Split a long first/last segment so the part beyond the stub can move, joined by a short jog.
  for (const [n, path] of paths.entries()) {
    const out = [...path]
    const split = (from: Point, to: Point): Point | null => {
      const len = Math.hypot(to.x - from.x, to.y - from.y)
      return len > STUB + 1 ? { x: from.x + ((to.x - from.x) / len) * STUB, y: from.y + ((to.y - from.y) / len) * STUB } : null
    }
    const head = out.length > 1 ? split(out[0], out[1]) : null
    if (head) out.splice(1, 0, head, { ...head })
    const tail = out.length > 1 ? split(out[out.length - 1], out[out.length - 2]) : null
    if (tail) out.splice(out.length - 1, 0, { ...tail }, tail)
    paths[n] = out
  }
  interface Seg { path: number; k: number; horizontal: boolean; at: number; lo: number; hi: number; fixed: boolean }
  const segs: Seg[] = []
  for (const [n, path] of paths.entries()) {
    for (let k = 0; k + 1 < path.length; k++) {
      const [p, q] = [path[k], path[k + 1]]
      if (Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue
      const horizontal = Math.abs(p.y - q.y) < 0.01
      if (!horizontal && Math.abs(p.x - q.x) >= 0.01) continue
      const [a, b] = horizontal ? [p.x, q.x] : [p.y, q.y]
      segs.push({ path: n, k, horizontal, at: horizontal ? p.y : p.x, lo: Math.min(a, b), hi: Math.max(a, b), fixed: k === 0 || k + 2 === path.length })
    }
  }
  const lines = new Map<string, Seg[]>()
  for (const seg of segs) {
    const key = `${seg.horizontal ? 'h' : 'v'}${Math.round(seg.at)}`
    lines.set(key, [...(lines.get(key) ?? []), seg])
  }
  const shifts: [Seg, number][] = []
  for (const list of lines.values()) {
    list.sort((a, b) => a.lo - b.lo)
    // Clusters of segments from different paths whose ranges overlap.
    let cluster: Seg[] = []
    let end = -Infinity
    const flush = () => {
      const movable = cluster.filter((s) => !s.fixed)
      if (new Set(cluster.map((s) => s.path)).size > 1 && movable.length > 0) {
        const fixed = movable.length < cluster.length
        movable.forEach((seg, i) => {
          const lane = fixed ? (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 1) : i - (movable.length - 1) / 2
          if (lane !== 0) shifts.push([seg, lane * gap])
        })
      }
      cluster = []
    }
    for (const seg of list) {
      if (seg.lo >= end - 1) { flush(); end = -Infinity }
      cluster.push(seg)
      end = Math.max(end, seg.hi)
    }
    flush()
  }
  for (const [seg, offset] of shifts) {
    for (const point of [paths[seg.path][seg.k], paths[seg.path][seg.k + 1]]) {
      if (seg.horizontal) point.y += offset
      else point.x += offset
    }
  }
  for (const [n, path] of paths.entries()) paths[n] = simplify(path)
  return paths
}

/** SVG path through the points with corners rounded as much as the neighbouring segments allow. */
export function roundedPath(points: Point[], radius = 28): string {
  let d = `M${points[0].x},${points[0].y}`
  for (let k = 1; k < points.length - 1; k++) {
    const [p, c, n] = [points[k - 1], points[k], points[k + 1]]
    const lp = Math.hypot(c.x - p.x, c.y - p.y), ln = Math.hypot(n.x - c.x, n.y - c.y)
    const r = Math.min(radius, lp / 2, ln / 2)
    const a = { x: c.x - ((c.x - p.x) / lp) * r, y: c.y - ((c.y - p.y) / lp) * r }
    const b = { x: c.x + ((n.x - c.x) / ln) * r, y: c.y + ((n.y - c.y) / ln) * r }
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`
  }
  const last = points[points.length - 1]
  return `${d} L${last.x},${last.y}`
}

class Heap {
  private items: [number, number][] = []
  get size() { return this.items.length }
  push(priority: number, value: number) {
    const items = this.items
    items.push([priority, value])
    let i = items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (items[p][0] <= items[i][0]) break
      ;[items[p], items[i]] = [items[i], items[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const items = this.items
    const top = items[0]
    const last = items.pop()!
    if (items.length) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < items.length && items[l][0] < items[m][0]) m = l
        if (r < items.length && items[r][0] < items[m][0]) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i], items[m]]
        i = m
      }
    }
    return top
  }
}
