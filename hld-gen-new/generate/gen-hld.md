# Generate an HLD Candidate

Generate one candidate using `Design Guidelines` and confirmed `High Level Requirements` in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`, the current code, and the caller's feature slug, iteration number, candidate number, and design direction. The caller defines the guidelines, confirms the requirements, and owns comparison and the iteration summary. Do not use `Detailed Requirements` for candidate generation or evaluation; they guide implementation after design selection.

Apply `Design Guidelines` to every generated section and artifact. Constrain the design only by the confirmed `High Level Requirements` and the caller's design direction, not by the other candidates' design choices. The caller assigns each candidate a direction with materially different responsibilities, state ownership, class boundaries, interfaces, or core dataflows. In later iterations, use the identified improvement approach as guidance while keeping other design choices open.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` to understand the design quality criteria. Use these criteria to guide candidate generation and comparison.

## Create the HLD Doc

2. Create `<feature>.hld.md` under `<outputDirectory>/<feature>/iterations/<iteration>/candidate-<candidate>/` from `ai-coding-toolkit/hld-gen-new/generate/hld-doc-template.md`.
3. Replace `<feature>` in the HLD doc.
4. Copy `Design Guidelines` verbatim from the iteration summary.
5. Copy `High Level Requirements`, including all three subsections, verbatim from the iteration summary.
6. Set the Detailed Requirements link to `../../../<feature>.detailed-requirements.md`, referencing the shared file without using its contents for design generation.
7. Fill Design Context and Related Workflows by following `ai-coding-toolkit/hld-gen-new/generate/gen-design-context.md`.
8. Generate the sys-dataflow directly from User Journeys by following `ai-coding-toolkit/hld-gen-new/generate/gen-sys-dataflow.md`.
9. Use the validated sys-dataflow JSON to generate the Implementation Dataflow narrative and JSON by following `ai-coding-toolkit/hld-gen-new/generate/gen-impl-dataflow.md`. Preserve earlier candidates and iterations.
10. After the HLD and both dataflows exist, run `node ai-coding-toolkit/hld-gen-new/generate/write-hld-manifest.mjs <candidate-hld-path> <outputDirectory>/<feature>/<feature>.detailed-requirements.md` to write `<feature>.hld-manifest.json` beside them. Its `hld`, `sysDataflow`, `implDataflow`, and `detailedRequirements` fields contain absolute paths.

## Report the Result

11. Report the candidate's HLD doc and manifest links to the caller, including a partial HLD doc written before a failure. Report generation as complete after the preceding steps succeed; otherwise report the failed status and reason.
