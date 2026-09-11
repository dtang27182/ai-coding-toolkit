# HLD Quality Rubric

Evaluate the narrative design and Architecture Diff as one HLD. Each attribute defines its own raw score and whether higher or lower values are better. Do not normalize or combine the scores.

Use the attributes to measure design complexity while preserving required new and existing behavior. Describe tradeoffs in the qualitative assessment; do not invent weights.

## Scoring Preconditions

Score only a valid Architecture Diff that matches the narrative, covers the scope in `hld-narrative.md`, and has code-verified inventories under `hld-variable-exposure.md`. Do not reward omissions or combining unrelated responsibilities to reduce counts. If these preconditions fail, return no scores and explain why in the qualitative assessment.

Count `added`, `modified`, and `deleted` entries as changed. Exclude `unchanged` context entries.

Each attribute specifies its raw score, whether higher or lower values are better, and a best possible value when one exists.

## Attributes

### Changed Classes

Let `N` be the number of changed classes. At least one class must change.

Score: `N`. Lower is better. The minimum valid score is 1.

### Changed Methods

Let `N` be the number of methods whose `changeType` is `added`, `modified`, or `deleted` in changed classes. Exclude unchanged methods included to show the end-to-end flow.

Score: `N`. Lower is better. The minimum score is 0.

### Changed Dataflow Relationships

Let `N` be the number of `dataflow` relationships whose `changeType` is `added`, `modified`, or `deleted`.

Score: `N`. Lower is better. The minimum score is 0.

### Variable Exposure

Follow `hld-variable-exposure.md`, run `count-variable-exposure.mjs` on the current JSON, and read `N` from its top-level `variableExposureCount`. Do not calculate or adjust `N` with the model.

Score: `N`. Lower is better. The minimum score is 0, valid only when the design exposes its changes to no existing variables. An unknown inventory cannot be scored.
