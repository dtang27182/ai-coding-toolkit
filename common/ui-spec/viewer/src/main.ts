import type { ChangeType, Spec } from '../../parser/parser.ts'
import exampleSpec from '../../ui-root.example.ui.json?raw'
import { deriveModel, pageOf, type ElementNode, type Model } from './model.ts'
import { drawableEdges, type DrawEdge, type Layer, type Side } from './edges.ts'
import { Router, bezierControls, bezierPoint, roundedPath, separate, stub, type Point, type Port, type Rect } from './route.ts'
import './styles.css'
import { renderBackend, renderEdge, renderNode, renderOverview } from './inspector.ts'

/** Direction badge and tint for each io value. */
const IO: Record<string, [string, string]> = {
  input: ['USER →', 'var(--t-input)'],
  output: ['→ USER', 'var(--t-output)'],
  input_output: ['USER ⇄', 'var(--t-both)'],
}
const LAYERS: [Layer, string][] = [['nav', 'Navigation'], ['methodCall', 'Method calls'], ['dataflow', 'Dataflow']]
const CHANGE_TYPES: ChangeType[] = ['added', 'modified', 'deleted', 'unchanged']
const changeColor = (changeType?: ChangeType) => `var(--${changeType ?? 'unchanged'})`
const changeStyle = (changeType?: ChangeType) => `--change-color:${changeColor(changeType)}`

