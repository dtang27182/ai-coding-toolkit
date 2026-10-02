---
name: hld-gen
description: Create and refine the simplest high-level design that implements requested behavior by generating, evaluating, and comparing candidate designs.
---

# Design Generation

Create the simplest design that implements the requested behavior. Minimize the rubric's complexity measures while preserving explicit requirements, existing behavior, and clear responsibilities. Do not omit necessary changes or combine unrelated responsibilities to improve a score.

The design is described by a High Level Design document (`hld-doc`) using the `.hld.md` extension.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run and pass it to candidate generation.

1. Create `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md` from `ai-coding-toolkit/hld-gen-new/hld-iteration-summary-template.md`, substituting `<feature>` in the title and paths. Draft only `Design Guidelines` from the initial user request.
   - Use concise bullets to set the detail level for requirements, user journeys, and design, distinguish what belongs in `High Level Requirements` versus `Detailed Requirements`, and list exclusions. Exclude error handling paths unless explicitly requested.
   - Proceed without confirmation when the request is sufficient. Otherwise, present the proposed guidelines, explain the uncertainty, and ask the user to confirm or revise them. Wait for confirmation or enough information to revise the guidelines before filling other sections.
2. Use `ai-coding-toolkit/hld-gen-new/define/define-behavior-and-scope.md` to fill `High Level Requirements`, `Detailed Requirements`, and `Clarification Questions` in the iteration summary.
   - Ask the user every recorded clarification question. After each response, update `High Level Requirements` and `Detailed Requirements` as needed, remove each answered question, and record any necessary follow-up questions.
   - Present both requirements sections to the user for review, including all three `High Level Requirements` subsections. Continue until `Clarification Questions` is `None` and the user explicitly approves the updated requirements. Do not proceed to step 3 before both conditions are met.
3. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.
4. Initialize the iteration's candidate records: fill the template's iteration section for iteration 1, or append a new copy of that section for a later iteration. Replace `<iteration>`, record a distinct design direction for each candidate so the three are materially different, and leave each candidate's generation and evaluation pending.
   - Start at iteration 1 and increment for each new set of three candidates. Preserve earlier records and completed work.
5. Generate and evaluate the three candidates in parallel. Launch three subagents at once, one per candidate, and wait for all three to finish. Give each subagent:
   - The feature slug, iteration number, candidate number, its design direction, and any recorded improvement approach.
   - Instructions to follow `ai-coding-toolkit/hld-gen-new/generate/gen-hld.md` and then `ai-coding-toolkit/hld-gen-new/eval/eval-hld.md` for its candidate only, write only inside its candidate directory, and leave the iteration summary unchanged.

   If subagents are unavailable, follow the same two instructions for each candidate yourself, one at a time.
6. Update each candidate's iteration record from its reported results:
   - Record its HLD doc and manifest links and generation status.
   - Copy all six counts into its record and mark it evaluated. On failure, mark it failed and record the reason.
7. Analyze the current iteration and record its outcome:
   - Analyze the three candidates together.
      - Use their differences, commonalities, and any patterns or trends to identify an approach that could improve the quality metrics further.
      - Consider combining useful choices and changing shared choices that may limit all three designs.
   - Record the analysis and exactly one improvement outcome:
     - Set `improvementApproachExists` to `true` and record the approach identified by the analysis. Use `true` only for an untried or newly justified approach.
     - Set `improvementApproachExists` to `false` and explicitly state that no improvement approach was identified.
8. Continue or finalize:
   - If `improvementApproachExists` is `true`, repeat from step 4 using the recorded approach.
   - Otherwise:
     - Select the best evaluated design across all iterations and record its rationale and tradeoffs in the iteration summary.
     - Copy its HLD doc, sys-dataflow, and impl-dataflow from the candidate directory into `<outputDirectory>/<feature>/` without renaming them, preserving all candidate artifacts.
     - Copy `Detailed Requirements` verbatim from the iteration summary into the selected HLD doc for implementation. Run `node ai-coding-toolkit/hld-gen-new/generate/write-hld-manifest.mjs <selected-hld-path>` to write a manifest with absolute paths to the selected copies.

If information required to define, generate, or evaluate the design is unavailable and cannot be resolved from the request, confirmed behavior, scope, and user journeys, current code, or repository guidance, record what is missing in the iteration summary if created, preserve existing artifacts, and stop with `needs-input`. If an execution failure prevents completion, record it and stop with `execution-error`.

## Human Handoff

Record the stopping reason and current candidate statuses in the iteration summary, if created, and link it. Report the evaluated iteration count and disclose pending, failed, or unevaluated iterations and candidates.

If a design was selected, link its generated artifacts and manifest. State whether the selected design was evaluated after its last design edit. If no design was selected, say so and link available candidate artifacts with their status.

State why the loop stopped. Do not implement application code or claim human approval as part of this workflow.
