---
name: hld-gen
description: Create and refine the simplest high-level design that implements requested behavior, using a narrative, Architecture Diff, and rubric-based evaluation.
---

# HLD Generation

Create the simplest design that implements the requested behavior. Minimize the rubric's complexity measures while preserving explicit requirements, existing behavior, and clear responsibilities. Do not omit necessary changes or combine unrelated responsibilities to improve a score.

The HLD consists of a narrative Markdown file and an Architecture Diff JSON file describing the same design. Follow `hld-narrative.md` for narrative structure and scope, and `hld-architecture-diff.md` for diagram scope and representation.

Read these instructions when their corresponding work is needed:

- `ai-coding-toolkit/hld-gen/references/hld-narrative.md` before writing or revising the narrative.
- `ai-coding-toolkit/hld-gen/references/hld-architecture-diff.md` before writing or revising the Architecture Diff.
- `ai-coding-toolkit/hld-gen/references/hld-variable-exposure.md` when identifying touched methods and existing variables exposed to the change.
- `ai-coding-toolkit/hld-gen/references/hld-quality.md` before choosing a design.
- `ai-coding-toolkit/hld-gen/references/hld-evaluation-format.md` when recording design iterations and the stopping reason.
- `ai-coding-toolkit/hld-gen/skills/hld-eval/SKILL.md` before evaluating the HLD.

## Create the HLD

1. Understand the desired behavior.
   - Read the feature context, relevant code, and repository guidance. Identify the core use cases, requirements, decisions, and constraints.
   - Present the user with a concise summary of the desired behavior and what is in and out of scope. Ask them to confirm or correct it.
   - Stop and wait for the user's response. Do not start the design or proceed to step 2 until the user explicitly confirms the summary.
   - Incorporate the response and record any remaining assumptions and open questions.
2. Read `ai-coding-toolkit/hld-gen/references/hld-quality.md` and use its criteria to choose the simplest design that implements the desired behavior.
3. Create the narrative and Architecture Diff in parallel as complementary parts of the same design; do not derive one from the other.
   - Read `ai-coding-toolkit/config.json`, choose a stable kebab-case feature slug, and create `<outputDirectory>/<feature>/`. Write all HLD artifacts there unless the user supplies paths.
   - Write the narrative using `ai-coding-toolkit/hld-gen/references/hld-narrative.md` and the Architecture Diff using `ai-coding-toolkit/hld-gen/references/hld-architecture-diff.md`. When revising existing artifacts, retain the user's edits unless they conflict with the requested behavior.
4. Use the Architecture Diff's changed classes and methods to find exposed variables in the current code. Populate `variableExposure` using `ai-coding-toolkit/hld-gen/references/hld-variable-exposure.md`. Use `null` when exposure remains unknown.
5. Run `node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>` to validate the Architecture Diff and write its `variableExposureCount` values. Fix failures before evaluation.

## Improve the HLD

1. Use the explicit behavior and scope confirmation obtained before creation. For standalone improvement, obtain that confirmation and wait for the user's response before evaluating or revising the HLD.
2. Use `ai-coding-toolkit/hld-gen/references/hld-quality.md` without changing it during the run.
3. Record the current design in Design Iterations using `hld-evaluation-format.md`. Follow `hld-eval` to replace the evaluation while preserving that history, then update the iteration's outcome from the result.
4. If every attribute has reached its best possible score defined by the rubric, stop with `best-scores`.
5. Otherwise, identify a revision that makes the design simpler using all attribute directions and the qualitative assessment. Account for tradeoffs without inventing weights. If no simpler complete design is apparent, stop with `no-identifiable-improvement`.
6. Revise the same files in place. Rebuild the exposure inventory from the revised Architecture Diff, run the counting script, and return to step 3. Keep only the current design and evaluation, retaining the iteration history in the report.

If variable exposure is unknown, inspect the missing code or settle the relevant design choice. If required context remains unavailable, preserve the design and stop with `needs-input`.

## Human Handoff

Append the stopping reason to the latest evaluation report. Generate the final preview with `node ai-coding-toolkit/hld-gen/scripts/architecture-diff-to-mermaid.mjs <json-path>` and disclose preview failures separately from design quality.

Present links to the narrative, Architecture Diff JSON, Mermaid preview if generated, and latest evaluation. Report the evaluated iteration count, distinguishing the initial or starting design from revisions and disclosing any pending or unevaluated iterations. State why revision stopped and whether the current HLD was evaluated after its last edit. Do not implement application code or claim human approval as part of this workflow.
