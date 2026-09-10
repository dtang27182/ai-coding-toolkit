# HLD Generator Architecture

## Purpose

The HLD generator develops and improves one high-level design from a feature conversation and the current code. It can start before the design is agreed.

The HLD sketches core logic and dataflow, architectural fit, data ingress and egress, and interactions with new state. It covers core use cases; detailed error handling, edge cases, and integration changes belong to later design work.

## Skills

- **`hld-gen`** owns the narrative and Architecture Diff as complementary parts of one design. It writes both from shared context, preserves user edits and explicit requirements, labels assumptions, and chooses revisions based on evaluation results.
- **`hld-eval`** evaluates the HLD against feature context, current code, and the rubric. It returns raw attribute scores, their preferred directions, and one qualitative assessment. It writes only the evaluation report and provides no revision suggestions. It also supports standalone evaluation.

## Evaluation and Revision

`hld-gen` validates the Architecture Diff and follows `hld-eval` to assess the current design. It uses the assessment and each attribute's preferred direction to revise the same files in place, then evaluates again. Only the current HLD and latest evaluation are retained.

The rubric stays fixed during a run. Revision stops when all attributes reach their rubric-defined best values or the generator cannot identify another improvement. Missing rubric information requires user input. The loop is carried out through skill instructions, without a separate runner.

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

`scripts/` contains the JSON validator and Mermaid converter. Both can run directly from the command line. The toolkit's shared initializer and agent adapters expose the skills from `hld-gen/skills/`.

`references/` defines the tool's contracts:

- [hld-narrative.md](references/hld-narrative.md): narrative scope and five-section structure.
- [hld-architecture-diff.md](references/hld-architecture-diff.md): architectural representation, supported by the schema and example in the same directory.
- [hld-quality.md](references/hld-quality.md): default score definitions and preferred directions; a supplied rubric can replace it.
- [hld-evaluation-format.md](references/hld-evaluation-format.md): attribute scores, qualitative assessment, and generator stopping reason.

## Output

Artifacts use a stable feature slug under the configured repository-relative output directory, unless the user supplies paths:

- `<feature>.hld.md`: narrative design.
- `<feature>.architecture-diff.hld.json`: classes, public methods, and relationships for the core logic and interface points.
- `<feature>.hld-evaluation.md`: latest evaluation and stopping reason.
- `<feature>.architecture-diff.hld.mermaid.md`: diagram generated from the current JSON. Preview failures are reported separately from design quality.
