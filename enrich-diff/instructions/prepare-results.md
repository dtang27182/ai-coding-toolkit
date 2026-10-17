# Prepare the Results

Write `<outputDirectory>/<feature>/<feature>.rich-diff.json` with exactly three absolute paths:

```json
{
  "enrichedPatch": "<absolute-path-to-feature-directory>/<feature>.enriched-patch.json",
  "sysDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.sys-dataflow.json",
  "implDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.impl-dataflow.json"
}
```

Verify that all three paths point to the artifacts just generated. Report the rich-diff JSON path as the combined visualizer input.

Report the selected base and target (working tree or commit), including resolved commit IDs.
