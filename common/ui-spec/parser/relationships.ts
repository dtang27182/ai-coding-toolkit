import { elementId, externalId, methodId, pageId, stateId } from './ids.ts'
import type { Edge, Spec } from './parser.ts'

export function populateRelationships(spec: Spec): Spec {
  const stateNames = new Set(spec.contentState.variables.map((variable) => variable.name))
  const backendNames = new Set(Object.keys(spec.backends))
  const relationships: Edge[] = []
  const add = (relationship: Edge) => {
    if (!relationships.some((existing) => existing.kind === relationship.kind && existing.from === relationship.from && existing.to === relationship.to)) relationships.push(relationship)
  }

  for (const [page, definition] of Object.entries(spec.pages)) {
    const elements: Spec['pages'][string]['elements'] = []
    const collect = (items: typeof elements) => {
      for (const element of items) {
        elements.push(element)
        if (element.kind === 'container') collect(element.elements ?? [])
      }
    }
    collect(definition.elements)

    for (const element of elements) {
      const from = elementId(page, element.id)
      for (const statement of splitStatements(element.on_click ?? '')) {
        const nav = statement.match(/^navigate\(\s*['"](\w+)['"]\s*\)$/)
        if (nav) {
          add({ kind: 'nav', from, to: pageId(nav[1]) })
        } else {
          let callId: string | undefined
          const call = statement.match(/(\w+)\.(\w+)\(([^)]*)\)/)
          if (call && backendNames.has(call[1])) {
            callId = methodId(call[1], call[2])
            add({ kind: 'methodCall', from, to: callId })
            for (const arg of call[3].split(',').map((value) => value.trim()).filter(Boolean)) {
              const source = elements.find((candidate) => candidate.id === arg)
              if (source) add({ kind: 'dataflow', from: elementId(page, source.id), to: callId })
            }
          }
          const assignment = statement.match(/^(?:const\s+|let\s+)?(\w+)\s*=\s*([\s\S]+)$/)
          if (assignment) {
            if (callId) add({ kind: 'dataflow', from: callId, to: from })
            if (stateNames.has(assignment[1])) add({ kind: 'dataflow', from, to: stateId(assignment[1]) })
          }
        }
      }
      if (element.kind === 'link' && element.url) {
        add({ kind: 'nav', from, to: externalId(element.url) })
      }
      for (const read of element.reads ?? []) if (stateNames.has(read)) add({ kind: 'dataflow', from: stateId(read), to: from })
      const content = element.content?.trim()
      if (element.kind === 'text' && content && stateNames.has(content)) add({ kind: 'dataflow', from: stateId(content), to: from })
    }
  }

  spec.relationships = relationships
  return spec
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
