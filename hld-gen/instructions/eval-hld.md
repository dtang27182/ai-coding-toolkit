# Calculate HLD Metrics

Generate quantitative counts for one candidate using its Architecture Diff and the current code. Store all counts in the Architecture Diff JSON.

## Populate Variable Exposure

Use the Architecture Diff's changed classes and methods to find exposed variables in the current code. Populate `variableExposure` using `ai-coding-toolkit/hld-gen/instructions/hld-variable-exposure.md`. Use `null` when exposure remains unknown.

## Calculate the Quality Metrics

1. Run `node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>` to validate the Architecture Diff and write its `variableExposureCount` values. Fix validation failures before continuing.
2. Run `node ai-coding-toolkit/hld-gen/scripts/count-design-changes.mjs <json-path>` to validate the Architecture Diff and write the five change counts. Fix failures before accepting the counts.
3. Verify that `changedClassCount`, `changedMethodCount`, `changedComponentCount`, `changedDataflowRelationshipCount`, `changedStateUpdateRelationshipCount`, and `variableExposureCount` are present and non-null in the Architecture Diff JSON.

Do not produce a separate per-design evaluation file. The caller records the metrics and cross-design analysis in the shared iteration summary. After a design or inventory changes, repeat these steps to refresh its counts.
