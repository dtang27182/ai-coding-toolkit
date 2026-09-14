# HLD Generator Architecture

## Purpose

The HLD generator compares candidate designs from a feature conversation and the current code, then selects one high-level design. Before designing, it presents the desired behavior and scope to the user and waits for explicit confirmation.

The objective is the simplest design that preserves required new and existing behavior. The rubric scores change size, concentration, and Variable Exposure.

The narrative's Relevant Logic and Dataflow section covers the broader end-to-end workflows needed to understand the design. Its Core Logic and Dataflow section and the Architecture Diff cover only the User Flow Steps, including where existing behavior reads and applies the feature's output or state. This core scope includes all required changes and every unchanged class, method, UI component, and external I/O component implementing or connecting those steps; follow `instructions/hld-narrative.md` and `instructions/hld-architecture-diff.md` for inclusion criteria. Integration adjustments to existing classes, persistent state, methods, and dataflows that might interfere with or be disrupted by the new flow can remain for later design work. Detailed error handling and edge cases can also remain for later design work unless needed for the desired behavior.

## Skill and Shared Instructions

- **`hld-gen`** generates and compares three candidates per iteration, records their metrics and analysis, and repeats with an improvement approach or selects a design.
- **`generate-hld.md`** creates one candidate's narrative and Architecture Diff together in its iteration and candidate directory.
- **`eval-hld.md`** populates Variable Exposure and runs the two counters, storing all six quality metrics in the candidate's Architecture Diff JSON.

## Evaluation and Revision

`hld-gen` uses the confirmed Desired Behavior and Scope and Assumptions to generate three structurally different candidates. After calculating their metrics, it analyzes their differences, commonalities, patterns, and trends for further improvements. Each iteration's candidate artifacts are retained, and their metrics, analysis, and improvement approach are recorded in one iteration summary.

The rubric in `instructions/hld-quality.md` stays fixed during a run. The generator retains the best evaluated design across iterations and records whether each improvement approach improved on the earlier best. An untried or newly justified approach guides three new candidates; an unsuccessful approach is not repeated without new evidence or a materially different design choice addressing its failure. When no such approach is identified, the generator selects the best design across all iterations and copies its artifacts to the main feature paths. The loop is carried out through skill instructions, without a separate runner.

The generator reports the evaluated iteration count, selection rationale, and stopping reason, then presents the selected artifacts and iteration summary for human review. Pending or unevaluated iterations and candidates are disclosed. Application implementation is a separate task.

## Scripts and Files

The tool's source lives under `hld-gen/`:

```text
hld-gen/
  skills/
    hld-gen/
  scripts/
  instructions/
  references/
```

`scripts/` contains the JSON validator, Variable Exposure counter, design change counter, and Mermaid converter. Each can run directly from the command line. The toolkit's shared initializer and agent adapters expose the skill from `hld-gen/skills/`.

`instructions/` contains the shared guidance for generation and evaluation:

- [generate-hld.md](instructions/generate-hld.md): candidate generation and output paths.
- [eval-hld.md](instructions/eval-hld.md): exposure inventory preparation and quantitative counting.
- [hld-narrative.md](instructions/hld-narrative.md): narrative scope and seven-section structure, with User Flow Steps defining the scope of Core Logic and Dataflow and the Architecture Diff.
- [hld-architecture-diff.md](instructions/hld-architecture-diff.md): architectural representation, supported by the schema and example in `references/`.
- [hld-quality.md](instructions/hld-quality.md): score definitions and preferred directions.
- [hld-variable-exposure.md](instructions/hld-variable-exposure.md): existing variable scope, declaration inventories, and counting rules.

`references/` contains the Architecture Diff schema and example JSON:

- [architecture-diff.schema.json](references/architecture-diff.schema.json): Architecture Diff schema.
- [architecture-diff.example.json](references/architecture-diff.example.json): example Architecture Diff.

## Output

Artifacts use a stable feature slug as a subdirectory under the configured repository-relative output directory, unless the user supplies paths:

- `<feature>/<feature>.hld.md`: narrative design.
- `<feature>/<feature>.architecture-diff.hld.json`: classes, methods, UI and external I/O components, relationships, and variable exposure inventories.
- `<feature>/<feature>.hld-iteration-summary.md`: candidate metrics, analysis, improvement approaches, selection rationale, and stopping reason for each iteration.
- `<feature>/iterations/<iteration>/candidate-<candidate>/`: retained candidate narratives and Architecture Diff files.
- `<feature>/<feature>.architecture-diff.hld.mermaid.md`: diagram generated from the current JSON. Preview failures are reported separately from design quality.