interface Placed { edge: DrawEdge; fromEl: Element; toEl: Element; fromRect: Rect; toRect: Rect; fromT: number; toT: number }
interface Drawn { edge: DrawEdge; group: SVGGElement }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="stage-chip">UI spec</span>
        <span class="file-label" data-file-name></span>
        <span class="counts" data-spec-counts></span>
      </div>
      <div class="layers" data-layers></div>
      <button class="control-button" data-toggle-pages></button>
      <label class="open-button">Open spec<input type="file" data-open hidden></label>
    </header>
    <div class="workspace inspector-collapsed" data-workspace>
    <div class="canvas" data-canvas>
      <div class="graph" data-graph></div>
      <div class="zoom" data-zoom>
        <button data-z="out" aria-label="Zoom out">−</button>
        <button data-z="fit">Fit</button>
        <button data-z="in" aria-label="Zoom in">+</button>
      </div>
      <div class="legend" data-legend></div>
      <div class="status-banner" data-status hidden></div>
      <div class="drop-overlay" data-drop hidden>Drop a .ui.json or .ui.dsl spec</div>
    </div>
    <button class="inspector-rail" data-toggle-inspector aria-label="Show inspector" title="Show inspector"><span class="inspector-rail-chevron">‹</span><span class="inspector-rail-label">Inspector</span></button>
    <div class="inspector-resizer" data-inspector-resizer role="separator" aria-label="Resize inspector" aria-orientation="vertical" tabindex="0"><button class="inspector-collapse" data-toggle-inspector aria-label="Hide inspector" title="Hide inspector">›</button></div>
    <aside class="inspector" data-inspector aria-label="UI spec inspector"></aside>
    </div>
  </div>`

const $ = <T extends Element>(selector: string) => app.querySelector<T>(selector)!
const graph = $<HTMLDivElement>('[data-graph]')
const canvas = $<HTMLDivElement>('[data-canvas]')
const layersEl = $<HTMLDivElement>('[data-layers]')
const statusEl = $<HTMLDivElement>('[data-status]')
const pagesButton = $<HTMLButtonElement>('[data-toggle-pages]')

const view = {
  model: deriveModel(JSON.parse(exampleSpec) as Spec),
  collapsed: new Set<string>(),
  selected: null as string | null,
  /** Index into view.drawn of the selected edge. */
  selectedEdge: null as number | null,
  /** The spec's top-level description, shown when nothing is selected. */
  description: (JSON.parse(exampleSpec) as Spec).description,
  layers: { nav: true, methodCall: true, dataflow: true } as Record<Layer, boolean>,
  scale: 1,
  tx: 0,
  ty: 0,
  drawn: [] as Drawn[],
  /** Node ids with at least one edge; backend methods without one are not drawn. */
  connected: new Set<string>(),
}

function load(model: Model, fileName: string) {
  view.model = model
  view.collapsed = new Set(model.pages.map((p) => p.name))
  view.selected = null
  view.connected = new Set(model.edges.flatMap((e) => [e.from, e.to]))
  const fileLabel = $<HTMLElement>('[data-file-name]')
  fileLabel.textContent = fileName
  fileLabel.title = fileName
  $('[data-spec-counts]').textContent = `${model.pages.length} pages · ${model.elements.filter((e) => e.kind !== 'container').length} elements · ${model.methods.length} API methods · ${model.state.length} content-state vars`
  renderLayers()
  render()
  fit()
  renderInspector()
}

/* ---------- markup ---------- */

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const elementCount = (page: string) => view.model.elements.filter((e) => e.page === page && e.kind !== 'container').length

const badge = (text: string, tone: string) => `<span class="badge" style="--t:${tone}">${esc(text)}</span>`

function elementMarkup(id: string): string {
  const element = view.model.nodes.get(id) as ElementNode
  if (element.kind === 'container') {
    return `<div class="sub-frame" data-id="${esc(id)}" style="${changeStyle(element.changeType)}"><div class="sub-label">${esc(element.name)} · container</div>${element.children.map(elementMarkup).join('')}</div>`
  }
  const io = element.io ? IO[element.io] : undefined
  return `<button class="pill leaf" data-id="${esc(id)}" style="--t:${io?.[1] ?? 'var(--node-stroke)'};${changeStyle(element.changeType)}">${io ? badge(io[0], io[1]) : ''}<span class="n">${esc(element.name)}</span><span class="t">${esc(element.kind.replace('_', ' '))}</span></button>`
}

function methodMarkup(id: string): string {
  const method = view.model.nodes.get(id)
  if (method?.type !== 'method') return ''
  const params = method.signature.match(/^\w+\s*(\([^)]*\))/)?.[1] ?? method.signature.replace(/^\w+/, '')
  return `<button class="pill method" data-id="${esc(id)}" style="${changeStyle(method.changeType)}" title="${esc(method.signature)}"><span class="g">ƒ</span><span class="n">${esc(method.name)}</span><span class="sig">${esc(params)}</span></button>`
}

/** sys-dataflow cylinder: caps 5.65% of the width, so it scales exactly with preserveAspectRatio="none". */
const CYLINDER = `<svg class="cyl-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="o" vector-effect="non-scaling-stroke" d="M5.65 0 L94.35 0 A5.65 50 0 0 1 94.35 100 L5.65 100 A5.65 50 0 0 1 5.65 0 Z"/><path class="d" vector-effect="non-scaling-stroke" d="M5.65 0 A5.65 50 0 0 0 5.65 100"/></svg>`

/** Frame tab: hexagon for pages, cylinder for content state, dashed external-dependency box for backends. */
function tab(shape: 'hex' | 'cyl' | 'ext', label: string, tone: string, name: string, attrs = ''): string {
  return `<button class="frame-tab ${shape}" style="--t:${tone}" ${attrs}>${shape === 'cyl' ? CYLINDER : ''}<span>${badge(label, tone)}<span class="frame-name">${esc(name)}</span></span></button>`
}

function pageMarkup(name: string): string {
  const page = view.model.pages.find((p) => p.name === name)!
  const count = elementCount(name)
  const label = page.entry ? 'PAGE · ENTRY' : 'PAGE'
  if (view.collapsed.has(name)) {
    return `<div class="node"><button class="page-node" data-id="${esc(page.id)}" data-anchor="${esc(page.id)}" style="--t:var(--t-page);${changeStyle(page.changeType)}"><span class="hex-fill">${badge(label, 'var(--t-page)')}<span class="frame-name">${esc(name)}</span></span></button>
      <button class="toggle" data-toggle="${esc(name)}" style="right:18px;top:-12px" aria-label="Expand ${count} elements in ${esc(name)}">+${count}</button></div>`
  }
  return `<div class="node frame page" data-id="${esc(page.id)}" style="${changeStyle(page.changeType)}">${tab('hex', label, 'var(--t-page)', name, `data-id="${esc(page.id)}" data-anchor="${esc(page.id)}"`)}
    <button class="toggle" data-toggle="${esc(name)}" style="right:10px;top:7px" aria-label="Collapse ${esc(name)}">−</button>
    <div class="stack">${page.children.map(elementMarkup).join('')}</div></div>`
}

