import { createScanner, LanguageVariant, SyntaxKind, type Scanner } from 'typescript/unstable/ast'
import { parseSync } from 'rolldown/experimental'
import { populateRelationships } from './relationships.ts'
import { stateId } from './ids.ts'

interface Documented {
  description?: string
  changeType?: ChangeType
}

export type ChangeType = 'added' | 'modified' | 'deleted' | 'unchanged'
export type ElementIo = 'input' | 'output' | 'input_output'

interface Element extends Documented {
  id: string
  kind: string
  io?: ElementIo
  elements?: Element[]
  on_click?: string
  url?: string
  content?: string
  reads?: string[]
}

interface Backend extends Documented {
  methods: Record<string, Documented & { signature: string }>
}

export interface Spec {
  id: string
  description?: string
  contentState: { variables: { id: string; name: string; initialization: string; changeType?: ChangeType }[] }
  backends: Record<string, Backend>
  pages: Record<string, Documented & { elements: Element[] }>
  relationships: Edge[]
}

export type Edge = {
  kind: 'nav' | 'dataflow' | 'methodCall'
  from: string
  to: string
  changeType?: ChangeType
}

const elementKinds = new Set([
  'button', 'text_field', 'text_area', 'container', 'link', 'text', 'custom',
])

// Data direction relative to the user, derived from the element kind alone.
// Containers have no direction. Custom elements are treated as both for now.
const elementIo: Record<string, ElementIo> = {
  button: 'input',
  text_field: 'input',
  text_area: 'input',
  link: 'input_output',
  text: 'output',
  custom: 'input_output',
}

export function parseSpec(source: string): Spec {
  return populateRelationships(new Parser(source).parse())
}

class Parser {
  private source: string
  private scanner: Scanner
  private token = SyntaxKind.Unknown
  private documentation: Documented = {}

  constructor(source: string) {
    this.source = source
    this.scanner = createScanner(false, LanguageVariant.Standard, source)
    this.advance()
  }

  private fail(message: string, position = this.scanner.getTokenStart()): never {
    const lines = this.source.slice(0, position).split('\n')
    throw new SyntaxError(`${message} at ${lines.length}:${lines.at(-1)!.length + 1}`)
  }

  private advance() {
    this.documentation = {}
    this.token = this.scanner.scan()
    while (this.token >= SyntaxKind.FirstTriviaToken && this.token <= SyntaxKind.LastTriviaToken) {
      if (this.token === SyntaxKind.MultiLineCommentTrivia && this.scanner.getTokenText().startsWith('/**')) {
        if (this.scanner.isUnterminated()) this.fail('Unterminated doc comment')
        this.documentation = {
          description: this.scanner.getTokenText().slice(3, -2)
            .split('\n').map(line => line.trim().replace(/^\* ?/, '')).join('\n').trim(),
        }
      }
      this.token = this.scanner.scan()
    }
  }

  private at(text: string) {
    return this.scanner.getTokenText() === text
  }

  private expect(text: string) {
    if (!this.at(text)) this.fail(`Expected '${text}', found '${this.scanner.getTokenText() || 'end of input'}'`)
    this.advance()
  }

  private identifier(): string {
    if (this.token !== SyntaxKind.Identifier) this.fail('Expected an unquoted identifier')
    const name = this.scanner.getTokenText()
    this.advance()
    return name
  }

  private unique(object: object, name: string) {
    if (Object.hasOwn(object, name)) this.fail(`Duplicate declaration '${name}'`)
  }

  private codeBlock() {
    if (!this.at('{')) this.fail("Expected '{'")
    const start = this.scanner.getTokenStart()
    let diagnostic: { message: string; position: number } | undefined
    for (let end = this.source.indexOf('}', start + 1); end !== -1; end = this.source.indexOf('}', end + 1)) {
      const source = this.source.slice(start, end + 1)
      const result = parseSync('handler.ts', source, { lang: 'ts' })
      const block = result.program.body[0]
      if (result.errors.length === 0 && result.program.body.length === 1 && block?.type === 'BlockStatement' && block.end === source.length) {
        let code = source.slice(1, -1)
        for (let index = block.body.length - 1; index > 0; index--) {
          const previous = block.body[index - 1]
          const nextStart = block.body[index].start
          if (source[previous.end - 1] === ';' && source.slice(previous.end, nextStart).trim() === '') {
            code = code.slice(0, previous.end - 1) + ' ' + code.slice(nextStart - 1)
          }
        }
        this.scanner.resetTokenState(start + block.end)
        this.advance()
        let previousEnd = 1
        return {
          initialization: block.body.map(statement => {
            const text = source.slice(previousEnd, statement.end).trim()
            previousEnd = statement.end
            return text
          }),
          code: code.trim(),
        }
      }
      if (diagnostic === undefined && result.errors.length > 0) {
        diagnostic = { message: result.errors[0].message, position: start + (result.errors[0].labels[0]?.start ?? 0) }
      }
    }
    if (diagnostic !== undefined) this.fail(diagnostic.message, diagnostic.position)
    this.fail('Expected a code block')
  }

