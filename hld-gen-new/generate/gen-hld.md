# Generate an HLD Candidate

Generate one candidate from the confirmed `Desired Behavior`, `Scope and Assumptions`, and `User Journeys` in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`, the current code, and the caller's feature slug, iteration number, candidate number, and design direction. The caller owns confirmation of these three sections, comparison, and the iteration summary.

Constrain the design only by the confirmed behavior, scope, and user journeys and the caller's design direction, not by the other candidates' design choices. The caller assigns each candidate a direction with materially different responsibilities, state ownership, class boundaries, interfaces, or core dataflows. In later iterations, use the identified improvement approach as guidance while keeping other design choices open.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.

## Create the HLD Doc

2. Create `<feature>.hld.md` under `<outputDirectory>/<feature>/iterations/<iteration>/candidate-<candidate>/` from `ai-coding-toolkit/hld-gen-new/generate/hld-doc-template.md`.
3. Replace `<feature>` in the HLD doc.
4. Copy `Desired Behavior` verbatim from the iteration summary.
5. Copy `Scope and Assumptions` verbatim from the iteration summary.
6. Copy `User Journeys` verbatim from the iteration summary.
7. Fill User Flows by following `ai-coding-toolkit/hld-gen-new/generate/gen-user-flows.md`.
8. Fill Design Context and Related Workflows by following `ai-coding-toolkit/hld-gen-new/generate/gen-design-context.md`.
9. Generate the sys-dataflow by following `ai-coding-toolkit/hld-gen-new/generate/gen-sys-dataflow.md`.
10. Use the validated sys-dataflow JSON to generate the Implementation Dataflow narrative and JSON by following `ai-coding-toolkit/hld-gen-new/generate/gen-impl-dataflow.md`. Preserve earlier candidates and iterations.

## Report the Result

11. Report the candidate's HLD doc link to the caller, including a partial HLD doc written before a failure. Report generation as complete after the preceding steps succeed; otherwise report the failed status and reason.
