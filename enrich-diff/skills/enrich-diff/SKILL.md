---
name: enrich-diff
description: Generate code-review System and Implementation Dataflows and a self-contained enriched patch viewer input for working-tree changes or a selected commit comparison.
---

# Enrich Diff

Generate code-review System and Implementation Dataflows and a self-contained input for the enriched patch viewer.

## Prepare the Shared Patch

1. Read `outputDirectory` from `ai-coding-toolkit/config.json`. Find the most recently modified final HLD matching `<outputDirectory>/<feature>/<feature>.hld.md`, excluding HLDs under `iterations`. Use the HLD only to initialize the diff-description.
2. Honor the user's comparison when specified: current changes versus the latest commit means `HEAD` versus the working tree; latest versus previous commit means `HEAD^` versus `HEAD`; two named commits are compared from older to newer regardless of the order named. If unspecified, inspect `git status --porcelain --untracked-files=all` before writing artifacts. Use `HEAD` versus the working tree when staged, unstaged, or untracked changes exist; otherwise use `HEAD^` versus `HEAD`.
3. Resolve selected commit references with `git rev-parse --verify '<ref>^{commit}'`. If the selected parent or a supplied reference does not exist, explain the problem and ask for a valid comparison. For two commits, use ancestry to identify older and newer; when neither is an ancestor of the other, use committer timestamps. If those timestamps tie, ask for a comparison that establishes an order.
4. Write `<outputDirectory>/<feature>/<feature>.patch` before creating other review artifacts. For the working tree, run `node ai-coding-toolkit/common/enriched-patch/generate-full-context-patch.mjs <patch-path>`. For two commits, run `node ai-coding-toolkit/common/enriched-patch/generate-full-context-patch.mjs <patch-path> --commits <commit-1> <commit-2>`; the generator orders them from older to newer.
5. Use this exact patch as the comparison input for all review artifacts. If it is empty, report that the selected comparison has no changes instead of generating an empty review.

## Create the Review Artifacts

Read and follow these instructions in order:

1. `ai-coding-toolkit/enrich-diff/instructions/generate-diff-description.md`
2. `ai-coding-toolkit/enrich-diff/instructions/gen-sys-dataflow-multipass.md`
3. `ai-coding-toolkit/enrich-diff/instructions/gen-impl-dataflow-multipass.md`
4. `ai-coding-toolkit/enrich-diff/instructions/generate-enriched-patch.md`

Generate the Implementation Dataflow starting from all changes in the selected patch, tracing the implementation to explain them. Use the diff-description's user flows as context, not as the basis for selecting changes. Do not use the System Dataflow as an input to it.

Write `<outputDirectory>/<feature>/<feature>.rich-diff.json` with exactly three absolute paths:

```json
{
  "enrichedPatch": "<absolute-path-to-feature-directory>/<feature>.enriched-patch.json",
  "sysDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.sys-dataflow.json",
  "implDataflow": "<absolute-path-to-feature-directory>/<feature>.cr.impl-dataflow.json"
}
```

Verify that all three paths point to the artifacts just generated. Report the rich-diff JSON path as the combined visualizer input.

Also report `<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.json` as the validated Implementation Dataflow artifact and `<outputDirectory>/<feature>/<feature>.cr.impl-dataflow.discrepencies.md` for schema limitations and unresolved discrepancies.

Report the selected base and target (working tree or commit), including resolved commit IDs.

Do not modify application code as part of this workflow.
