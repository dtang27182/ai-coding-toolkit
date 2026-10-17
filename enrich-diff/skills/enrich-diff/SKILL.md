---
name: enrich-diff
description: Generate code-review System and Implementation Dataflows and a self-contained enriched patch viewer input for working-tree changes or a selected commit comparison.
---

# Enrich Diff

Generate code-review System and Implementation Dataflows and a self-contained input for the enriched patch viewer.

## Prepare the Patch

Read and follow `ai-coding-toolkit/enrich-diff/instructions/prepare-patch.md`.

## Create the Review Artifacts

Read and follow these instructions in order:

1. `ai-coding-toolkit/enrich-diff/instructions/gen-sys-dataflow.md`
2. `ai-coding-toolkit/enrich-diff/instructions/gen-impl-dataflow.md`
3. `ai-coding-toolkit/enrich-diff/instructions/generate-enriched-patch.md`

Generate the Implementation Dataflow starting from all changes in the selected patch, tracing the implementation to explain them. Use the HLD's `High Level Requirements` and `User Journeys` as behavior context, not as the basis for selecting changes. Do not use the System Dataflow as an input to it.

Write `<outputDirectory>/<feature>/<feature>.rich-diff.json` with exactly three absolute paths:

```json
{
  "enrichedPatch": "<absolute-path-to-feature-directory>/<feature>.enriched-patch.json",
  "sysDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.sys-dataflow.json",
  "implDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.impl-dataflow.json"
}
```

Verify that all three paths point to the artifacts just generated. Report the rich-diff JSON path as the combined visualizer input.

Also report `<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json` as the validated Implementation Dataflow artifact.

Report the selected base and target (working tree or commit), including resolved commit IDs.

Do not modify application code as part of this workflow.
