# Calculate HLD Metrics

Generate quantitative counts for one candidate using its Architecture Diff and the current code. Store all counts in the Architecture Diff JSON.

## Populate Variable Exposure

Use the Architecture Diff's changed classes and methods to find exposed variables in the current code. Populate `variableExposure` using `ai-coding-toolkit/hld-gen-new/eval/hld-variable-exposure.md`. Use `null` when exposure remains unknown.

## Calculate the Quality Metrics

1. Run `node ai-coding-toolkit/hld-gen-new/eval/count-variable-exposure.mjs <json-path>` to validate the Architecture Diff and write its `variableExposureCount` values. Fix validation failures before continuing.
2. Run `node ai-coding-toolkit/hld-gen-new/eval/count-design-changes.mjs <json-path>` to validate the Architecture Diff and write the five change counts. Fix failures before accepting the counts.
3. Run `node ai-coding-toolkit/hld-gen-new/eval/validate-architecture-diff.mjs --evaluated <json-path>` to verify that all six derived counts and Variable Exposure inventories are complete and non-null.