  parse(): Spec {
    const documentation = this.documentation
    this.expect('app')
    const spec: Spec = {
      id: this.identifier(),
      ...documentation,
      contentState: { variables: [] },
      backends: {},
      pages: {},
      relationships: [],
    }
    let hasContentState = false
    this.expect('{')
    while (!this.at('}')) {
      const documentation = this.documentation
      if (this.at('content_state')) {
        if (hasContentState) this.fail('Duplicate content_state block')
        this.advance()
        spec.contentState.variables = this.codeBlock().initialization.map((initialization) => {
          const match = initialization.match(/^\s*(?:let|const|var)\s+(\w+)\s*=\s*[\s\S]+$/)
          if (!match) this.fail('Expected an initialized content-state variable')
          return { id: stateId(match[1]), name: match[1], initialization }
        })
        hasContentState = true
      } else if (this.at('backend')) {
        this.advance()
        const name = this.identifier()
        this.unique(spec.backends, name)
        spec.backends = { ...spec.backends, [name]: { ...documentation, methods: this.backendMethods() } }
      } else if (this.at('page')) {
        this.advance()
        const name = this.identifier()
        this.unique(spec.pages, name)
        spec.pages = { ...spec.pages, [name]: { ...documentation, elements: this.elements() } }
      } else {
        this.fail('Expected content_state, backend, or page')
      }
    }
    this.expect('}')
    if (this.token !== SyntaxKind.EndOfFile) this.fail('Unexpected content after app')
    if (!hasContentState) this.fail('Expected one content_state block')
    return spec
  }

  private backendMethods(): Backend['methods'] {
    let methods: Backend['methods'] = {}
    this.expect('{')
    while (!this.at('}')) {
      const documentation = this.documentation
      const start = this.scanner.getTokenStart()
      const prefix = 'interface Backend { '
      let signature: string | undefined
      let name: string | undefined
      let diagnostic: { message: string; position: number } | undefined
      for (let end = start; end < this.source.length; end++) {
        if (this.source[end] === ';') {
          const candidate = this.source.slice(start, end + 1)
          const result = parseSync('backend.ts', prefix + candidate + ' }', { lang: 'ts' })
          const declaration = result.program.body[0]
          const method = declaration?.type === 'TSInterfaceDeclaration' ? declaration.body.body[0] : undefined
          if (result.errors.length === 0 && declaration?.type === 'TSInterfaceDeclaration' && declaration.body.body.length === 1 && method?.type === 'TSMethodSignature' && method.key.type === 'Identifier') {
            signature = candidate
            name = method.key.name
            break
          }
          if (diagnostic === undefined && result.errors.length > 0) {
            diagnostic = { message: result.errors[0].message, position: start + (result.errors[0].labels[0]?.start ?? 0) - prefix.length }
          }
        } else if (this.source[end] === '}') {
          const result = parseSync('backend.ts', prefix + this.source.slice(start, end + 1), { lang: 'ts' })
          const declaration = result.program.body[0]
          const method = declaration?.type === 'TSInterfaceDeclaration' ? declaration.body.body[0] : undefined
          if (result.errors.length === 0 && declaration?.type === 'TSInterfaceDeclaration' && declaration.body.body.length === 1 && method?.type === 'TSMethodSignature') {
            this.fail("Expected ';' after backend method signature", end)
          }
        }
      }
      if (signature === undefined || name === undefined) {
        if (diagnostic !== undefined) this.fail(diagnostic.message, diagnostic.position)
        this.fail('Expected a backend method signature')
      }
      this.unique(methods, name)
      methods = { ...methods, [name]: { signature: signature.slice(0, -1), ...documentation } }
      this.scanner.resetTokenState(start + signature.length)
      this.advance()
    }
    this.expect('}')
    return methods
  }

  private elements(): Element[] {
    const elements: Element[] = []
    this.expect('{')
    while (!this.at('}')) elements.push(this.element())
    this.expect('}')
    return elements
  }

  private element(): Element {
    const documentation = this.documentation
    const kind = this.scanner.getTokenText()
    if (!elementKinds.has(kind)) this.fail(`Unknown element kind '${kind}'`)
    this.advance()
    const element: Element = { id: this.identifier(), kind, ...documentation }
    if (Object.hasOwn(elementIo, kind)) element.io = elementIo[kind]
    if (this.at(';')) {
      this.advance()
    } else if (kind === 'container') {
      element.elements = this.elements()
    } else if (this.at('{')) {
      this.advance()
      while (!this.at('}')) {
        const property = this.scanner.getTokenText()
        this.unique(element, property)
        this.advance()
        if (property === 'on_click') {
          element.on_click = this.codeBlock().code
        } else if (property === 'url') {
          if (this.token !== SyntaxKind.StringLiteral || this.scanner.isUnterminated()) this.fail('Expected a URL string')
          element.url = this.scanner.getTokenValue()
          this.advance()
          this.expect(';')
        } else if (property === 'content') {
          element.content = this.identifier()
          this.expect(';')
        } else if (property === 'reads') {
          element.reads = [this.identifier()]
          while (this.at(',')) {
            this.advance()
            element.reads.push(this.identifier())
          }
          this.expect(';')
        } else {
          this.fail(`Unknown element property '${property}'`)
        }
      }
      this.expect('}')
    } else {
      this.fail("Expected ';' or an element body")
    }
    return element
  }
}
