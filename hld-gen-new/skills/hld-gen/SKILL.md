---
name: hld-gen
description: Create and refine the simplest high-level design that implements requested behavior by generating, evaluating, and comparing candidate designs.
---

# Design Generation

Create the simplest design that implements the requested behavior. Minimize the rubric's complexity measures while preserving explicit requirements, existing behavior, and clear responsibilities. Do not omit necessary changes or combine unrelated responsibilities to improve a score.

The design consists of a narrative Markdown file and an Architecture Diff JSON file describing the same design. Follow `hld-narrative.md` for narrative structure and scope, and `hld-architecture-diff.md` for diagram scope and representation.

Read these supporting documents when their corresponding work is needed:

- `ai-coding-toolkit/hld-gen-new/instructions/hld-narrative.md` before writing or revising the narrative.
- `ai-coding-toolkit/hld-gen-new/instructions/hld-architecture-diff.md` before writing or revising the Architecture Diff.
- `ai-coding-toolkit/hld-gen-new/instructions/hld-variable-exposure.md` when identifying touched methods and existing variables exposed to the change.
- `ai-coding-toolkit/hld-gen-new/instructions/hld-quality.md` before choosing a design.
- `ai-coding-toolkit/hld-gen-new/instructions/generate-hld.md` before generating a candidate design.
- `ai-coding-toolkit/hld-gen-new/instructions/eval-hld.md` before evaluating a candidate design.

## Workflow

Use the confirmed Desired Behavior and Scope and Assumptions for every candidate. Keep the quality rubric fixed during the run.

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run and pass it to candidate generation.

1. Understand the desired behavior.
   - Read the feature context, relevant code, and repository guidance. Identify the core use cases, requirements, decisions, and constraints.
   - Present the user with a concise summary of the desired behavior and what is in and out of scope. Ask them to confirm or correct it.
   - Stop and wait for the user's response. Do not start the design or proceed to step 2 until the user explicitly confirms the summary.
   - Incorporate the response and record any remaining assumptions and open questions.
2. Read `ai-coding-toolkit/hld-gen-new/instructions/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.
3. Before generation, create an iteration record in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`, with generation and evaluation marked pending for each new candidate. Generate three materially different candidate designs using `ai-coding-toolkit/hld-gen-new/instructions/generate-hld.md`.
   - Start at iteration 1 and increment for each new set of three candidates. Preserve earlier records and completed work.
4. Evaluate all three designs using `ai-coding-toolkit/hld-gen-new/instructions/eval-hld.md`. An evaluated iteration has three successfully evaluated candidates.
5. Analyze all three designs together. Use their differences, commonalities, and any patterns or trends to identify an approach that could improve the quality metrics further. Consider combining useful choices and changing shared choices that may limit all three designs. Explain the proposed approach and the metrics it could improve, accounting for tradeoffs without inventing weights.
   - Compare the candidates with the best evaluated design from earlier iterations and retain the best design across the run, explaining any tradeoffs. Keep the earlier design on a tie.
   - Check the iteration history before proposing another approach. Record whether the previous approach improved on the earlier best design. Do not repeat an unsuccessful approach without new evidence or a materially different design choice that addresses why it failed.
   - Update the iteration record with the analysis, the best design across the run, the previous approach's outcome, and the next improvement approach, or explicitly state that none was identified.
6. If an untried or newly justified improvement approach exists, repeat from step 3. Otherwise, select the best evaluated design across all iterations and record the selection rationale and tradeoffs in the iteration summary. Copy its narrative and Architecture Diff to `<outputDirectory>/<feature>/<feature>.hld.md` and `<outputDirectory>/<feature>/<feature>.architecture-diff.hld.json`, preserving all candidate artifacts. Record the stopping reason as `best-scores` if every metric reaches its rubric-defined best value, or `no-identifiable-improvement` otherwise. Then stop.

If required context remains unavailable, preserve the candidates, record the missing context in the iteration summary, and stop with `needs-input`. If an execution failure prevents completion, record it and stop with `execution-error`.

## Human Handoff

Record the stopping reason and current candidate statuses in the iteration summary, if created, and link it. Report the evaluated iteration count and disclose pending, failed, or unevaluated iterations and candidates.

If a design was selected, link the selected narrative and Architecture Diff JSON. State whether the selected design was evaluated after its last design edit. If no design was selected, say so and link available candidate artifacts with their status.

State why the loop stopped. Do not implement application code or claim human approval as part of this workflow.
