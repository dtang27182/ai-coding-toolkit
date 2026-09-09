# Architecture Diff Skills Plan

## Behavior

Create a portable `ai-coding-toolkit` directory that can be copied into another repository and initialized for a supported coding agent. The toolkit will contain three agent-neutral skills that generate architecture diff JSON at the high-level design, low-level design, and code review stages. All three skills use one shared format, limit their output to evidence available at their stage, and run the shared deterministic validator before reporting success.

Canonical source files will remain under `ai-coding-toolkit`. Initialization may create agent-specific discovery links outside that directory, but those links will point back to the canonical skill definitions.

## Interface Points

The existing example will move into the portable toolkit layout.

- Move `ai-coding-toolkit/architecture-diff.example.json` to `ai-coding-toolkit/examples/architecture-diff.example.json` and update it as the format evolves.

The shared contract and commands will provide one source of truth for every agent integration.

- Add `ai-coding-toolkit/schemas/architecture-diff.schema.json` to define the format.
- Add `ai-coding-toolkit/scripts/validate-architecture-diff.mjs` to validate generated files.
- Add `ai-coding-toolkit/scripts/architecture-diff-to-mermaid.mjs` to convert generated files into Mermaid diagrams.
- Add `ai-coding-toolkit/scripts/init.mjs` to initialize the toolkit for a selected agent and configure its repository-relative output directory.
- Add `ai-coding-toolkit/config.json` to store the selected output directory.
- Add `ai-coding-toolkit/package.json` to define commands and pin validator dependencies.

The canonical architecture diff skills will provide distinct, agent-neutral generation workflows.

- Add `ai-coding-toolkit/skills/architecture-diff-hld/SKILL.md` for high-level design generation.
- Add `ai-coding-toolkit/skills/architecture-diff-lld/SKILL.md` for low-level design generation.
- Add `ai-coding-toolkit/skills/architecture-diff-cr/SKILL.md` for code review generation.

Agent adapters will install the canonical skills into each agent's discovery location.

- Add `ai-coding-toolkit/adapters/codex.mjs` to expose the skills under `.agents/skills`.
- Allow additional adapters to be added without changing the schema, validator, or canonical skills.

## Implementation Details

### Shared Contract

Finalize the schema, allowed stage values, and feature-based output filenames before creating the skills. Keep examples and the schema under `ai-coding-toolkit`, and write generated output to the configured repository-relative directory. Each skill will access the shared files through repository-relative `ai-coding-toolkit` paths instead of duplicating them.

### Shared Validator

Add one Node command-line validator that accepts an architecture diff file path. It will validate JSON syntax, enforce the shared schema, confirm class names are unique, and confirm every relationship endpoint references a declared class. It will print actionable errors and exit unsuccessfully when validation fails.

### Mermaid Converter

Add one Node command-line converter that validates an architecture diff file and writes a Markdown file containing a Mermaid flowchart. Group added and modified classes within a change-scope subgraph, keep unchanged context classes outside it, show crossing data flows through small boundary nodes, distinguish composition edges, and display changed methods within class nodes.

### Initialization and Adapters

The initializer will accept an agent name and an optional repository-relative output directory, defaulting to `docs/plans`. It will store the selected directory in `ai-coding-toolkit/config.json`, add a root `npm run mermaid` command when the repository has a `package.json`, and delegate discovery setup to the matching adapter. The Codex adapter will expose the canonical skill directories under `.agents/skills`, using links so the installed skills continue to use the source under `ai-coding-toolkit`. Initialization will be repeatable and will not overwrite unrelated agent configuration or npm scripts.

The adapter boundary will contain all agent-specific paths and metadata. Adding support for another coding agent will require only a new adapter when that agent can consume the canonical `SKILL.md` format. A copy mode may be added for environments where directory links are unavailable.

### Canonical Skills

Keep the `SKILL.md` files independent of Codex-specific tools, commands, and UI behavior. Each skill will describe its required inputs and output, use ordinary repository and Git operations, reference the shared schema and example, and invoke the shared validator through its stable command-line interface.

### HLD Skill

Generate conceptual classes, changed public methods, relationships, and core-change markers from the high-level design conversation without requiring implemented code. Write the result to the configured output directory using a kebab-case feature name in the filename.

### LLD Skill

Read the high-level design architecture diff, low-level design discussion, and repository to refine conceptual entries into concrete planned classes, methods, and relationships.

### CR Skill

Inspect the Git diff and repository to generate a code review architecture diff containing only changes supported by the resulting code. Compare it with earlier architecture diffs when they are available.

Keep the three skill folders instruction-only initially. Shared executable behavior will remain in `ai-coding-toolkit/scripts` rather than being copied into each skill.

## Verification

- Validate each skill with the skill validator.
- Run one representative prompt for each stage.
- Confirm the example and representative generated files pass the shared validator.
- Confirm the example converts to deterministic Mermaid output.
- Confirm malformed JSON, invalid fields, duplicate classes, and unresolved relationships fail validation.
- Confirm later-stage skills preserve supported information while correcting unsupported earlier assumptions.
- Copy `ai-coding-toolkit` into a temporary repository and run the initializer for Codex.
- Confirm the initialized discovery links resolve to the canonical skills under `ai-coding-toolkit`.
- Confirm the toolkit contains no required canonical source outside `ai-coding-toolkit`.