/** impl-dataflow "Collapse containers" control: active while pages are collapsed, label names the next action. */
function renderPagesButton() {
  const collapsed = view.collapsed.size > 0
  pagesButton.textContent = collapsed ? 'Expand pages' : 'Collapse pages'
  pagesButton.classList.toggle('active', collapsed)
  pagesButton.setAttribute('aria-pressed', String(collapsed))
}

function render() {
  renderPagesButton()
  const model = view.model
  const columns: string[][] = []
  for (const page of model.pages) (columns[model.columns.get(page.name)!] ??= []).push(page.name)
  graph.innerHTML = `<svg class="graph-svg" aria-hidden="true"></svg>
    <div class="band"><div class="node frame">${tab('cyl', 'CONTENT STATE', 'var(--t-state)', model.id)}<div class="row">${model.state.map((s) =>
      `<button class="state-box" data-id="${esc(s.id)}" style="--t:var(--t-state);${changeStyle(s.changeType)}">${CYLINDER}<span class="sn">${esc(s.name)}</span><span class="si">init ${esc(s.init)}</span></button>`).join('')}</div></div></div>
    <div class="band page-band">${columns.filter(Boolean).map((pages) => `<div class="col">${pages.map(pageMarkup).join('')}</div>`).join('')}
      ${model.externals.length ? `<div class="col">${model.externals.map((x) => `<div class="node"><button class="ext-node" data-id="${esc(x.id)}" data-anchor="${esc(x.id)}" style="--t:var(--t-ext)" title="${esc(x.url)}">${badge('EXTERNAL', 'var(--t-ext)')}<span class="frame-name">${esc(x.name)}</span></button></div>`).join('')}</div>` : ''}</div>
    <div class="band">${model.backends.map((b) => [b, b.methods.filter((m) => view.connected.has(m))] as const).filter(([, methods]) => methods.length > 0)
      .map(([b, methods]) => `<div class="node frame backend" style="${changeStyle(b.changeType)}">${tab('ext', 'BACKEND API', 'var(--t-ext)', b.name, `data-id="${esc(b.id)}"`)}<div class="row">${methods.map(methodMarkup).join('')}</div></div>`).join('')}</div>`
  // Drawn edges are rebuilt, so an edge selection no longer points at the same edge.
  if (view.selectedEdge !== null) {
    view.selectedEdge = null
    renderInspector()
  }
  drawEdges(placeEdges(drawableEdges(model, view.collapsed)))
}

/* ---------- edge geometry ---------- */

function rectOf(element: Element): Rect {
  const g = graph.getBoundingClientRect()
  const r = element.getBoundingClientRect()
  return { x: (r.left - g.left) / view.scale, y: (r.top - g.top) / view.scale, w: r.width / view.scale, h: r.height / view.scale }
}

const nodeElement = (id: string, anchor: boolean) => graph.querySelector(anchor ? `[data-anchor="${CSS.escape(id)}"]` : `[data-id="${CSS.escape(id)}"]`)
const centerX = (r: Rect) => r.x + r.w / 2

