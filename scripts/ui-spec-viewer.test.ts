import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Spec } from '../common/ui-spec/parser/parser.ts'
import { deriveModel, splitStatements } from '../common/ui-spec/viewer/src/model.ts'
import { drawableEdges } from '../common/ui-spec/viewer/src/edges.ts'
import { qualifiedName, renderEdge, renderNode } from '../common/ui-spec/viewer/src/inspector.ts'
import { Router, bezierControls, bezierPoint, separate, stub, type Port } from '../common/ui-spec/viewer/src/route.ts'

const left: Port = { x: 0, y: 0, nx: 1, ny: 0 }
const right: Port = { x: 300, y: 0, nx: -1, ny: 0 }

const spec: Spec = JSON.parse(readFileSync(new URL('../common/ui-spec/ui-root.example.ui.json', import.meta.url), 'utf8'))
const model = deriveModel(spec)
const has = (kind: string, from: string, to: string, role?: string) =>
  model.edges.some((e) => e.kind === kind && e.from === from && e.to === to && (role === undefined || e.role === role))

test('splitStatements ignores semicolons inside strings and brackets', () => {
  assert.deepEqual(splitStatements("a = [1; 2]; b('x;y'); c"), ['a = [1; 2]', "b('x;y')", 'c'])
})

test('derives nodes and page columns from the example spec', () => {
  assert.deepEqual(model.state.map((s) => s.name), ['authenticated_provider', 'chat_transcript'])
  assert.equal(model.methods.length, 6)
  assert.equal(model.pages[0].entry, true)
  assert.deepEqual(Object.fromEntries(model.columns), { provider_selection: 0, open_router_sign_in: 1, open_ai_sign_in: 1, chat_page: 2 })
})

test('derives navigation, dataflow and state edges from on_click and reads', () => {
  assert.ok(has('nav', 'e:provider_selection/select_open_router', 'p:open_router_sign_in'))
  assert.ok(has('dataflow', 'e:open_router_sign_in/save_key', 'm:chat_manager.auth_open_router', 'call'))
  assert.ok(has('dataflow', 'e:open_router_sign_in/api_key', 'm:chat_manager.auth_open_router', 'arg'))
  assert.ok(has('dataflow', 'm:chat_manager.send_message', 'e:chat_page/send', 'return'))
  assert.ok(has('write', 'e:open_router_sign_in/save_key', 's:authenticated_provider'))
  assert.ok(has('read', 's:chat_transcript', 'e:chat_page/transcript'))
  const sendWrites = model.edges.filter((e) => e.kind === 'write' && e.from === 'e:chat_page/send')
  assert.equal(sendWrites.length, 1, 'repeated writes to the same variable are one edge')
})

test('merges a call and its return into one two-way dataflow edge', () => {
  const edges = drawableEdges(model, new Set())
  const send = edges.filter((e) => e.kind === 'dataflow' && [e.from, e.to].includes('e:chat_page/send') && [e.from, e.to].includes('m:chat_manager.send_message'))
  assert.equal(send.length, 1)
  assert.equal(send[0].from, 'e:chat_page/send')
  assert.equal(send[0].back, true)
  assert.equal(send[0].members.length, 2)
})

test('collapsing a page reroutes its edges to the page and re-merges them', () => {
  const edges = drawableEdges(model, new Set(['open_router_sign_in']))
  const toAuth = edges.filter((e) => e.kind === 'dataflow' && e.to === 'm:chat_manager.auth_open_router')
  assert.equal(toAuth.length, 1, 'trigger and argument edges merge once both start at the collapsed page')
  assert.equal(toAuth[0].from, 'p:open_router_sign_in')
  assert.equal(toAuth[0].members.length, 2)
  assert.ok(edges.every((e) => !e.from.startsWith('e:open_router_sign_in/') && !e.to.startsWith('e:open_router_sign_in/')))
})

test('return navigation has no special routing: it leaves the source left side for the target anchor', () => {
  const edges = drawableEdges(model, new Set(['open_router_sign_in', 'open_ai_sign_in', 'chat_page']))
  const returns = edges.filter((e) => e.kind === 'nav' && e.to === 'p:provider_selection')
  assert.equal(returns.length, 3)
  for (const edge of returns) {
    assert.equal(edge.fromSide, 'l')
    assert.equal(edge.toSide, 'r')
    assert.equal(edge.toAnchor, true)
  }
})

test('navigation between two collapsed pages merges into one two-way rail', () => {
  const all = new Set(model.pages.map((p) => p.name))
  const nav = drawableEdges(model, all).filter((e) => e.kind === 'nav')
  const pair = nav.filter((e) => [e.from, e.to].includes('p:provider_selection') && [e.from, e.to].includes('p:open_router_sign_in'))
  assert.equal(pair.length, 1)
  assert.equal(pair[0].from, 'p:provider_selection', 'the forward direction is drawn')
  assert.equal(pair[0].toAnchor, true)
  assert.equal(pair[0].back, true)
  const back = nav.find((e) => e.from === 'p:chat_page' && e.to === 'p:provider_selection')!
  assert.equal(back.back, false, 'a one-way return stays one-way')
})

