import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { parseSpec } from '../common/ui-spec/parser/parser.ts'

const examplePath = new URL('../common/ui-spec/ui-root.example.ui.dsl', import.meta.url)
const expected = JSON.parse(readFileSync(new URL('../common/ui-spec/ui-root.example.ui.json', import.meta.url), 'utf8'))

test('the example DSL produces the existing JSON spec', () => {
  assert.deepEqual(parseSpec(readFileSync(examplePath, 'utf8')), expected)
})

test('parsed JSON contains state nodes and every relationship layer', () => {
  const spec = parseSpec(readFileSync(examplePath, 'utf8'))
  assert.deepEqual(spec.content_state.variables.map((variable) => variable.name), ['authenticated_provider', 'chat_transcript'])
  assert.equal(Object.hasOwn(spec, 'external_links'), false)
  assert.ok(spec.relationships.some((edge) => edge.kind === 'nav' && edge.to === 'p:chat_page'))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'nav' && edge.to === 'x:https://www.openworkbookai.org/help'))
  assert.deepEqual(new Set(spec.relationships.map((edge) => edge.kind)), new Set(['nav', 'methodCall', 'dataflow']))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'methodCall' && edge.to === 'm:chat_manager.send_message'))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'dataflow' && edge.from === 'e:chat_page/message' && edge.to === 'm:chat_manager.send_message'))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'dataflow' && edge.from === 'm:chat_manager.send_message' && edge.to === 'e:chat_page/send'))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'dataflow' && edge.from === 's:chat_transcript' && edge.to === 'e:chat_page/transcript'))
  assert.ok(spec.relationships.some((edge) => edge.kind === 'dataflow' && edge.from === 'e:chat_page/send' && edge.to === 's:chat_transcript'))
})

test('schema accepts change types on every node and relationship kind', () => {
  const schema = JSON.parse(readFileSync(new URL('../common/ui-spec/ui-spec.schema.json', import.meta.url), 'utf8'))
  const validate = new Ajv2020().compile(schema)
  const spec = structuredClone(expected)
  spec.content_state.variables[0].changeType = 'modified'
  spec.backends.chat_manager.changeType = 'unchanged'
  spec.backends.chat_manager.methods.auth_open_ai.changeType = 'added'
  spec.pages.chat_page.changeType = 'modified'
  spec.pages.chat_page.elements[0].changeType = 'unchanged'
  spec.pages.chat_page.elements[0].elements[0].changeType = 'deleted'
  for (const edge of spec.relationships) edge.changeType = 'unchanged'
  assert.equal(validate(spec), true, JSON.stringify(validate.errors))
  spec.relationships[0].changeType = 'renamed'
  assert.equal(validate(spec), false)
  spec.relationships[0].changeType = 'unchanged'
  spec.pages.chat_page.unexpected = true
  assert.equal(validate(spec), false)
  delete spec.pages.chat_page.unexpected
  spec.changeType = 'modified'
  assert.equal(validate(spec), false)
  delete spec.changeType
  const dataflow = spec.relationships.find((edge) => edge.kind === 'dataflow')!
  dataflow.role = 'arg'
  assert.equal(validate(spec), false)
  delete dataflow.role
  dataflow.kind = 'read'
  assert.equal(validate(spec), false)
  dataflow.kind = 'dataflow'
  delete spec.relationships[0].from
  assert.equal(validate(spec), false)
})

test('embedded code preserves strings, regexes, templates, nested blocks, and comments', () => {
  const handler = [
    'const value = { text: "};", nested: { count: 1 } };',
    'const pattern = /[{}]/;',
    'const message = `value: ${value.text}`;',
    '// Keep the next statement on its own line: }',
    'if (pattern.test(message)) { value.nested.count++; }',
    'record(value)',
    'record(message)',
  ].join('\n')
  const spec = parseSpec(`app example {
    content_state { let values = [{ text: "}" }]; }
    page home { button run { on_click { ${handler}\n } } }
  }`)
  const output = spec.pages.home.elements[0].on_click!
  assert.deepEqual(spec.content_state.variables, [{ id: 's:values', name: 'values', initialization: 'let values = [{ text: "}" }];' }])
  assert.ok(output.includes('const pattern = /[{}]/;'))
  assert.ok(output.includes('`value: ${value.text}`'))
  assert.ok(output.includes('// Keep the next statement on its own line: }\n'))
  assert.ok(output.includes('record(value)\nrecord(message)'))
  // Execute this test fixture only, to verify that serialization preserves behavior.
  const recorded: unknown[] = []
  new Function('record', output)((value: unknown) => recorded.push(value))
  assert.deepEqual(recorded, [{ text: '};', nested: { count: 2 } }, 'value: };'])
})