/** Measure endpoints, pick element sides that face the other end, and spread endpoints sharing a side. */
function placeEdges(edges: DrawEdge[]): Placed[] {
  const placed: Placed[] = []
  const ends = new Map<string, { item: Placed; end: 'from' | 'to'; along: number }[]>()
  for (const edge of edges) {
    const fromEl = nodeElement(edge.from, false)
    const toEl = nodeElement(edge.to, edge.toAnchor)
    if (!fromEl || !toEl) continue
    const item: Placed = { edge: { ...edge }, fromEl, toEl, fromRect: rectOf(fromEl), toRect: rectOf(toEl), fromT: 0.5, toT: 0.5 }
    const e = item.edge
    if (e.kind !== 'nav') {
      if (e.fromSide === 'r' && centerX(item.toRect) < item.fromRect.x) e.fromSide = 'l'
      if (e.toSide === 'r' && centerX(item.fromRect) < item.toRect.x) e.toSide = 'l'
    }
    placed.push(item)
    for (const [end, side, own, other] of [['from', e.fromSide, item.fromRect, item.toRect], ['to', e.toSide, item.toRect, item.fromRect]] as const) {
      const key = `${end === 'from' ? e.from : e.to}|${side}|${own.x},${own.y}`
      const list = ends.get(key) ?? []
      list.push({ item, end, along: side === 'l' || side === 'r' ? other.y + other.h / 2 : other.x + other.w / 2 })
      ends.set(key, list)
    }
  }
  for (const list of ends.values()) {
    list.sort((a, b) => a.along - b.along)
    list.forEach((entry, i) => { entry.item[entry.end === 'from' ? 'fromT' : 'toT'] = (i + 1) / (list.length + 1) })
  }
  return placed
}

function port(r: Rect, side: Side, t: number): Port {
  if (side === 'l') return { x: r.x, y: r.y + r.h * t, nx: -1, ny: 0 }
  if (side === 'r') return { x: r.x + r.w, y: r.y + r.h * t, nx: 1, ny: 0 }
  if (side === 't') return { x: r.x + r.w * t, y: r.y, nx: 0, ny: -1 }
  return { x: r.x + r.w * t, y: r.y + r.h, nx: 0, ny: 1 }
}

/** Nodes an edge must not pass through: every leaf node plus frame tabs and container labels. */
const OBSTACLES = '.page-node, .pill, .state-box, .ext-node, .frame-tab, .sub-label'

/** Bezier when it is clear of other nodes, otherwise a routed path with rounded corners. */
function edgePath(router: Router, a: Port, b: Port, exempt: ReadonlySet<number>): string | Point[] {
  const [c0, c1] = bezierControls(a, b)
  const curve = `M${a.x},${a.y} C${c0.x},${c0.y} ${c1.x},${c1.y} ${b.x},${b.y}`
  const samples = Array.from({ length: 41 }, (_, i) => bezierPoint(a, c0, c1, b, i / 40))
  if (router.clear(samples, exempt)) return curve
  return router.route(a, b, exempt) ?? curve
}

const MARKERS = `<defs>${CHANGE_TYPES.map((changeType) => `
  <marker id="arrow-${changeType}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 1 L7 4 L0 7 z" fill="${changeColor(changeType)}"/></marker>
  <marker id="hollow-${changeType}" viewBox="-1 -1 10 10" refX="7" refY="4" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 1 L7 4 L0 7 z" fill="var(--surface)" stroke="${changeColor(changeType)}" stroke-width="1.1" stroke-linejoin="round"/></marker>
  <marker id="dot-${changeType}" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="${changeColor(changeType)}" stroke="var(--surface)" stroke-width="1.2"/></marker>
  <marker id="rail-arrow-${changeType}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0 L7 4 L0 8 z" fill="${changeColor(changeType)}"/></marker>`).join('')}</defs>`

