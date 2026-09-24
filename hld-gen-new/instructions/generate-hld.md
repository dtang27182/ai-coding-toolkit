# Generate an HLD Candidate

Generate one candidate from the confirmed behavior and scope artifact at `<outputDirectory>/<feature>/<feature>.behavior-and-scope.md`, the current code, and the caller's feature slug, iteration number, and candidate number. The caller owns behavior and scope confirmation and comparison.

Constrain the design only by the behavior and scope artifact, not by the other candidates' design choices. Explore materially different responsibilities, state ownership, class boundaries, interfaces, or core dataflows. In later iterations, use the identified improvement approach as guidance while keeping other design choices open.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/hld-gen-new/instructions/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.

## Create the Candidate

2. Before editing an existing candidate, mark its evaluation pending in the iteration record.

3. Create the narrative and Architecture Diff in parallel as complementary parts of the same design; do not derive one from the other.
   - Use `outputDirectory` from `ai-coding-toolkit/config.json` and the caller's feature slug. Write `<feature>.hld.md` and `<feature>.arch-diff.hld.json` under `<outputDirectory>/<feature>/iterations/<iteration>/candidate-<candidate>/` (candidates 1–3). Preserve earlier candidates and iterations.
   - Write the narrative using `ai-coding-toolkit/hld-gen-new/instructions/hld-narrative.md`. Write the Architecture Diff using the representation contract in `ai-coding-toolkit/common/arch-diff/arch-diff.schema.json` and the HLD inclusion rules in `ai-coding-toolkit/hld-gen-new/instructions/hld-architecture-diff.md`. When revising existing artifacts, retain the user's edits unless they conflict with the requested behavior.

Use `null` for Variable Exposure inventories not yet populated and omit derived counts until evaluation.

## Update the Iteration Record

4. Record the candidate's narrative and Architecture Diff links, including any artifacts written before a failure. Mark generation complete after the preceding steps succeed; otherwise record the failed status and reason.
