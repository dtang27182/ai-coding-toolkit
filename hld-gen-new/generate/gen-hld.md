# Generate an HLD Candidate

Generate one candidate from the confirmed `Desired Behavior` and `Scope and Assumptions` in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`, the current code, and the caller's feature slug, iteration number, and candidate number. The caller owns behavior and scope confirmation and comparison.

Constrain the design only by the confirmed behavior and scope, not by the other candidates' design choices. Explore materially different responsibilities, state ownership, class boundaries, interfaces, or core dataflows. In later iterations, use the identified improvement approach as guidance while keeping other design choices open.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.

## Create the HLD Doc

2. Create `<feature>.hld.md` under `<outputDirectory>/<feature>/iterations/<iteration>/candidate-<candidate>/` from `ai-coding-toolkit/hld-gen-new/generate/hld-doc-template.md`.
3. Replace `<feature>` in the HLD doc.
4. Copy `Desired Behavior` verbatim from the iteration summary.
5. Copy `Scope and Assumptions` verbatim from the iteration summary.
6. Fill User Outcomes and User Flows by following `ai-coding-toolkit/hld-gen-new/generate/gen-user-outcomes-and-flows.md`.
7. Fill Design Context and Related Workflows by following `ai-coding-toolkit/hld-gen-new/generate/gen-design-context.md`.
8. Fill Implementation Dataflow, then create `<feature>.arch-diff.hld.json` beside the HLD doc from that narrative by following `ai-coding-toolkit/hld-gen-new/generate/gen-implementation-dataflow.md`. Preserve earlier candidates and iterations.

Use `null` for Variable Exposure inventories not yet populated and omit derived counts until evaluation.

## Update the Iteration Record

9. Record the candidate's HLD doc link, including a partial HLD doc written before a failure. Mark generation complete after the preceding steps succeed; otherwise record the failed status and reason.
