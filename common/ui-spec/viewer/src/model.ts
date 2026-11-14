import type { ChangeType, Spec } from '../../parser/parser.ts'
import { elementId, externalId, methodId, pageId } from '../../parser/ids.ts'
export { splitStatements } from '../../parser/relationships.ts'

/** Graph model derived from a ui-spec JSON document (ui-spec.schema.json). */

type SpecElement = Spec['pages'][string]['elements'][number]

export type EdgeKind = Spec['relationships'][number]['kind']

export type Edge = Spec['relationships'][number]

export interface PageNode {
  type: 'page'
  id: string
  name: string
  description?: string
  entry: boolean
  children: string[]
  changeType?: ChangeType
}

export interface ElementNode {
  type: 'element'
  id: string
  name: string
  kind: string
  /** Data direction relative to the user, from the spec's io field (set by the parser from kind). */
  io?: 'input' | 'output' | 'input_output'
  page: string
  parent: string | null
  children: string[]
  description?: string
  onClick?: string
  url?: string
  content?: string
  reads?: string[]
  changeType?: ChangeType
}

export interface MethodNode {
  type: 'method'
  id: string
  name: string
  backend: string
  signature: string
  description?: string
  changeType?: ChangeType
}

export interface StateNode {
  type: 'state'
  id: string
  name: string
  init: string
  /** The full initialization statement from the spec. */
  source: string
  changeType?: ChangeType
}

export interface ExternalNode {
  type: 'external'
  id: string
  name: string
  url: string
}

export type GraphNode = PageNode | ElementNode | MethodNode | StateNode | ExternalNode

export interface Backend {
  id: string
  name: string
  description?: string
  methods: string[]
  changeType?: ChangeType
}

export interface Model {
  id: string
  pages: PageNode[]
  elements: ElementNode[]
  methods: MethodNode[]
  backends: Backend[]
  state: StateNode[]
  externals: ExternalNode[]
  edges: Edge[]
  nodes: Map<string, GraphNode>
  /** Page name -> column, by navigation depth from the entry (first) page. */
  columns: Map<string, number>
}

function childChangeType(children: { changeType?: ChangeType }[]): ChangeType | undefined {
  const types = children.map((child) => child.changeType)
  if (types.length === 0 || types.every((type) => type === undefined)) return undefined
  else if (types.every((type) => type === undefined || type === 'unchanged')) return 'unchanged'
  else if (types.every((type) => type === 'added')) return 'added'
  else if (types.every((type) => type === 'deleted')) return 'deleted'
  else return 'modified'
}

export function deriveModel(spec: Spec): Model {
  const nodes = new Map<string, GraphNode>()
  const edges = spec.relationships

  const state: StateNode[] = spec.contentState.variables.map((variable) => ({
    type: 'state', id: variable.id, name: variable.name,
    init: variable.initialization.replace(/^\s*(?:let|const|var)\s+\w+\s*=\s*/, '').replace(/;?\s*$/, ''),
    source: variable.initialization, changeType: variable.changeType,
  }))

  const backends: Backend[] = []
  const methods: MethodNode[] = []
  for (const [name, backend] of Object.entries(spec.backends)) {
    const ids: string[] = []
    const children: MethodNode[] = []
    for (const [method, def] of Object.entries(backend.methods)) {
      const node: MethodNode = { type: 'method', id: methodId(name, method), name: method, backend: name, signature: def.signature, description: def.description, changeType: def.changeType }
      methods.push(node)
      children.push(node)
      ids.push(node.id)
    }
    backends.push({ id: `b:${name}`, name, description: backend.description, methods: ids, changeType: childChangeType(children) })
  }

  const elements: ElementNode[] = []
  const walk = (page: string, list: SpecElement[], parent: string | null): string[] => list.map((element) => {
    const node: ElementNode = {
      type: 'element', id: elementId(page, element.id), name: element.id, kind: element.kind, io: element.io, page, parent, children: [],
      description: element.description, onClick: element.on_click, url: element.url, content: element.content, reads: element.reads,
      changeType: element.kind === 'container' ? undefined : element.changeType,
    }
    elements.push(node)
    if (element.kind === 'container') node.children = walk(page, element.elements ?? [], node.id)
    return node.id
  })
  const pages: PageNode[] = Object.entries(spec.pages).map(([name, page], index) => ({
    type: 'page', id: pageId(name), name, description: page.description, entry: index === 0, children: walk(name, page.elements, null),
  }))
  const elementById = new Map(elements.map((element) => [element.id, element]))
  for (const element of [...elements].reverse()) {
    if (element.kind === 'container') element.changeType = childChangeType(element.children.map((id) => elementById.get(id)!))
  }
  for (const page of pages) page.changeType = childChangeType(page.children.map((id) => elementById.get(id)!))

  const externals: ExternalNode[] = []
  for (const element of elements) {
    if (element.kind === 'link' && element.url && !externals.some((external) => external.url === element.url)) {
      externals.push({ type: 'external', id: externalId(element.url), name: element.url.replace(/^https?:\/\/(www\.)?/, ''), url: element.url })
    }
  }
  for (const group of [state, methods, elements, pages, externals] as GraphNode[][]) for (const node of group) nodes.set(node.id, node)

  const model: Model = { id: spec.id, pages, elements, methods, backends, state, externals, edges, nodes, columns: new Map() }
  model.columns = pageColumns(model)
  return model
}

export function pageOf(model: Model, id: string): string | undefined {
  const node = model.nodes.get(id)
  return node?.type === 'element' ? node.page : undefined
}

/** Methods reached by at least one trigger. */
export function calledMethods(model: Model): Set<string> {
  return new Set(model.edges.filter((e) => e.kind === 'methodCall').map((e) => e.to))
}

/** Page columns: BFS depth over page-to-page navigation from the entry page; unreachable pages go last. */
function pageColumns(model: Model): Map<string, number> {
  const columns = new Map<string, number>()
  if (model.pages.length === 0) return columns
  const entry = model.pages[0].name
  columns.set(entry, 0)
  const queue = [entry]
  while (queue.length > 0) {
    const page = queue.shift()!
    for (const edge of model.edges) {
      if (edge.kind !== 'nav' || pageOf(model, edge.from) !== page || !edge.to.startsWith('p:')) continue
      const target = edge.to.slice(2)
      if (!columns.has(target)) {
        columns.set(target, columns.get(page)! + 1)
        queue.push(target)
      }
    }
  }
  const last = Math.max(...columns.values()) + 1
  for (const page of model.pages) if (!columns.has(page.name)) columns.set(page.name, last)
  return columns
}
