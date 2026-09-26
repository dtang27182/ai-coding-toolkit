# Generate an Enriched Patch from the Current Patch

Use the `outputDirectory` and feature selected by the `hld-gen` workflow.

1. Run `node ai-coding-toolkit/common/enriched-patch-viewer/generate-full-context-patch.mjs <patch-path>` to write staged, unstaged, deleted, and untracked changes to `<outputDirectory>/<feature>/<feature>.code-review.patch`. The generator uses a temporary Git index and object database, respects Git ignore rules, and does not modify the repository's Git state.
2. Run `node ai-coding-toolkit/common/enriched-patch-viewer/generate-enriched-patch.mjs <patch-path>`.
3. Verify that the generator embeds the exact patch text in `<outputDirectory>/<feature>/<feature>.enriched-patch.json` and validates the result against `ai-coding-toolkit/common/enriched-patch-viewer/enriched-patch.schema.json`.
4. Report the Enriched Patch path as the self-contained enriched patch viewer input.