function drawEdges(placed: Placed[]) {
  const svg = graph.querySelector('.graph-svg')!
  const svgNode = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    return node
  }
  svg.innerHTML = MARKERS
  view.drawn = []
  const obstacleEls = [...graph.querySelectorAll(OBSTACLES)]
  const index = new Map(obstacleEls.map((node, i) => [node, i]))
  const ends = placed.map(({ edge, fromRect, toRect, fromT, toT }) => [port(fromRect, edge.fromSide, fromT), port(toRect, edge.toSide, toT)] as const)
  const router = new Router(obstacleEls.map(rectOf), ends.flatMap(([a, b]) => [stub(a), stub(b)]))
  const shapes = placed.map(({ fromEl, toEl }, n) =>
    edgePath(router, ends[n][0], ends[n][1], new Set([index.get(fromEl), index.get(toEl)].filter((i) => i !== undefined))))
  // Routed edges that share a grid line get their own lanes.
  const routed = shapes.flatMap((shape, n) => (typeof shape === 'string' ? [] : [n]))
  const lanes = separate(routed.map((n) => shapes[n] as Point[]))
  routed.forEach((n, i) => { shapes[n] = lanes[i] })
  for (const [n, { edge }] of placed.entries()) {
    const shape = shapes[n]
    const d = typeof shape === 'string' ? shape : roundedPath(shape)
    const changeType = edge.members[0].changeType ?? 'unchanged'
    const group = svgNode('g', { class: 'edge-group', 'data-edge': String(view.drawn.length), style: changeStyle(changeType) })
    if (edge.kind === 'nav') {
      group.append(svgNode('path', { d, class: 'edge rail' }), svgNode('path', { d, class: 'edge rail-core', 'marker-end': `url(#rail-arrow-${changeType})`, ...(edge.back ? { 'marker-start': `url(#rail-arrow-${changeType})` } : {}) }))
    } else {
      group.append(svgNode('path', { d, class: `edge ${edge.kind}`, 'marker-end': `url(#arrow-${changeType})`, 'marker-start': edge.back ? `url(#hollow-${changeType})` : `url(#dot-${changeType})` }))
    }
    // A wide transparent stroke on top makes the edge easy to click.
    group.append(svgNode('path', { d, class: 'edge-hit' }))
    svg.append(group)
    // No labels on the canvas: the inspector shows each edge's data.
    view.drawn.push({ edge, group })
  }
  applyFilters()
}

/* ---------- selection + filters ---------- */

function related(id: string) {
  const model = view.model
  const ids = new Set([id])
  const node = model.nodes.get(id)
  if (node?.type === 'page') model.elements.filter((e) => e.page === node.name).forEach((e) => ids.add(e.id))
  if (node?.type === 'element' && node.kind === 'container') node.children.forEach((c) => ids.add(c))
  model.backends.find((b) => b.id === id)?.methods.forEach((m) => ids.add(m))
  // A trigger's compute path includes the fields passed to the methods it calls.
  for (const e of model.edges) {
    if (e.kind !== 'methodCall' || !ids.has(e.from)) continue
    for (const arg of model.edges) if (arg.kind === 'dataflow' && arg.to === e.to && pageOf(model, arg.from) === pageOf(model, e.from)) ids.add(arg.from)
  }
  const set = new Set(ids)
  for (const e of model.edges) {
    if (ids.has(e.from)) set.add(e.to)
    if (ids.has(e.to)) set.add(e.from)
  }
  return { ids, set }
}

function applyFilters() {
  const selected = view.selected
  const page = selected ? pageOf(view.model, selected) : undefined
  const focus = page !== undefined && view.collapsed.has(page) ? `p:${page}` : selected
  // A selected edge highlights itself and both ends (and every member's ends when merged).
  const picked = view.selectedEdge === null ? undefined : view.drawn[view.selectedEdge]?.edge
  const rel = focus ? related(focus) : picked ? { ids: new Set<string>(), set: new Set([picked.from, picked.to, ...picked.members.flatMap((m) => [m.from, m.to])]) } : null
  for (const [n, { edge, group }] of view.drawn.entries()) {
    const touches = picked ? n === view.selectedEdge : !!rel && edge.members.some((m) => rel.ids.has(m.from) || rel.ids.has(m.to))
    group.classList.toggle('selected', n === view.selectedEdge)
    const hidden = !view.layers[edge.kind]
    group.classList.toggle('hidden', hidden)
    group.classList.toggle('dimmed', !!rel && !touches)
  }
  graph.querySelectorAll<HTMLElement>('[data-id]').forEach((n) => {
    const id = n.dataset.id!
    n.classList.toggle('selected', id === focus)
    if (n.classList.contains('frame') || n.classList.contains('sub-frame') || n.classList.contains('frame-tab')) return
    n.classList.toggle('dimmed', !!rel && !rel.set.has(id))
  })
}

