# Generate a Diff Index from the Current Patch

Use the `outputDirectory` and feature selected by the `annotate-diff` workflow.

1. Run `git diff --no-ext-diff --no-color --unified=1000000 --output=<patch-path> HEAD --` to write tracked changes to `<outputDirectory>/<feature>/<feature>.code-review.patch`.
2. Run `node ai-coding-toolkit/common/diff-viewer/generate-diff-index.mjs <patch-path>`.
3. Verify that the generator writes `<outputDirectory>/<feature>/<feature>.diff-index.json` beside the patch and validates it against `ai-coding-toolkit/common/diff-viewer/diff-index.schema.json`.
4. Report the two generated diff-viewer input paths together.
