import { readFileSync, writeFileSync } from 'node:fs'
import { parseSpec } from './parser.ts'

const [inputPath, outputPath, ...extra] = process.argv.slice(2)

if (!inputPath || extra.length > 0) {
  console.error('Usage: npm run parse-ui-spec -- <input.ui.dsl> [output.ui.json]')
  process.exitCode = 1
} else {
  try {
    const json = JSON.stringify(parseSpec(readFileSync(inputPath, 'utf8')), null, 2) + '\n'
    if (outputPath) {
      writeFileSync(outputPath, json)
    } else {
      process.stdout.write(json)
    }
  } catch (error) {
    console.error(`${inputPath}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
