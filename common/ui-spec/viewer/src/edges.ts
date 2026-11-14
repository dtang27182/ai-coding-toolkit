import { pageOf, type Edge, type EdgeKind, type Model } from './model.ts'

/** Drawable edges: model edges rerouted for collapsed pages, then merged. Pure, no DOM. */

export type Side = 'l' | 'r' | 't' | 'b'
export type Layer = EdgeKind

export interface DrawEdge {
  kind: EdgeKind
  /** Drawn node ids; an element inside a collapsed page is replaced by its page. */
  from: string
  to: string
  fromSide: Side
  toSide: Side
  /** Navigation edges attach to the target page's anchor (tab or collapsed node), not the frame. */
  toAnchor: boolean
  /** Model edges represented by this drawn edge. */
  members: Edge[]
  /** True when a member runs opposite to the drawn direction (a merged two-way edge). */
  back: boolean
}

/** Build drawable edges for the current set of collapsed pages, then merge pairs. */
export function drawableEdges(model: Model, collapsed: ReadonlySet<string>): DrawEdge[] {
  return mergeEdges(model, buildEdges(model, collapsed))
}

export function buildEdges(model: Model, collapsed: ReadonlySet<string>): DrawEdge[] {
  const drawn = (id: string) => {
    const page = pageOf(model, id)
    return page !== undefined && collapsed.has(page) ? `p:${page}` : id
  }
  return model.edges.map((edge) => {
    const from = drawn(edge.from)
    const to = edge.kind === 'nav' ? edge.to : drawn(edge.to)
    const fromPage = from.startsWith('p:')
    const toPage = to.startsWith('p:')
    let sides: [Side, Side]
    if (edge.kind === 'nav') {
      sides = ['r', 'l']
    } else if (edge.kind === 'methodCall') {
      sides = [fromPage ? 'b' : 'r', 't']
    } else if (edge.kind === 'dataflow' && model.nodes.get(edge.to)?.type === 'method') {
      sides = [fromPage ? 'b' : 'r', 't']
    } else if (edge.kind === 'dataflow' && model.nodes.get(edge.from)?.type === 'method') {
      sides = ['t', 'b']
    } else if (edge.kind === 'dataflow' && model.nodes.get(edge.to)?.type === 'state') {
      sides = [fromPage ? 't' : 'r', 'b']
    } else if (edge.kind === 'dataflow' && model.nodes.get(edge.from)?.type === 'state') {
      sides = ['b', toPage ? 't' : 'r']
    } else {
      sides = ['r', 'l']
    }
    return { kind: edge.kind, from, to, fromSide: sides[0], toSide: sides[1], toAnchor: edge.kind === 'nav', members: [edge], back: false }
  })
}

function outward(model: Model, edge: DrawEdge): boolean {
  let forward = false
  if (edge.kind === 'nav') {
    const fromColumn = model.columns.get(pageOf(model, edge.members[0].from) ?? '') ?? 0
    const toColumn = edge.to.startsWith('p:') ? model.columns.get(edge.to.slice(2)) ?? 0 : Infinity
    forward = toColumn > fromColumn
  } else if (edge.kind === 'methodCall') {
    forward = true
  } else if (edge.kind === 'dataflow') {
    const source = model.nodes.get(edge.members[0].from)
    forward = source?.type !== 'method' && source?.type !== 'state'
  }
  return forward
}

/**
 * Edges of the same kind and change type that join the same two drawn nodes merge in either direction. The forward edge
 * leaves an element or page (for navigation, moves to a later column); an opposite member makes it two-way.
 */
export function mergeEdges(model: Model, edges: DrawEdge[]): DrawEdge[] {
  const order: string[] = []
  const groups = new Map<string, DrawEdge[]>()
  for (const edge of edges) {
    const key = `${edge.kind}|${edge.members[0].changeType ?? 'unchanged'}|${[edge.from, edge.to].sort().join('|')}`
    const group = groups.get(key)
    if (group) group.push(edge)
    else {
      groups.set(key, [edge])
      order.push(key)
    }
  }
  return order.map((key) => {
    const group = groups.get(key)!
    const forward = group.find((edge) => outward(model, edge)) ?? group[0]
    const members = group.flatMap((e) => e.members)
    const back = group.some((e) => e.from === forward.to && e.to === forward.from)
    return { ...forward, members, back }
  })
}
