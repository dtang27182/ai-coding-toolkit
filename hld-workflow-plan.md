# HLD Generation and Improvement

## Workflow

1. The human starts `$hld-gen` at any point in a feature conversation. No agreed design is required.
2. The agent creates two complementary parts of the high-level design together, using the conversation context and existing code: a narrative Markdown file and an Architecture Diff JSON file. Neither is derived from the other.
3. `$hld-eval` evaluates the HLD against the feature context, current code, and rubric. It returns a list of evaluated attributes and scores plus one qualitative assessment.
4. `$hld-gen` uses the evaluation to revise the same HLD in place, updating either or both components as needed, and requests another evaluation. Repeat until every attribute has its maximum score or `$hld-gen` cannot identify another improvement.
5. Present the current design, its diagram, and its latest evaluation to the human for review. State why revision stopped.

Preserve explicit user requirements and decisions. Agent proposals and labeled working assumptions may change during refinement. Application implementation and human approval are outside this workflow.

## Skills

- **`hld-gen`** writes and revises one HLD from shared conversation and repository context. It owns both artifacts, preserves user edits and explicit requirements, records assumptions, and uses evaluation results to improve the design in place.
- **`hld-eval`** evaluates the HLD against the feature context, current state of the code, and rubric. It returns a list of attributes and scores plus one qualitative assessment. It does not edit the HLD or suggest how to revise it.

Retire `adiff-hld` and remove it from default installation. Move its reusable authoring conventions into `hld-gen/references/architecture-diff-authoring.md`, with the schema and example in the same references directory. A standalone Architecture Diff entry point can use that reference if needed later. No additional coordinator skill is needed.

## Scoring

The rubric in `hld-gen/references/hld-quality.md`, or a user-supplied rubric, defines the attributes and their scoring scales. Use the same rubric for every evaluation. If it is missing or incomplete, request the missing input rather than inventing scores.

Evaluate after each revision and keep only the current HLD and latest evaluation. Continue until all attributes reach their maximum scores or `hld-gen` cannot see how to improve the scores further.

## Scripts and Files

Keep every file specific to this workflow under `hld-gen/`:

```text
hld-gen/
  skills/
    hld-gen/
    hld-eval/
  scripts/
  references/
```

Move the existing JSON validator and Mermaid converter into `hld-gen/scripts/`. Keep the schema, examples, rubrics, evaluation format, and authoring guidance in `hld-gen/references/`. The shared initializer and agent adapters remain at the toolkit root and install the skills from `hld-gen/`.

Save three final artifacts under the configured directory:

- `<feature>.hld.md`: narrative design describing desired application behavior, core logic and dataflow, scope of change, assumptions, and open questions.
- `<feature>.architecture-diff.hld.json`: Architecture Diff describing which classes, public methods, and relationships must change and how they fit into the existing architecture; use the converter to produce its Mermaid preview.
- `<feature>.hld-evaluation.md`: latest attributes and scores, one qualitative assessment, and the stopping reason recorded by `hld-gen`. Follow `hld-gen/references/hld-evaluation-format.md` and overwrite the report after each evaluation.

Validate JSON before scoring. Generate `<feature>.architecture-diff.hld.mermaid.md` from the current JSON; disclose preview failures separately from design quality. Evaluate after design edits; if interrupted before evaluation completes, state that the current design has not been evaluated.

## Build Order

1. Define the rubric and scoring rules with the human.
2. Create the `hld-gen/` hierarchy and move all HLD-specific skills, scripts, and reference files into it.
3. Extract the Architecture Diff authoring reference and update the evaluation report contract.
4. Update `hld-eval` to produce attribute scores and one qualitative assessment, and `hld-gen` to revise both artifacts in place.
5. Retire `adiff-hld`, update installation and UI metadata, and align the README and toolkit plan. Check fresh and repeat installation and references.
6. Try a sample feature from an early conversation: verify coordinated edits to the same HLD and standalone evaluation without design edits or revision suggestions. Exercise maximum scores, no identifiable improvement, missing inputs, and interruption; confirm the final design matches its latest evaluation and diagram.
