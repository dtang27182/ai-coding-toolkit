# Generate an Enriched Patch from the Selected Patch

Use the `outputDirectory` and feature selected in the skill workflow.

1. Use the `<outputDirectory>/<feature>/<feature>.patch` captured by the skill. Do not select or regenerate a different comparison.
2. Run `node ai-coding-toolkit/common/enriched-patch/generate-enriched-patch.mjs <patch-path>`.
3. Verify that the generator embeds the exact patch text in `<outputDirectory>/<feature>/<feature>.enriched-patch.json` and validates the result against `ai-coding-toolkit/common/enriched-patch/enriched-patch.schema.json`.
4. Read and follow `ai-coding-toolkit/enrich-diff/instructions/tag-enriched-patch.md` to tag the generated changes.
5. Run `node ai-coding-toolkit/enrich-diff/scripts/validate-enriched-patch.mjs <enriched-patch-path>` to confirm that every added or deleted patch row belongs to exactly one element's `changes` list and that the tags satisfy the schema.
6. Report the Enriched Patch path as the self-contained enriched patch viewer input.