test('navigation from an expanded page stays per trigger', () => {
  const nav = drawableEdges(model, new Set(['open_router_sign_in'])).filter((e) => e.kind === 'nav' && e.to === 'p:open_router_sign_in')
  assert.deepEqual(nav.map((e) => [e.from, e.back]), [['e:provider_selection/select_open_router', false]])
})

test('routes around a node that blocks the straight path', () => {
  const blocker = { x: 100, y: -50, w: 100, h: 100 }
  const router = new Router([blocker], [stub(left), stub(right)])
  const [c0, c1] = bezierControls(left, right)
  const samples = Array.from({ length: 41 }, (_, i) => bezierPoint(left, c0, c1, right, i / 40))
  assert.equal(router.clear(samples, new Set()), false)
  const path = router.route(left, right, new Set())!
  assert.ok(path.length > 2)
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]]
    for (let t = 0; t <= 1; t += 0.05) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
      assert.ok(!(x > blocker.x && x < blocker.x + blocker.w && y > blocker.y && y < blocker.y + blocker.h), 'path stays outside the node')
    }
  }
  assert.deepEqual(path[0], { x: 0, y: 0 })
  assert.deepEqual(path[path.length - 1], { x: 300, y: 0 })
})

test('separate moves routed edges that share a line into their own lanes', () => {
  // Two paths that run along the same horizontal line y=100 between x=60 and x=200.
  const a = [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 }]
  const b = [{ x: 60, y: 0 }, { x: 60, y: 100 }, { x: 260, y: 100 }, { x: 260, y: 300 }]
  const [pa, pb] = separate([a, b])
  const horizontal = (path: { x: number; y: number }[]) => path.slice(0, -1).flatMap((p, k) =>
    Math.abs(p.y - path[k + 1].y) < 0.01 && Math.abs(p.x - path[k + 1].x) > 0.01 ? [p.y] : [])
  assert.notDeepEqual(horizontal(pa), horizontal(pb))
  // Endpoints and the stubs leaving them stay where they were.
  assert.deepEqual([pa[0], pa.at(-1), pb[0], pb.at(-1)], [{ x: 0, y: 0 }, { x: 200, y: 300 }, { x: 60, y: 0 }, { x: 260, y: 300 }])
  assert.equal(pa[1].x, 0)
  assert.equal(pb[1].x, 60)
})

test('inspector shows the full initialization statement and method signature', () => {
  const state = renderNode(model, model.nodes.get('s:chat_transcript')!)
  assert.match(state, /let chat_transcript = \[\];/)
  const method = renderNode(model, model.nodes.get('m:chat_manager.send_message')!)
  assert.match(method, /send_message\(content: string\): \{ role: &#39;user&#39;|send_message\(content: string\): \{ role: 'user'/)
  assert.match(method, /Add the user message/)
})

test('inspector shows the full on_click of elements that have one', () => {
  const html = renderNode(model, model.nodes.get('e:chat_page/send')!)
  assert.match(html, /on_click/)
  assert.match(html, /const reply = chat_manager\.send_message\(message\);\nchat_transcript = \[\.\.\.chat_transcript, reply\];/)
  assert.doesNotMatch(renderNode(model, model.nodes.get('e:chat_page/message')!), /on_click/)
})

test('inspector names both ends of single and merged edges', () => {
  assert.equal(qualifiedName(model, 'e:chat_page/sign_out'), 'chat_page › settings › sign_out')
  const edges = drawableEdges(model, new Set(['open_router_sign_in']))
  const merged = edges.find((e) => e.kind === 'dataflow' && e.to === 'm:chat_manager.auth_open_router')!
  const mergedHtml = renderEdge(model, merged)
  assert.match(mergedHtml, /2 edges/)
  assert.match(mergedHtml, /open_router_sign_in › save_key/)
  assert.match(mergedHtml, /open_router_sign_in › api_key/)
  const single = edges.find((e) => e.members.length === 1 && e.kind === 'dataflow' && e.to === 'm:chat_manager.reset_chat')!
  const singleHtml = renderEdge(model, single)
  assert.match(singleHtml, /From/)
  assert.match(singleHtml, /chat_page › clear_chat/)
  assert.match(singleHtml, /chat_manager\.reset_chat/)
})

test('navigation inspector shows the pages and the element that triggers each navigation', () => {
  const all = new Set(model.pages.map((p) => p.name))
  const rail = drawableEdges(model, all).find((e) => e.kind === 'nav' && e.from === 'p:provider_selection' && e.to === 'p:open_router_sign_in')!
  const html = renderEdge(model, rail)
  assert.match(html, /Two-way navigation/)
  assert.match(html, /Triggered by/)
  assert.match(html, /provider_selection › select_open_router/)
  assert.match(html, /open_router_sign_in › back_to_providers/)
  const single = drawableEdges(model, new Set()).find((e) => e.kind === 'nav' && e.members.length === 1 && e.members[0].from === 'e:chat_page/sign_out')!
  const one = renderEdge(model, single)
  assert.match(one, /chat_page › settings › sign_out/)
  assert.match(one, /data-jump-node="p:chat_page"/, 'the From card is the trigger page')
})
