# Generate an HLD

Complete the design in `<outputDirectory>/<feature>/<feature>.hld.md` using its `Design Guidelines`, confirmed `High Level Requirements`, and the current code. The caller supplies `outputDirectory` and a stable `<feature>` slug, initializes the HLD, writes `<feature>.detailed-requirements.md` beside it, and confirms the requirements, including `User Journeys`, before design generation. Other High Level Requirements subsections are defined by the caller. Do not use `Detailed Requirements` for design generation; they guide implementation after design handoff.

Apply `Design Guidelines` to every generated section and artifact. Use the confirmed `High Level Requirements` as the source of truth for the design.

If required information cannot be resolved from the confirmed requirements, current code, or repository guidance, record what is missing in the HLD's `Clarification Questions`, preserve existing artifacts, and report `needs-input` to the caller. If an execution failure prevents completion, report `execution-error` to the caller. Stop generation in either case.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/common/hld/hld-quality.md` and use its qualitative principles to guide generation. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

## Complete the HLD Doc

2. Preserve `Design Guidelines` and the confirmed `High Level Requirements`, including all its subsections, in the initialized HLD.
3. Set the Detailed Requirements link to `<feature>.detailed-requirements.md`, referencing the file beside the HLD without using its contents for design generation.
4. Fill Design Context and Related Workflows by following `ai-coding-toolkit/common/hld/generate/gen-design-context.md`.
5. Generate the sys-dataflow directly from User Journeys by following `ai-coding-toolkit/common/hld/generate/gen-sys-dataflow.md`.
6. Use the validated sys-dataflow JSON to generate the Implementation Dataflow narrative and JSON by following `ai-coding-toolkit/common/hld/generate/gen-impl-dataflow.md`.
7. Run `node ai-coding-toolkit/common/impl-dataflow/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json` to validate the Implementation Dataflow. Correct errors and rerun validation after revisions.
8. After the HLD and both validated dataflows exist, run `node ai-coding-toolkit/common/hld/generate/write-hld-manifest.mjs <hld-path> <outputDirectory>/<feature>/<feature>.detailed-requirements.md` to write `<feature>.hld-manifest.json` beside them. Its `hld`, `sysDataflow`, `implDataflow`, and `detailedRequirements` fields contain absolute paths.

## Report the Result

9. Report the HLD doc and manifest links to the caller, including a partial HLD doc written before a failure. Report generation as complete after the preceding steps succeed; otherwise report the failed status and reason.
