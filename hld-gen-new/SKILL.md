---
name: hld-gen
description: Create and refine the simplest high-level design that implements requested behavior by generating, evaluating, and comparing candidate designs.
---

# Design Generation

Create the simplest design that implements the requested behavior. Minimize the rubric's complexity measures while preserving explicit requirements, existing behavior, and clear responsibilities. Do not omit necessary changes or combine unrelated responsibilities to improve a score.

The design is described by a High Level Design document (`hld-doc`) and a complementary Architecture Diff JSON (`arch-diff`). HLD docs use the `.hld.md` extension, and Architecture Diffs use `.arch-diff.hld.json`.

`impl-dataflow` is shorthand for the HLD doc's Implementation Dataflow narrative.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run and pass it to candidate generation.

1. Create an empty `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md` from `ai-coding-toolkit/hld-gen-new/hld-iteration-summary-template.md`, replacing `<feature>` in the title and paths. Use `ai-coding-toolkit/hld-gen-new/define/define-behavior-and-scope.md` to fill its `Desired Behavior`, `Scope and Assumptions`, and `Clarification Questions` sections.
   - Ask the user every recorded clarification question. After each response, update `Desired Behavior` and `Scope and Assumptions`, remove each answered question, and record any necessary follow-up questions.
   - Continue until `Clarification Questions` is `None` and the user explicitly approves the updated `Desired Behavior` and `Scope and Assumptions`. Do not proceed to step 2 before both conditions are met.
2. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.
3. Generate three materially different candidate designs using `ai-coding-toolkit/hld-gen-new/generate/gen-hld.md`. Before generating them, initialize the candidate records in the template's iteration section for iteration 1 or append a new copy of that section for a later iteration. Replace `<iteration>` and leave each candidate's generation and evaluation pending.
   - Start at iteration 1 and increment for each new set of three candidates. Preserve earlier records and completed work.
4. Evaluate all three designs using `ai-coding-toolkit/hld-gen-new/eval/eval-hld.md` and update their iteration records:
   - Before updating a candidate's inventory or counts, mark its evaluation pending.
   - After verification, copy all six counts from its Architecture Diff into its record and mark it evaluated. On failure, mark it failed and record the reason.
5. Analyze the current iteration and record its outcome:
   - Analyze the three candidates together.
      - Use their differences, commonalities, and any patterns or trends to identify an approach that could improve the quality metrics further.
      - Consider combining useful choices and changing shared choices that may limit all three designs.
   - Record the analysis and exactly one improvement outcome:
     - Set `improvementApproachExists` to `true` and record the approach identified by the analysis. Use `true` only for an untried or newly justified approach.
     - Set `improvementApproachExists` to `false` and explicitly state that no improvement approach was identified.
6. Continue or finalize:
   - If `improvementApproachExists` is `true`, repeat from step 3 using the recorded approach.
   - Otherwise:
     - Select the best evaluated design across all iterations and record its rationale and tradeoffs in the iteration summary.
     - Copy its HLD doc and Architecture Diff to `<outputDirectory>/<feature>/<feature>.hld.md` and `<outputDirectory>/<feature>/<feature>.arch-diff.hld.json`, preserving all candidate artifacts.

If information required to define, generate, or evaluate the design is unavailable and cannot be resolved from the request, confirmed behavior and scope, current code, or repository guidance, record what is missing in the iteration summary if created, preserve existing artifacts, and stop with `needs-input`. If an execution failure prevents completion, record it and stop with `execution-error`.

## Human Handoff

Record the stopping reason and current candidate statuses in the iteration summary, if created, and link it. Report the evaluated iteration count and disclose pending, failed, or unevaluated iterations and candidates.

If a design was selected, link the selected HLD doc and Architecture Diff JSON. State whether the selected design was evaluated after its last design edit. If no design was selected, say so and link available candidate artifacts with their status.

State why the loop stopped. Do not implement application code or claim human approval as part of this workflow.
