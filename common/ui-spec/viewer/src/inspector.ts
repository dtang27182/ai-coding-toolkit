import { splitStatements, type Backend, type Edge, type GraphNode, type Model } from './model.ts'
import type { DrawEdge } from './edges.ts'

/**
 * Inspector panel (mockup). Shows only spec fields the graph does not already draw, using the
 * sys-dataflow / impl-dataflow inspector markup: sticky header, endpoint pair, counted sections.
 */

const IO: Record<string, [string, string]> = {
  input: ['USER →', 'var(--t-input)'],
  output: ['→ USER', 'var(--t-output)'],
  input_output: ['USER ⇄', 'var(--t-both)'],
}

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const badge = (text: string, tone: string) => `<span class="badge" style="--t:${tone}">${esc(text)}</span>`

function section(title: string, content: string, count?: number): string {
  return `<section class="inspector-section"><div class="section-heading"><span>${esc(title)}</span>${count === undefined ? '' : `<span class="inspector-count">${count}</span>`}</div>${content}</section>`
}

function header(eyebrow: string, title: string, detail?: string): string {
  return `<header class="inspector-header">
    <div class="inspector-eyebrow">${eyebrow}</div>
    <div class="inspector-title-row"><div class="inspector-title">${esc(title)}</div><button class="close-button" data-close aria-label="Clear selection">✕</button></div>
    ${detail === undefined ? '' : `<span class="detail-chip">${esc(detail)}</span>`}
  </header>`
}

const prose = (text: string | undefined) =>
  text ? `<p class="entry-copy">${esc(text)}</p>` : '<p class="empty-copy">No description in the spec.</p>'
const code = (text: string) => `<pre class="pseudo-code">${esc(text)}</pre>`

/** Node badge as the graph draws it. */
export function nodeBadge(node: GraphNode): string {
  switch (node.type) {
    case 'page': return badge(node.entry ? 'PAGE · ENTRY' : 'PAGE', 'var(--t-page)')
    case 'state': return badge('CONTENT STATE', 'var(--t-state)')
    case 'method': return badge('METHOD', 'var(--t-ext)')
    case 'external': return badge('EXTERNAL', 'var(--t-ext)')
    case 'element': {
      if (node.kind === 'container') return badge('CONTAINER', 'var(--node-stroke)')
      const io = node.io ? IO[node.io] : undefined
      return `${io ? badge(io[0], io[1]) + ' ' : ''}${badge(node.kind.replace('_', ' ').toUpperCase(), 'var(--node-stroke)')}`
    }
  }
}

/** Page-qualified name: page › container › element, backend.method, or the bare name. */
export function qualifiedName(model: Model, id: string): string {
  const node = model.nodes.get(id)
  if (!node) return id
  if (node.type === 'element') {
    const path = [node.name]
    let parent = node.parent
    while (parent) {
      const p = model.nodes.get(parent)
      if (p?.type !== 'element') break
      path.unshift(p.name)
      parent = p.parent
    }
    return [node.page, ...path].join(' › ')
  }
  if (node.type === 'method') return `${node.backend}.${node.name}`
  if (node.type === 'external') return node.url
  return node.name
}

export function renderNode(model: Model, node: GraphNode): string {
  switch (node.type) {
    case 'page':
      return header(nodeBadge(node), node.name) + section('Description', prose(node.description))
    case 'element': {
      const path = qualifiedName(model, node.id).split(' › ').slice(0, -1).join(' › ')
      let body = section('Description', prose(node.description))
      const content = node.content?.trim()
      if (node.kind === 'text' && content && !model.state.some((s) => s.name === content)) body += section('Content', code(content))
      // One statement per line; the text is the spec's own, not interpreted.
      if (node.onClick) body += section('on_click', code(splitStatements(node.onClick).map((s) => `${s};`).join('\n')))
      return header(nodeBadge(node), node.name, path) + body
    }
    case 'method':
      return header(nodeBadge(node), node.name, node.backend) + section('Signature', code(`${node.name}${node.signature.replace(/^\w+/, '')}`)) + section('Description', prose(node.description))
    case 'state':
      return header(nodeBadge(node), node.name) + section('Initialization', code(node.source))
    case 'external':
      return header(nodeBadge(node), node.name) + section('URL', `<a class="url-copy" href="${esc(node.url)}" target="_blank" rel="noopener">${esc(node.url)}</a>`)
  }
}

export function renderBackend(backend: Backend): string {
  return header(badge('BACKEND API', 'var(--t-ext)'), backend.name) + section('Description', prose(backend.description))
}

function KIND_LABEL(edge: Edge): string {
  let label = ''
  if (edge.kind === 'nav') {
    label = 'Navigation'
  } else if (edge.kind === 'methodCall') {
    label = 'Method call'
  } else if (edge.kind === 'dataflow') {
    label = 'Dataflow'
  }
  return label
}