function select(id: string | null) {
  view.selected = view.selected === id ? null : id
  view.selectedEdge = null
  applyFilters()
  renderInspector()
}

function selectEdge(index: number) {
  view.selectedEdge = view.selectedEdge === index ? null : index
  view.selected = null
  applyFilters()
  renderInspector()
}

/* ---------- inspector ---------- */

const inspectorEl = $<HTMLElement>('[data-inspector]')
const workspace = $<HTMLElement>('[data-workspace]')

function renderInspector() {
  const model = view.model
  const edge = view.selectedEdge === null ? undefined : view.drawn[view.selectedEdge]?.edge
  const backend = model.backends.find((b) => b.id === view.selected)
  const node = view.selected ? model.nodes.get(view.selected) : undefined
  inspectorEl.innerHTML = edge ? renderEdge(model, edge) : backend ? renderBackend(backend) : node ? renderNode(model, node) : renderOverview(model, view.description)
}

inspectorEl.addEventListener('click', (event) => {
  const target = event.target as Element
  if (target.closest('[data-close]')) return select(null)
  const jump = target.closest<HTMLElement>('[data-jump-node]')
  if (!jump) return
  const id = jump.dataset.jumpNode!
  const page = pageOf(view.model, id)
  if (page !== undefined && view.collapsed.has(page)) {
    view.collapsed.delete(page)
    render()
  }
  view.selected = null
  select(id)
})

for (const toggle of app.querySelectorAll<HTMLElement>('[data-toggle-inspector]')) {
  toggle.addEventListener('click', () => {
    const collapsed = workspace.classList.toggle('inspector-collapsed')
    $<HTMLElement>('.inspector-rail').hidden = !collapsed
  })
}

{
  const resizer = $<HTMLElement>('[data-inspector-resizer]')
  let start: { x: number; width: number } | null = null
  resizer.addEventListener('pointerdown', (event) => {
    if ((event.target as Element).closest('[data-toggle-inspector]')) return
    start = { x: event.clientX, width: inspectorEl.getBoundingClientRect().width }
    resizer.setPointerCapture(event.pointerId)
    workspace.classList.add('resizing-inspector')
  })
  resizer.addEventListener('pointermove', (event) => {
    if (!start) return
    const width = Math.min(Math.max(260, start.width - (event.clientX - start.x)), workspace.clientWidth - 320)
    workspace.style.setProperty('--inspector-width', `${width}px`)
  })
  const end = () => {
    start = null
    workspace.classList.remove('resizing-inspector')
  }
  resizer.addEventListener('pointerup', end)
  resizer.addEventListener('pointercancel', end)
}

/* ---------- toolbar + legend ---------- */

function glyph(kind: Layer | 'twoway' | 'navTwoway', width = 30): string {
  const c = 'var(--edge)'
  const w = width
  const y = 6
  const tri = `<path d="M${w - 6} ${y - 3.5} L${w} ${y} L${w - 6} ${y + 3.5} z" fill="${c}"/>`
  const body = {
    dataflow: `<circle cx="3" cy="${y}" r="2.6" fill="${c}"/><line x1="3" y1="${y}" x2="${w - 2}" y2="${y}" stroke="${c}" stroke-width="1.6"/>${tri}`,
    methodCall: `<circle cx="3" cy="${y}" r="2.6" fill="${c}"/><line x1="3" y1="${y}" x2="${w - 2}" y2="${y}" stroke="${c}" stroke-width="2.2"/>${tri}`,
    twoway: `<path d="M7 ${y - 3.5} L1 ${y} L7 ${y + 3.5} z" fill="var(--surface)" stroke="${c}" stroke-width="1.2"/><line x1="7" y1="${y}" x2="${w - 2}" y2="${y}" stroke="${c}" stroke-width="1.6"/>${tri}`,
    nav: `<line x1="3" y1="${y}" x2="${w - 7}" y2="${y}" stroke="${c}" stroke-width="6.5" stroke-linecap="round"/><line x1="3" y1="${y}" x2="${w - 7}" y2="${y}" stroke="var(--surface)" stroke-width="2.6" stroke-linecap="round"/><path d="M${w - 9} ${y - 6} L${w} ${y} L${w - 9} ${y + 6} z" fill="${c}"/>`,
    navTwoway: `<line x1="8" y1="${y}" x2="${w - 7}" y2="${y}" stroke="${c}" stroke-width="6.5" stroke-linecap="round"/><line x1="8" y1="${y}" x2="${w - 7}" y2="${y}" stroke="var(--surface)" stroke-width="2.6" stroke-linecap="round"/><path d="M${w - 9} ${y - 6} L${w} ${y} L${w - 9} ${y + 6} z" fill="${c}"/><path d="M9 ${y - 6} L0 ${y} L9 ${y + 6} z" fill="${c}"/>`,
  }[kind]
  return `<svg class="glyph" width="${w + 2}" height="12" viewBox="-1 0 ${w + 2} 12" aria-hidden="true">${body}</svg>`
}

