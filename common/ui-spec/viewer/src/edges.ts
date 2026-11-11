import { pageOf, type Edge, type EdgeKind, type Model } from './model.ts'

/** Drawable edges: model edges rerouted for collapsed pages, then merged. Pure, no DOM. */

export type Side = 'l' | 'r' | 't' | 'b'
export type Layer = 'nav' | 'dataflow' | 'state'

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

export const layerOf = (kind: EdgeKind): Layer => (kind === 'write' || kind === 'read' ? 'state' : kind)

/** Build drawable edges for the current set of collapsed pages, then merge pairs. */
export function drawableEdges(model: Model, collapsed: ReadonlySet<string>): DrawEdge[] {
  return mergeEdges(buildEdges(model, collapsed))
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
      const fromColumn = model.columns.get(pageOf(model, edge.from) ?? '') ?? 0
      const toColumn = edge.to.startsWith('p:') ? model.columns.get(edge.to.slice(2)) ?? 0 : Infinity
      sides = toColumn > fromColumn ? ['r', 'l'] : ['l', 'r']
    } else if (edge.kind === 'dataflow' && edge.role !== 'return') sides = [fromPage ? 'b' : 'r', 't']
    else if (edge.kind === 'dataflow') sides = ['t', toPage ? 'b' : 'r']
    else if (edge.kind === 'write') sides = [fromPage ? 't' : 'r', 'b']
    else sides = ['b', toPage ? 't' : 'r']
    return { kind: edge.kind, from, to, fromSide: sides[0], toSide: sides[1], toAnchor: edge.kind === 'nav', members: [edge], back: false }
  })
}

const outward = (edge: DrawEdge) =>
  edge.kind === 'write' || (edge.kind === 'dataflow' && edge.members[0].role !== 'return') || (edge.kind === 'nav' && edge.fromSide === 'r')

/**
 * Dataflow edges that join the same two drawn nodes merge into one, in either direction; so do state
 * read/write edges (as in impl-dataflow's edges.ts) and navigation edges. The forward edge is the one
 * leaving the element or page (for navigation, the one moving to a later column); a member running the
 * other way makes the merged edge two-way.
 */
export function mergeEdges(edges: DrawEdge[]): DrawEdge[] {
  const order: string[] = []
  const groups = new Map<string, DrawEdge[]>()
  for (const edge of edges) {
    const key = `${layerOf(edge.kind)}|${[edge.from, edge.to].sort().join('|')}`
    const group = groups.get(key)
    if (group) group.push(edge)
    else {
      groups.set(key, [edge])
      order.push(key)
    }
  }
  return order.map((key) => {
    const group = groups.get(key)!
    const forward = group.find(outward) ?? group[0]
    const members = group.flatMap((e) => e.members)
    const back = group.some((e) => e.from === forward.to && e.to === forward.from)
    return { ...forward, members, back }
  })
}