function endpoint(model: Model, role: string, id: string): string {
  const node = model.nodes.get(id)
  return `<button data-jump-node="${esc(id)}"><span class="endpoint-role">${role}</span>${node ? `<span class="endpoint-badges">${nodeBadge(node)}</span>` : ''}<span class="endpoint-name">${esc(qualifiedName(model, id))}</span></button>`
}

/**
 * Edge inspector. Ends are the real model nodes: when every member shares one end it is shown, even
 * inside a collapsed page; otherwise the drawn node (the collapsed page) stands in.
 */
export function renderEdge(model: Model, edge: DrawEdge): string {
  if (edge.kind === 'nav') return renderNavigation(model, edge)
  const members = edge.members
  const shared = (pick: (e: Edge) => string, drawn: string) => {
    const ids = new Set(members.map(pick))
    return ids.size === 1 ? [...ids][0] : drawn
  }
  const from = shared((m) => m.from, edge.from)
  const to = shared((m) => m.to, edge.to)
  const short = (id: string) => model.nodes.get(id)?.name ?? id
  if (members.length === 1) {
    const m = members[0]
    return header(esc(KIND_LABEL(m)), `${short(m.from)} → ${short(m.to)}`) +
      `<div class="endpoint-pair">${endpoint(model, 'From', m.from)}<span class="endpoint-arrow">→</span>${endpoint(model, 'To', m.to)}</div><div class="pair-gap"></div>`
  }
  const kinds = [...new Set(members.map(KIND_LABEL))].join(' + ')
  const arrow = edge.back ? '↔' : '→'
  return header(`Merged ${esc(kinds.toLowerCase())} edges`, `${short(from)} ${arrow} ${short(to)}`, `${members.length} edges`) +
    `<div class="endpoint-pair">${endpoint(model, edge.back ? 'Node' : 'From', from)}<span class="endpoint-arrow">${arrow}</span>${endpoint(model, edge.back ? 'Node' : 'To', to)}</div>` +
    section('Edges', `<div class="flow-list">${members.map((m) => `<div class="flow-row static">
      <span class="flow-kind">${esc(KIND_LABEL(m))}</span>
      <span class="flow-endpoint"><button class="link" data-jump-node="${esc(m.from)}">${esc(qualifiedName(model, m.from))}</button> → <button class="link" data-jump-node="${esc(m.to)}">${esc(qualifiedName(model, m.to))}</button></span>
    </div>`).join('')}</div>`, members.length)
}

/** Page (or external target) at either end of a navigation edge: the trigger's page, the target page. */
const navEnd = (model: Model, id: string) => {
  const node = model.nodes.get(id)
  return node?.type === 'element' ? `p:${node.page}` : id
}

/**
 * Navigation inspector: the two pages as endpoints, then the element that triggers each navigation.
 * A merged or two-way rail lists every trigger with the page it goes to.
 */
function renderNavigation(model: Model, edge: DrawEdge): string {
  const first = edge.members[0]
  const from = navEnd(model, first.from)
  const to = first.to
  const arrow = edge.back ? '↔' : '→'
  const short = (id: string) => model.nodes.get(id)?.name ?? id
  const triggers = edge.members.map((m) => {
    const node = model.nodes.get(m.from)
    return `<div class="flow-row trigger-row">
      ${node ? `<span class="endpoint-badges">${nodeBadge(node)}</span>` : ''}
      <span class="flow-endpoint"><button class="link" data-jump-node="${esc(m.from)}">${esc(qualifiedName(model, m.from))}</button></span>
      ${edge.back || edge.members.length > 1 ? `<span class="flow-kind">→ ${esc(short(m.to))}</span>` : ''}
    </div>`
  }).join('')
  return header(edge.back ? 'Two-way navigation' : 'Navigation', `${short(from)} ${arrow} ${short(to)}`, edge.members.length > 1 ? `${edge.members.length} triggers` : undefined) +
    `<div class="endpoint-pair">${endpoint(model, edge.back ? 'Page' : 'From', from)}<span class="endpoint-arrow">${arrow}</span>${endpoint(model, edge.back ? 'Page' : 'To', to)}</div>` +
    section('Triggered by', `<div class="flow-list">${triggers}</div>`, edge.members.length)
}

export function renderOverview(model: Model, description: string | undefined): string {
  return `<div class="overview">
    <div class="overview-kicker">UI spec</div>
    <h1>${esc(model.id)}</h1>
    ${description ? `<p class="entry-copy">${esc(description)}</p>` : ''}
    <p class="empty-copy">Select a node or an edge. The inspector shows only spec details the graph doesn't draw: descriptions, full signatures, initialization, URLs, and the members of merged edges.</p>
  </div>`
}
