# Generate the Design Section

Fill only the `Design` section in `<outputDirectory>/<feature>/<feature>.hld.md` using the confirmed `High Level Requirements` and current code. Apply `Design Guidelines` to the section and its artifacts. Do not use `Detailed Requirements` for design generation.

## Understand the Design Quality Criteria

1. Read `ai-coding-toolkit/feature-design/hld-quality.md` and use its qualitative principles to guide generation. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

## Fill the Design Section

2. Fill the `Design Context and Related Workflows` subsection under `Design` by following `ai-coding-toolkit/feature-design/generate/gen-design-context.md`.
3. Generate the sys-dataflow directly from User Journeys by following `ai-coding-toolkit/feature-design/generate/gen-sys-dataflow.md`.
4. Use both the confirmed High Level Requirements and validated sys-dataflow JSON to design the Implementation Dataflow in its JSON, then write its narrative in the `Implementation Dataflow` subsection under `Design`, following `ai-coding-toolkit/feature-design/generate/gen-impl-dataflow.md`.
5. Run `node ai-coding-toolkit/common/impl-dataflow/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json` to validate the Implementation Dataflow. Correct errors and rerun validation after revisions.
6. After the `Design` section and both validated dataflows are complete, run `node ai-coding-toolkit/feature-design/generate/write-hld-manifest.mjs <hld-path> <outputDirectory>/<feature>/<feature>.detailed-requirements.md` to write `<feature>.hld-manifest.json` beside them. Its `hld`, `sysDataflow`, `implDataflow`, and `detailedRequirements` fields contain absolute paths.

## Report the Result

7. Report the HLD doc and manifest links to the caller, including a partial HLD doc written before a failure. Report design generation as complete after the preceding steps succeed; otherwise report the failed status and reason.
