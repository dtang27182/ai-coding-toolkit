# Generate an HLD Candidate

Generate one candidate from the confirmed Desired Behavior and Scope and Assumptions, the current code, and the caller's iteration and candidate numbers. The caller owns scope confirmation and comparison; do not repeat those steps here.

## Understand the Design Quality Criteria

2. Read `ai-coding-toolkit/hld-gen/instructions/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.

## Create the Candidate

3. Create the narrative and Architecture Diff in parallel as complementary parts of the same design; do not derive one from the other.
   - Use `outputDirectory` from `ai-coding-toolkit/config.json` and one stable kebab-case feature slug throughout the run. Unless the user supplies paths, write `<feature>.hld.md` and `<feature>.architecture-diff.hld.json` under `<outputDirectory>/<feature>/iterations/<iteration>/candidate-<candidate>/` (candidates 1–3). Preserve earlier candidates and iterations.
   - Write the narrative using `ai-coding-toolkit/hld-gen/instructions/hld-narrative.md` and the Architecture Diff using `ai-coding-toolkit/hld-gen/instructions/hld-architecture-diff.md`. When revising existing artifacts, retain the user's edits unless they conflict with the requested behavior.

Defer the exposure inventory and counting steps in the referenced instructions to `eval-hld.md`. Use `null` for inventories not yet populated and omit derived counts until evaluation.
