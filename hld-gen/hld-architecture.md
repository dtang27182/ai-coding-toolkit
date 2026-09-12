# HLD Generator Architecture

## Purpose

The HLD generator develops and improves one high-level design from a feature conversation and the current code. Before designing, it presents the desired behavior and scope to the user and waits for explicit confirmation.

The objective is the simplest design that preserves required new and existing behavior. The rubric scores change size, concentration, and Variable Exposure.

The narrative's Relevant Logic and Dataflow section covers the broader end-to-end workflows needed to understand the design. Its Core Logic and Dataflow section and the Architecture Diff cover only the User Flow Steps, including where existing behavior reads and applies the feature's output or state. This core scope includes all required changes and every unchanged class, method, UI component, and external I/O component implementing or connecting those steps; follow `references/hld-narrative.md` and `references/hld-architecture-diff.md` for inclusion criteria. Integration adjustments to existing classes, persistent state, methods, and dataflows that might interfere with or be disrupted by the new flow can remain for later design work. Detailed error handling and edge cases can also remain for later design work unless needed for the desired behavior.

## Skills

- **`hld-gen`** creates the narrative and Architecture Diff together, derives Variable Exposure from the Architecture Diff, runs the counter, and chooses revisions from evaluation results.
- **`hld-eval`** scores the HLD against feature context, current code, and the rubric. It writes the evaluation report, refreshes derived Variable Exposure counts, and provides no revision advice. It also supports standalone evaluation.

## Evaluation and Revision

`hld-gen` populates Variable Exposure after the narrative and architectural design are complete, then runs the counter and follows `hld-eval`. It uses the assessment and each attribute's preferred direction to revise the same files in place, then repeats the exposure and evaluation steps. Only the current HLD and latest evaluation are retained, with a Design Iterations history maintained by `hld-gen` and preserved by `hld-eval`.

The rubric in `references/hld-quality.md` stays fixed during a run. Revision stops when all attributes reach their rubric-defined best values or the generator cannot identify another improvement. The loop is carried out through skill instructions, without a separate runner.

The generator reports the evaluated iteration count and why it stopped, then presents the artifacts for human review. An interruption after a design edit is reported as an unevaluated current design. Application implementation is a separate task.

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

- [hld-narrative.md](references/hld-narrative.md): narrative scope and seven-section structure, with User Flow Steps defining the scope of Core Logic and Dataflow and the Architecture Diff.
- [hld-architecture-diff.md](references/hld-architecture-diff.md): architectural representation, supported by the schema and example in the same directory.
- [hld-quality.md](references/hld-quality.md): score definitions and preferred directions.
- [hld-variable-exposure.md](references/hld-variable-exposure.md): existing variable scope, declaration inventories, and counting rules.
- [hld-evaluation-format.md](references/hld-evaluation-format.md): attribute scores, qualitative assessment, design iteration history, and generator stopping reason.

## Output

Artifacts use a stable feature slug as a subdirectory under the configured repository-relative output directory, unless the user supplies paths:

- `<feature>/<feature>.hld.md`: narrative design.
- `<feature>/<feature>.architecture-diff.hld.json`: classes, methods, UI and external I/O components, relationships, and variable exposure inventories.
- `<feature>/<feature>.hld-evaluation.md`: latest evaluation, design iteration history, and stopping reason.
- `<feature>/<feature>.architecture-diff.hld.mermaid.md`: diagram generated from the current JSON. Preview failures are reported separately from design quality.
