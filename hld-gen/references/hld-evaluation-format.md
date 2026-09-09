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

## Stopping Reason

When `hld-gen` finishes, it appends one reason: `best-scores`, `no-identifiable-improvement`, `needs-input`, or `execution-error`. Standalone evaluations omit this section.
