# Generate an Enriched Patch from the Selected Patch

Use the `outputDirectory` and feature selected in the skill workflow.

1. Use the `<outputDirectory>/<feature>/<feature>.patch` captured by the skill. Do not select or regenerate a different comparison.
2. Run `node ai-coding-toolkit/common/enriched-patch/generate-enriched-patch.mjs <patch-path> --hld-impl-dataflow "<outputDirectory>/<feature>/<feature>.impl-dataflow.json"`.
3. Read and follow `ai-coding-toolkit/enrich-diff/instructions/tag-enriched-patch.md` to tag the generated changes.
4. Run HLD function coverage annotation using the selected feature's HLD implementation dataflow, CR implementation dataflow, and patch, updating the existing CR graph and enriched patch:

   ```sh
   node ai-coding-toolkit/enrich-diff/scripts/annotate-hld-function-coverage.mjs \
     "<outputDirectory>/<feature>/<feature>.impl-dataflow.json" \
     "<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json" \
     "<outputDirectory>/<feature>/<feature>.patch" \
     --enriched-patch "<outputDirectory>/<feature>/<feature>.enriched-patch.json"
   ```

5. Run `node ai-coding-toolkit/enrich-diff/scripts/validate-impl-dataflow.mjs "<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json"`.
6. Run `node ai-coding-toolkit/enrich-diff/scripts/validate-enriched-patch.mjs <enriched-patch-path>`.
7. Report the Enriched Patch path as the self-contained enriched patch viewer input.
