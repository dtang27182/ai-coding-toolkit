# HLD Generator Architecture

## Purpose

The HLD generator develops and improves one high-level design from a feature conversation and the current code. Before designing, it presents the desired behavior and scope to the user and waits for explicit confirmation.

The objective is the simplest design that preserves required new and existing behavior. The rubric scores change size, concentration, and Variable Exposure.

The HLD sketches core logic and dataflow, architectural fit, data ingress and egress, and interactions with new state. It covers core use cases; detailed error handling, edge cases, and integration changes belong to later design work.

## Skills

- **`hld-gen`** creates the narrative and Architecture Diff together, derives Variable Exposure from the Architecture Diff, runs the counter, and chooses revisions from evaluation results.
- **`hld-eval`** scores the HLD against feature context, current code, and the rubric. It writes the evaluation report, refreshes derived Variable Exposure counts, and provides no revision advice. It also supports standalone evaluation.

## Evaluation and Revision

`hld-gen` populates Variable Exposure after the narrative and architectural design are complete, then runs the counter and follows `hld-eval`. It uses the assessment and each attribute's preferred direction to revise the same files in place, then repeats the exposure and evaluation steps. Only the current HLD and latest evaluation are retained.

The rubric in `references/hld-quality.md` stays fixed during a run. Revision stops when all attributes reach their rubric-defined best values or the generator cannot identify another improvement. The loop is carried out through skill instructions, without a separate runner.

The generator records why it stopped and presents the artifacts for human review. An interruption after a design edit is reported as an unevaluated current design. Application implementation is a separate task.

## Scripts and Files

The tool's source lives under `hld-gen/`:

```text
hld-gen/
  skills/
    hld-gen/
    hld-eval/
  scripts/
  references/
```

`scripts/` contains the JSON validator, Variable Exposure counter, and Mermaid converter. Each can run directly from the command line. The toolkit's shared initializer and agent adapters expose the skills from `hld-gen/skills/`.

`references/` defines the tool's contracts:

- [hld-narrative.md](references/hld-narrative.md): narrative scope and six-section structure.
- [hld-architecture-diff.md](references/hld-architecture-diff.md): architectural representation, supported by the schema and example in the same directory.
- [hld-quality.md](references/hld-quality.md): score definitions and preferred directions.
- [hld-variable-exposure.md](references/hld-variable-exposure.md): existing variable scope, declaration inventories, and counting rules.
- [hld-evaluation-format.md](references/hld-evaluation-format.md): attribute scores, qualitative assessment, and generator stopping reason.

## Output

Artifacts use a stable feature slug under the configured repository-relative output directory, unless the user supplies paths:

- `<feature>.hld.md`: narrative design.
- `<feature>.architecture-diff.hld.json`: classes, methods, relationships, and variable exposure inventories.
- `<feature>.hld-evaluation.md`: latest evaluation and stopping reason.
- `<feature>.architecture-diff.hld.mermaid.md`: diagram generated from the current JSON. Preview failures are reported separately from design quality.
