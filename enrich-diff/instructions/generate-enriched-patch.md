# Generate an Enriched Patch from the Selected Patch

Use the `outputDirectory` and feature selected in the skill workflow.

1. Use the `<outputDirectory>/<feature>/<feature>.patch` captured by the skill. Do not select or regenerate a different comparison.
2. Run `node ai-coding-toolkit/common/enriched-patch/generate-enriched-patch.mjs <patch-path>`.
3. Verify that the generator embeds the exact patch text in `<outputDirectory>/<feature>/<feature>.enriched-patch.json` and validates the result against `ai-coding-toolkit/common/enriched-patch/enriched-patch.schema.json`.
4. Read and follow `ai-coding-toolkit/enrich-diff/instructions/tag-enriched-patch.md` to tag the generated changes.
5. Run HLD function coverage annotation using the selected feature's HLD implementation dataflow, CR implementation dataflow, and patch, updating the existing CR graph and enriched patch:

   ```sh
   node ai-coding-toolkit/enrich-diff/scripts/annotate-hld-function-coverage.mjs \
     "<outputDirectory>/<feature>/<feature>.impl-dataflow.json" \
     "<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json" \
     "<outputDirectory>/<feature>/<feature>.patch" \
     --enriched-patch "<outputDirectory>/<feature>/<feature>.enriched-patch.json"
   ```

6. Run `node ai-coding-toolkit/enrich-diff/scripts/validate-impl-dataflow.mjs "<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json"` to validate the annotated CR graph.
7. Run `node ai-coding-toolkit/enrich-diff/scripts/validate-enriched-patch.mjs <enriched-patch-path>` to confirm that every added or deleted patch row belongs to exactly one element's `changes` list and that the tags satisfy the schema.
8. Report the Enriched Patch path as the self-contained enriched patch viewer input.
