---
name: hld-gen
description: Create and refine the simplest high-level design that implements requested behavior by generating, evaluating, and comparing candidate designs.
---

# Design Generation

Create the simplest design that implements the requested behavior. Minimize the rubric's complexity measures while preserving explicit requirements, existing behavior, and clear responsibilities. Do not omit necessary changes or combine unrelated responsibilities to improve a score.

The design is described by a narrative Markdown file and an Architecture Diff JSON file that complement each other. `arch-diff` is shorthand for Architecture Diff and is used in its filenames.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run and pass it to candidate generation.

1. Create `<outputDirectory>/<feature>/<feature>.behavior-and-scope.md` using `ai-coding-toolkit/hld-gen-new/instructions/define-behavior-and-scope.md`. Do not proceed to step 2 until the user explicitly confirms the artifact.
2. Read `ai-coding-toolkit/hld-gen-new/instructions/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.
3. Before generation, create an iteration record in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`, with generation and evaluation marked pending for each new candidate. Generate three materially different candidate designs using `ai-coding-toolkit/hld-gen-new/instructions/generate-hld.md`.
   - Start at iteration 1 and increment for each new set of three candidates. Preserve earlier records and completed work.
4. Evaluate all three designs using `ai-coding-toolkit/hld-gen-new/instructions/eval-hld.md`. An evaluated iteration has three successfully evaluated candidates.
5. Analyze all three designs together. Use their differences, commonalities, and any patterns or trends to identify an approach that could improve the quality metrics further. Consider combining useful choices and changing shared choices that may limit all three designs. Explain the proposed approach and the metrics it could improve, accounting for tradeoffs without inventing weights.
   - Compare the candidates with the best evaluated design from earlier iterations and retain the best design across the run, explaining any tradeoffs. Keep the earlier design on a tie.
   - Check the iteration history before proposing another approach. Record whether the previous approach improved on the earlier best design. Do not repeat an unsuccessful approach without new evidence or a materially different design choice that addresses why it failed.
   - Update the iteration record with the analysis, the best design across the run, the previous approach's outcome, and the next improvement approach, or explicitly state that none was identified.
6. If an untried or newly justified improvement approach exists, repeat from step 3. Otherwise, select the best evaluated design across all iterations and record the selection rationale and tradeoffs in the iteration summary. Copy its narrative and Architecture Diff to `<outputDirectory>/<feature>/<feature>.hld.md` and `<outputDirectory>/<feature>/<feature>.arch-diff.hld.json`, preserving all candidate artifacts. Record the stopping reason as `best-scores` if every metric reaches its rubric-defined best value, or `no-identifiable-improvement` otherwise. Then stop.

If required context remains unavailable, preserve existing artifacts, record the missing context in the behavior and scope artifact and iteration summary if created, and stop with `needs-input`. If an execution failure prevents completion, record it and stop with `execution-error`.

## Human Handoff

Link the behavior and scope artifact. Record the stopping reason and current candidate statuses in the iteration summary, if created, and link it. Report the evaluated iteration count and disclose pending, failed, or unevaluated iterations and candidates.

If a design was selected, link the selected narrative and Architecture Diff JSON. State whether the selected design was evaluated after its last design edit. If no design was selected, say so and link available candidate artifacts with their status.

State why the loop stopped. Do not implement application code or claim human approval as part of this workflow.
