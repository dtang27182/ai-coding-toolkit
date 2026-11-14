import type { Model } from './model.ts'

/** Keep changed leaves, their directly connected unchanged leaves, and changed ancestor containers. */
export function visibleModel(model: Model, showUnchanged: boolean): Model {
  if (showUnchanged) return model

  const changed = new Set([...model.pages, ...model.elements, ...model.methods, ...model.state, ...model.backends]
    .filter((node) => node.changeType !== undefined && node.changeType !== 'unchanged').map((node) => node.id))
  const connected = new Set(changed)
  for (const edge of model.edges) {
    if (changed.has(edge.from)) connected.add(edge.to)
    if (changed.has(edge.to)) connected.add(edge.from)
  }

  const pages = model.pages.filter((page) => changed.has(page.id))
  const pageNames = new Set(pages.map((page) => page.name))
  const elementIds = new Set<string>()
  for (const element of model.elements) {
    if (!pageNames.has(element.page) || (element.parent !== null && !elementIds.has(element.parent))) continue
    if (element.kind === 'container' ? changed.has(element.id) : connected.has(element.id)) elementIds.add(element.id)
  }
  const elements = model.elements.filter((element) => elementIds.has(element.id))
    .map((element) => ({ ...element, children: element.children.filter((id) => elementIds.has(id)) }))
  const state = model.state.filter((node) => connected.has(node.id))
  const methods = model.methods.filter((node) => connected.has(node.id) && changed.has(`b:${node.backend}`))
  const methodIds = new Set(methods.map((method) => method.id))
  const backends = model.backends.filter((backend) => changed.has(backend.id))
    .map((backend) => ({ ...backend, methods: backend.methods.filter((id) => methodIds.has(id)) }))
  const visibleIds = new Set([...pages.map((page) => page.id), ...elementIds, ...state.map((node) => node.id), ...methodIds])
  const edges = model.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
  const nodes = new Map([...state, ...methods, ...elements, ...pages].map((node) => [node.id, node]))
  return {
    ...model,
    pages: pages.map((page) => ({ ...page, children: page.children.filter((id) => elementIds.has(id)) })),
    elements, methods, backends, state, edges, nodes,
  }
}
