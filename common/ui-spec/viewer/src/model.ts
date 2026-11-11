import type { Spec } from '../../parser/parser.ts'

/** Graph model derived from a ui-spec JSON document (ui-spec.schema.json). */

type SpecElement = Spec['pages'][string]['elements'][number]

export type EdgeKind = 'nav' | 'dataflow' | 'write' | 'read'
/** Dataflow roles: the trigger calling a method, a field passed as an argument, a captured return value. */
export type DataflowRole = 'call' | 'arg' | 'return'

export interface Edge {
  kind: EdgeKind
  from: string
  to: string
  role?: DataflowRole
}

export interface PageNode {
  type: 'page'
  id: string
  name: string
  description?: string
  entry: boolean
  children: string[]
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
}

export interface MethodNode {
  type: 'method'
  id: string
  name: string
  backend: string
  signature: string
  description?: string
}

export interface StateNode {
  type: 'state'
  id: string
  name: string
  init: string
  /** The full initialization statement from the spec. */
  source: string
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

export const pageId = (name: string) => `p:${name}`
export const elementId = (page: string, name: string) => `e:${page}/${name}`
export const methodId = (backend: string, name: string) => `m:${backend}.${name}`
export const stateId = (name: string) => `s:${name}`
export const externalId = (url: string) => `x:${url}`

export function deriveModel(spec: Spec): Model {
  const nodes = new Map<string, GraphNode>()
  const edges: Edge[] = []

  const state: StateNode[] = []
  for (const line of spec.content_state.initialization) {
    const match = line.match(/^\s*(?:let|const|var)\s+(\w+)\s*=\s*(.+?);?\s*$/)
    if (match) state.push({ type: 'state', id: stateId(match[1]), name: match[1], init: match[2], source: line.trim() })
  }

  const backends: Backend[] = []
  const methods: MethodNode[] = []
  for (const [name, backend] of Object.entries(spec.backend_apis)) {
    const ids: string[] = []
    for (const [method, def] of Object.entries(backend.methods)) {
      const node: MethodNode = { type: 'method', id: methodId(name, method), name: method, backend: name, signature: def.signature, description: def.description }
      methods.push(node)
      ids.push(node.id)
    }
    backends.push({ id: `b:${name}`, name, description: backend.description, methods: ids })
  }

  const elements: ElementNode[] = []
  const walk = (page: string, list: SpecElement[], parent: string | null): string[] => list.map((element) => {
    const node: ElementNode = {
      type: 'element', id: elementId(page, element.id), name: element.id, kind: element.kind, io: element.io, page, parent, children: [],
      description: element.description, onClick: element.on_click, url: element.url, content: element.content, reads: element.reads,
    }
    elements.push(node)
    if (element.kind === 'container') node.children = walk(page, element.elements ?? [], node.id)
    return node.id
  })
  const pages: PageNode[] = Object.entries(spec.pages).map(([name, page], index) => ({
    type: 'page', id: pageId(name), name, description: page.description, entry: index === 0, children: walk(name, page.elements, null),
  }))

  const externals: ExternalNode[] = []
  for (const group of [state, methods, elements, pages] as GraphNode[][]) for (const node of group) nodes.set(node.id, node)

  const stateNames = new Set(state.map((s) => s.name))
  const backendNames = new Set(backends.map((b) => b.name))
  const add = (edge: Edge) => {
    if (!edges.some((e) => e.kind === edge.kind && e.from === edge.from && e.to === edge.to && e.role === edge.role)) edges.push(edge)
  }

  for (const element of elements) {
    const samePage = (name: string) => elements.find((e) => e.page === element.page && e.name === name)
    for (const statement of splitStatements(element.onClick ?? '')) {
      const nav = statement.match(/^navigate\(\s*['"](\w+)['"]\s*\)$/)
      if (nav) {
        add({ kind: 'nav', from: element.id, to: pageId(nav[1]) })
        continue
      }
      let callId: string | undefined
      const call = statement.match(/(\w+)\.(\w+)\(([^)]*)\)/)
      if (call && backendNames.has(call[1])) {
        callId = methodId(call[1], call[2])
        add({ kind: 'dataflow', role: 'call', from: element.id, to: callId })
        for (const arg of call[3].split(',').map((a) => a.trim()).filter(Boolean)) {
          const source = samePage(arg)
          if (source) add({ kind: 'dataflow', role: 'arg', from: source.id, to: callId })
        }
      }
      const assignment = statement.match(/^(?:const\s+|let\s+)?(\w+)\s*=\s*([\s\S]+)$/)
      if (assignment) {
        const target = assignment[1]
        if (callId) add({ kind: 'dataflow', role: 'return', from: callId, to: element.id })
        if (stateNames.has(target)) add({ kind: 'write', from: element.id, to: stateId(target) })
      }
    }
    if (element.kind === 'link' && element.url) {
      const id = externalId(element.url)
      if (!nodes.has(id)) {
        const node: ExternalNode = { type: 'external', id, name: element.url.replace(/^https?:\/\/(www\.)?/, ''), url: element.url }
        externals.push(node)
        nodes.set(id, node)
      }
      add({ kind: 'nav', from: element.id, to: id })
    }
    for (const read of element.reads ?? []) if (stateNames.has(read)) add({ kind: 'read', from: stateId(read), to: element.id })
    const content = element.content?.trim()
    if (element.kind === 'text' && content && stateNames.has(content)) add({ kind: 'read', from: stateId(content), to: element.id })
  }

  const model: Model = { id: spec.id, pages, elements, methods, backends, state, externals, edges, nodes, columns: new Map() }
  model.columns = pageColumns(model)
  return model
}

/** Split an on_click body into top-level statements (ignores ; inside strings, brackets and template literals). */
export function splitStatements(source: string): string[] {
  const statements: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    current += char
    if (quote) {
      if (char === '\\') current += source[++i] ?? ''
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'" || char === '`') quote = char
    else if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char)) depth--
    else if (char === ';' && depth === 0) {
      statements.push(current.slice(0, -1).trim())
      current = ''
    }
  }
  statements.push(current.trim())
  return statements.filter(Boolean)
}

export function pageOf(model: Model, id: string): string | undefined {
  const node = model.nodes.get(id)
  return node?.type === 'element' ? node.page : undefined
}

/** Methods reached by at least one trigger. */
export function calledMethods(model: Model): Set<string> {
  return new Set(model.edges.filter((e) => e.kind === 'dataflow' && e.role === 'call').map((e) => e.to))
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
