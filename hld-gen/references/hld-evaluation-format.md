# HLD Evaluation Format

Use this Markdown report contract for standalone evaluation and evaluations performed by `hld-gen`.

## Inputs

Record the feature, narrative path, Architecture Diff path, and rubric path.

## Scores

Include one row for every rubric attribute:

| Attribute | Score | Better |
| --------- | ----: | ------ |
|           |       |        |

Do not add attributes that are absent from the rubric. Write `higher` or `lower` in the Better column as defined by the rubric. If the HLD cannot be evaluated, omit scores and explain why in the qualitative assessment.

## Qualitative Assessment

Write one concise assessment of the HLD as a whole. Do not include findings or revision suggestions.

## Design Iterations

`hld-gen` maintains this history; `hld-eval` preserves it when replacing the report and does not create or update rows. Standalone evaluations omit this section when no history exists.

| Iteration | Design change | Outcome |
| --------- | ------------- | ------- |
|           |               |         |

Start at 1 for the initial design or the starting design of an improvement run without history. Continue existing history when resuming. Add the next integer when a revised design is submitted for evaluation; do not increment for formatting fixes, validation repairs, or reevaluating an unchanged design. Do not count ideas that were not written into the artifacts.

Before evaluation, record a brief change summary and `Pending` outcome. Afterward, update that row to `Evaluated` with a brief result supported by the evaluation, or `Not evaluated` with the reason. Preserve earlier rows. The evaluated iteration count includes only rows marked `Evaluated`.

## Stopping Reason

When `hld-gen` finishes, it appends one reason: `best-scores`, `no-identifiable-improvement`, `needs-input`, or `execution-error`. Standalone evaluations omit this section.
