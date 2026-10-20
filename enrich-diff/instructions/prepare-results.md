# Prepare the Results

Write `<outputDirectory>/<feature>/<feature>.rich-diff.json` with exactly two absolute paths:

```json
{
  "enrichedPatch": "<absolute-path-to-feature-directory>/<feature>.enriched-patch.json",
  "implDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.impl-dataflow.json"
}
```

Verify that both paths point to the artifacts just generated. Report the rich-diff JSON path as the combined visualizer input.

Report the selected base and target (working tree or commit), including resolved commit IDs.