test('doc comments attach to declarations and backend signatures keep nested type syntax', () => {
  const spec = parseSpec(`app example {
    content_state {}
    /** Storage API. */
    backend storage {
      /** Return a record. */
      get(key: string): { value: string; metadata: { version: number } };
    }
    page home {
      container body {
        /**
         * Render both values.
         * Keep them readable.
         */
        custom summary { reads first, second; }
        // An ordinary comment does not become documentation.
        text_field input;
      }
    }
  }`)
  assert.deepEqual(spec.backends.storage, {
    description: 'Storage API.',
    methods: {
      get: {
        signature: 'get(key: string): { value: string; metadata: { version: number } }',
        description: 'Return a record.',
      },
    },
  })
  assert.deepEqual(spec.pages.home.elements[0].elements, [
    { id: 'summary', kind: 'custom', io: 'input_output', description: 'Render both values.\nKeep them readable.', reads: ['first', 'second'] },
    { id: 'input', kind: 'text_field', io: 'input' },
  ])
})

test('leaf elements get an io direction from their kind alone', () => {
  const spec = parseSpec(`app example {
    content_state {}
    page home {
      container body {
        button go;
        text_field name;
        text_area notes;
        link help { url "https://example.com"; }
        text label;
        custom widget;
      }
    }
  }`)
  const body = spec.pages.home.elements[0]
  assert.equal(body.io, undefined)
  assert.deepEqual(body.elements!.map(element => [element.kind, element.io]), [
    ['button', 'input'],
    ['text_field', 'input'],
    ['text_area', 'input'],
    ['link', 'input_output'],
    ['text', 'output'],
    ['custom', 'input_output'],
  ])
})

test('invalid syntax and duplicate declarations report source locations', () => {
  const cases: [string, RegExp][] = [
    ['app example { content_state { let value = ; } }', /Unexpected token/],
    ['app example { content_state { record(value); } }', /Expected an initialized content-state variable/],
    ['app example { content_state {} page home { button go { on_click { let x = ; } } } }', /Unexpected token/],
    ['app example { content_state {} page home { mystery item; } }', /Unknown element kind/],
    ['app example { content_state {} page home { button go { unknown value; } } }', /Unknown element property/],
    ['app example { content_state {} page "home" {} }', /unquoted identifier/],
    ['app example { content_state {} backend api { call(value: ): void; } }', /Unexpected token/],
    ['app example { content_state {} backend api { call(): void } }', /after backend method signature/],
    ['app example { content_state {} content_state {} }', /Duplicate content_state/],
    ['app example { content_state {} page home {} page home {} }', /Duplicate declaration/],
    ['app example { content_state {}', /Expected content_state, backend, or page/],
    ['app example { content_state {} } extra', /Unexpected content after app/],
  ]
  for (const [source, message] of cases) {
    assert.throws(() => parseSpec(source), error => {
      assert.ok(error instanceof SyntaxError)
      assert.match(error.message, message)
      assert.match(error.message, /at \d+:\d+$/)
      return true
    }, source)
  }
  assert.throws(() => parseSpec('app example {\n  unknown\n}'), /at 2:3$/)
})

test('the CLI writes JSON to stdout or an output file and fails on invalid input', () => {
  const cliPath = new URL('../common/ui-spec/parser/parse-spec.ts', import.meta.url)
  const directory = mkdtempSync(join(tmpdir(), 'spec-parser-'))
  try {
    const stdout = spawnSync(process.execPath, [cliPath.pathname, examplePath.pathname], { encoding: 'utf8' })
    assert.equal(stdout.status, 0, stdout.stderr)
    assert.deepEqual(JSON.parse(stdout.stdout), expected)

    const outputPath = join(directory, 'spec.ui.json')
    const file = spawnSync(process.execPath, [cliPath.pathname, examplePath.pathname, outputPath], { encoding: 'utf8' })
    assert.equal(file.status, 0, file.stderr)
    assert.deepEqual(JSON.parse(readFileSync(outputPath, 'utf8')), expected)

    const invalid = spawnSync(process.execPath, [cliPath.pathname, outputPath], { encoding: 'utf8' })
    assert.equal(invalid.status, 1)
    assert.match(invalid.stderr, /Expected 'app'.*at 1:1/)
    assert.equal(invalid.stdout, '')
  } finally {
    rmSync(directory, { recursive: true })
  }
})