function renderLayers() {
  layersEl.innerHTML = '<span class="label">Layers</span>' + LAYERS.map(([layer, label]) =>
    `<button class="layer-chip" data-layer="${layer}" aria-pressed="${view.layers[layer]}">${glyph(layer)}${label}<span class="ct">${view.model.edges.filter((e) => e.kind === layer).length}</span></button>`).join('')
}

$('[data-legend]').innerHTML =
  `<span>${glyph('dataflow')}Dataflow</span><span>${glyph('methodCall')}Method call</span><span>${glyph('twoway')}Two-way (merged)</span><span>${glyph('nav')}Navigation</span><span>${glyph('navTwoway', 36)}Two-way navigation</span>` +
  Object.values(IO).map(([text, tone], i) => `<span>${badge(text, tone)}${['input', 'output', 'input and output'][i]}</span>`).join('') +
  CHANGE_TYPES.map((changeType) => `<span><i class="change-swatch" style="background:${changeColor(changeType)}"></i>${changeType}</span>`).join('')

pagesButton.addEventListener('click', () => {
  view.collapsed = view.collapsed.size > 0 ? new Set() : new Set(view.model.pages.map((p) => p.name))
  render()
  fit()
})

layersEl.addEventListener('click', (event) => {
  const chip = (event.target as Element).closest<HTMLElement>('[data-layer]')
  if (!chip) return
  const layer = chip.dataset.layer as Layer
  view.layers[layer] = !view.layers[layer]
  renderLayers()
  applyFilters()
})

/* ---------- spec loading ---------- */

function showStatus(message: string | null) {
  statusEl.hidden = message === null
  statusEl.textContent = message ?? ''
}

