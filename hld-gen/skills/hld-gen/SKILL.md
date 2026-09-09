---
name: hld-gen
description: Create and improve a high-level design from feature context and the current code, including a narrative, Architecture Diff, and rubric-based evaluation.
---

# HLD Generation

Create and improve one HLD. The HLD consists of a narrative Markdown file and an Architecture Diff JSON file that describe the same design from shared feature and repository context.

Read these instructions when their corresponding work is needed:

- `ai-coding-toolkit/hld-gen/references/architecture-diff-authoring.md` before writing or revising the Architecture Diff.
- `ai-coding-toolkit/hld-gen/skills/hld-eval/SKILL.md` before evaluating the HLD.

## Create the HLD

1. Read `ai-coding-toolkit/config.json`, the available feature context, relevant code, and applicable repository guidance. Start with the available context even when the feature has not been fully discussed or agreed.
2. Use a stable kebab-case feature slug. Resolve `outputDirectory` relative to the containing repository root and create it if necessary. Save the files as `<feature>.hld.md`, `<feature>.architecture-diff.hld.json`, and `<feature>.hld-evaluation.md`. Preserve user-supplied paths and existing user edits.
3. Write or revise both design artifacts together. Preserve explicit user requirements and decisions. Clearly label proposed approaches, working assumptions, and open questions.
4. In the narrative, describe the desired behavior, scope, core logic and dataflow, architectural responsibilities, and unresolved design questions. Follow applicable repository document conventions.
5. Write the JSON using the Architecture Diff authoring reference and validate it with the provided script. Fix validation errors before evaluation.

## Improve the HLD

1. Use the supplied rubric, defaulting to `ai-coding-toolkit/hld-gen/references/hld-quality.md`. Do not add attributes or scoring rules. If the rubric has no usable score definitions and optimization directions, preserve the HLD and request them.
2. Follow `hld-eval` to evaluate the current HLD. Save the result to the evaluation path, replacing the previous evaluation.
3. If every attribute has reached its best possible score defined by the rubric, stop with `best-scores`.
4. Otherwise, use each attribute's optimization direction and the qualitative assessment together with the feature context and current code to identify a concrete improvement. The evaluator does not supply revision instructions. If no improvement is apparent, stop with `no-identifiable-improvement`.
5. Revise the same narrative and JSON files in place, validate the JSON, and evaluate again. Continue until one of the stopping conditions above applies. Do not keep alternate candidates or revision history.

## Human Handoff

Append the stopping reason to the latest evaluation report. Generate the final preview with `node ai-coding-toolkit/hld-gen/scripts/architecture-diff-to-mermaid.mjs <json-path>` and disclose preview failures separately from design quality.

Present links to the narrative, Architecture Diff JSON, Mermaid preview if generated, and latest evaluation. State why revision stopped and whether the current HLD was evaluated after its last edit. Do not implement application code or claim human approval as part of this workflow.
