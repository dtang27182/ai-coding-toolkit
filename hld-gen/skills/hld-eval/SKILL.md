---
name: hld-eval
description: Evaluate an HLD against its context, current code, and quality rubric, returning scores and an overall assessment without revision advice.
---

# HLD Evaluation

Evaluate one HLD without revising it or recommending changes.

## Inputs

Read the feature context, narrative, Architecture Diff, relevant code, and repository guidance. Treat the narrative and JSON as one HLD. Read these references:

- `ai-coding-toolkit/hld-gen/references/hld-quality.md` for scoring.
- `ai-coding-toolkit/hld-gen/references/hld-narrative.md` for evaluation scope.
- `ai-coding-toolkit/hld-gen/references/hld-variable-exposure.md` for inventory verification.
- `ai-coding-toolkit/hld-gen/references/hld-evaluation-format.md` for the report.

Write to the caller's report path, or `<outputDirectory>/<feature>/<feature>.hld-evaluation.md` using `ai-coding-toolkit/config.json`.

## Evaluation

1. Confirm both artifacts and the feature context are available. Do not invent missing attributes or scores.
2. Verify the exposure inventories against current code using `hld-variable-exposure.md`. If an inventory is unknown, incomplete, or unverifiable, omit scores and explain why in the qualitative assessment.
3. Run `node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>`. Do not score if validation fails or the script writes a top-level `null`.
4. Score every rubric attribute against the complete HLD, feature context, and current code. Return its name, raw score, and preferred direction. For Variable Exposure, reread the JSON and copy the top-level `variableExposureCount`; do not calculate or adjust it.
5. Write one qualitative assessment covering design complexity, existing behavior constraints, and tradeoffs between attributes.

Do not include findings, evidence, per-attribute commentary, or revision advice. Change only the report and derived `variableExposureCount` fields.