async function loadFile(file: File, fileName = file.name) {
  try {
    let spec: Spec
    if (file.name.endsWith('.ui.dsl')) {
      const response = await fetch('/__ui-spec/parse', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: await file.text() })
      if (response.status === 400) {
        throw new Error(await response.text())
      } else if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) {
        throw new Error('DSL conversion requires the UI-spec viewer server')
      } else {
        spec = await response.json() as Spec
      }
    } else {
      spec = JSON.parse(await file.text()) as Spec
    }
    if (!spec || typeof spec.id !== 'string' || !spec.pages || !spec.backends || !spec.contentState) {
      throw new Error('expected a ui-spec JSON document with id, contentState, backends and pages')
    }
    view.description = spec.description
    load(deriveModel(spec), fileName)
    showStatus(null)
  } catch (error) {
    showStatus(`${fileName}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

let openedManually = false

async function openDefaultFile() {
  try {
    const response = await fetch('/__ui-spec/default')
    if (response.ok && response.status !== 204) {
      const defaultFile = await response.json() as { fileName: string; contents: string }
      if (!openedManually) await loadFile(new File([defaultFile.contents], defaultFile.fileName, { type: 'application/json' }), defaultFile.fileName)
    }
  } catch {
    // The bundled example remains available when the dev server endpoint is absent.
  }
}

$<HTMLInputElement>('[data-open]').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    openedManually = true
    void loadFile(input.files[0])
  }
  input.value = ''
})
const dropOverlay = $<HTMLDivElement>('[data-drop]')
canvas.addEventListener('dragover', (event) => { event.preventDefault(); dropOverlay.hidden = false })
canvas.addEventListener('dragleave', (event) => { if (event.target === canvas || event.target === dropOverlay) dropOverlay.hidden = true })
canvas.addEventListener('drop', (event) => {
  event.preventDefault()
  dropOverlay.hidden = true
  const file = event.dataTransfer?.files[0]
  if (file) {
    openedManually = true
    void loadFile(file)
  }
})

/* ---------- pan / zoom / clicks ---------- */

function setTransform() {
  graph.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
}

function fit() {
  view.scale = 1
  setTransform()
  const gw = graph.offsetWidth
  const gh = graph.offsetHeight
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight - 40
  view.scale = Math.min(cw / gw, ch / gh, 1.1)
  view.tx = (cw - gw * view.scale) / 2
  view.ty = Math.max(0, (ch - gh * view.scale) / 2)
  setTransform()
}

let drag: { pointerId: number; x: number; y: number; tx: number; ty: number } | null = null

graph.addEventListener('click', (event) => {
  const target = event.target as Element
  const toggle = target.closest<HTMLElement>('[data-toggle]')
  if (toggle) {
    const page = toggle.dataset.toggle!
    if (view.collapsed.has(page)) view.collapsed.delete(page)
    else view.collapsed.add(page)
    return render()
  }
  const edgeGroup = target.closest<SVGGElement>('.edge-group')
  if (edgeGroup) return selectEdge(Number(edgeGroup.dataset.edge))
  const pageNode = target.closest<HTMLElement>('.page-node')
  if (pageNode) {
    view.collapsed.delete(pageNode.dataset.id!.slice(2))
    return render()
  }
  const node = target.closest<HTMLElement>('[data-id]')
  if (node && !node.classList.contains('frame') && !(node.classList.contains('sub-frame') && !target.classList.contains('sub-label'))) return select(node.dataset.id!)
  select(null)
})

canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 2) {
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, tx: view.tx, ty: view.ty }
    canvas.setPointerCapture(event.pointerId)
    canvas.classList.add('right-dragging')
    event.preventDefault()
  }
})
canvas.addEventListener('pointermove', (event) => {
  if (drag?.pointerId === event.pointerId) {
    view.tx = drag.tx + event.clientX - drag.x
    view.ty = drag.ty + event.clientY - drag.y
    setTransform()
  }
})
canvas.addEventListener('pointerup', (event) => {
  if (drag?.pointerId === event.pointerId) {
    canvas.releasePointerCapture(event.pointerId)
    canvas.classList.remove('right-dragging')
    drag = null
  }
})
canvas.addEventListener('pointercancel', (event) => {
  if (drag?.pointerId === event.pointerId) {
    canvas.classList.remove('right-dragging')
    drag = null
  }
})
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.addEventListener('wheel', (event) => {
  event.preventDefault()
  const r = canvas.getBoundingClientRect()
  const mx = event.clientX - r.left
  const my = event.clientY - r.top
  const next = Math.min(2.5, Math.max(0.25, view.scale * Math.exp(-event.deltaY * 0.0015)))
  view.tx = mx - (mx - view.tx) * (next / view.scale)
  view.ty = my - (my - view.ty) * (next / view.scale)
  view.scale = next
  setTransform()
}, { passive: false })
$('[data-zoom]').addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('[data-z]')
  if (!button) return
  if (button.dataset.z === 'fit') return fit()
  const k = button.dataset.z === 'in' ? 1.2 : 1 / 1.2
  const cx = canvas.clientWidth / 2
  const cy = canvas.clientHeight / 2
  view.tx = cx - (cx - view.tx) * k
  view.ty = cy - (cy - view.ty) * k
  view.scale *= k
  setTransform()
})

load(view.model, 'common/ui-spec/ui-root.example.ui.json')
void openDefaultFile()
void document.fonts.ready.then(() => { render(); fit() })
