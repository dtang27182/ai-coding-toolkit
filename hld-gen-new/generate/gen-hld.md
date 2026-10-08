# Generate an HLD

Complete the design in `<outputDirectory>/<feature>/<feature>.hld.md` using its `Design Guidelines`, confirmed `High Level Requirements`, and the current code. The caller initializes the HLD and confirms the requirements before design generation. Do not use `Detailed Requirements` for design generation; they guide implementation after design handoff.

Apply `Design Guidelines` to every generated section and artifact. Use the confirmed `High Level Requirements` as the source of truth for the design.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/hld-gen-new/hld-quality.md` and use its qualitative principles to guide generation. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

## Complete the HLD Doc

2. Preserve `Design Guidelines` and the confirmed `High Level Requirements`, including all its subsections, in the initialized HLD.
3. Set the Detailed Requirements link to `<feature>.detailed-requirements.md`, referencing the file beside the HLD without using its contents for design generation.
4. Fill Design Context and Related Workflows by following `ai-coding-toolkit/hld-gen-new/generate/gen-design-context.md`.
5. Generate the sys-dataflow directly from User Journeys by following `ai-coding-toolkit/hld-gen-new/generate/gen-sys-dataflow.md`.
6. Use the validated sys-dataflow JSON to generate the Implementation Dataflow narrative and JSON by following `ai-coding-toolkit/hld-gen-new/generate/gen-impl-dataflow.md`.
7. Run `node ai-coding-toolkit/hld-gen-new/eval/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json` to validate the Implementation Dataflow. Correct errors and rerun validation after revisions.
8. After the HLD and both validated dataflows exist, run `node ai-coding-toolkit/hld-gen-new/generate/write-hld-manifest.mjs <hld-path> <outputDirectory>/<feature>/<feature>.detailed-requirements.md` to write `<feature>.hld-manifest.json` beside them. Its `hld`, `sysDataflow`, `implDataflow`, and `detailedRequirements` fields contain absolute paths.

## Report the Result

9. Report the HLD doc and manifest links to the caller, including a partial HLD doc written before a failure. Report generation as complete after the preceding steps succeed; otherwise report the failed status and reason.
