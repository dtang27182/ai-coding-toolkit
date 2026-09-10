---
name: hld-eval
description: Evaluate one high-level design against its feature context, the current code, and a rubric, returning attribute scores and one qualitative assessment without revision advice.
---

# HLD Evaluation

Evaluate one HLD without changing it or recommending revisions.

## Inputs

Read the feature context, narrative HLD, Architecture Diff JSON, current relevant code, repository guidance, and rubric. Treat the narrative and JSON as two parts of the same HLD. Default to `ai-coding-toolkit/hld-gen/references/hld-quality.md` when no rubric is supplied.

Read `ai-coding-toolkit/hld-gen/references/hld-narrative.md` for the HLD's scope and narrative structure. Evaluate at that level of detail; do not penalize the omission of detailed error handling, edge cases, or adjustments to existing logic and dataflow.

Use `ai-coding-toolkit/hld-gen/references/hld-evaluation-format.md` for the report. Write to the caller's report path, or `<outputDirectory>/<feature>.hld-evaluation.md` using `ai-coding-toolkit/config.json`. Only write the evaluation report.

## Evaluation

1. Confirm both artifacts, the feature context, and a rubric with usable score definitions and optimization directions are available. Do not invent missing attributes or scores.
2. Run `node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <json-path>`. Do not score an invalid Architecture Diff.
3. For each rubric attribute, evaluate the complete HLD against the feature context and current code. Return the attribute name, raw score, and whether higher or lower values are better.
4. Write one qualitative assessment of the HLD as a whole.

Do not include findings, evidence, per-attribute commentary, revision suggestions, or instructions for improving the HLD. Leave the HLD, rubric, and application code unchanged.
