# HLD Quality Rubric

Evaluate the narrative design and Architecture Diff as one HLD. Each attribute defines its own raw score and whether higher or lower values are better. Do not normalize or combine the scores.

Use the attributes to measure design complexity while preserving required new and existing behavior. Describe tradeoffs in the iteration summary; do not invent weights.

## Scoring Preconditions

Compare only a valid Architecture Diff that covers the User Flow Steps, matches Core Logic and Dataflow under `hld-narrative.md`, and has code-verified inventories under `hld-variable-exposure.md`. If these checks fail, exclude its counts from comparison and explain why in the iteration summary. Relevant Logic and Dataflow does not expand the required coverage.

Count only `added`, `modified`, and `deleted` entries as changed. Do not reward omissions or combining unrelated responsibilities to reduce counts.

## Attributes

### Changed Classes

Let `N` be the number of changed classes. At least one class must change.

Score: `N`. Lower is better. The minimum valid score is 1.

### Changed Methods

Let `N` be the number of methods whose `changeType` is `added`, `modified`, or `deleted` in changed classes. Exclude unchanged methods included to show the core data flows end-to-end.

Score: `N`. Lower is better. The minimum score is 0.

### Changed Components

Let `N` be the number of entries in `components` whose `changeType` is `added`, `modified`, or `deleted`. Count both `ui` and `external-io` components; exclude unchanged components.

Score: `N`. Lower is better. The minimum score is 0.

### Changed Dataflow Relationships

Let `N` be the number of `dataflow` relationships whose `changeType` is `added`, `modified`, or `deleted`.

Count only flows directly relevant to the core use cases. State-update relationships are a separate type and are excluded from this count.

Score: `N`. Lower is better. The minimum score is 0.

### Changed State-Update Relationships

Let `N` be the number of `state-update` relationships whose `changeType` is `added`, `modified`, or `deleted`.

Count only updates directly relevant to the core use cases. Exclude unchanged relationships.

Score: `N`. Lower is better. The minimum score is 0.

### Variable Exposure

Follow `hld-variable-exposure.md`, run `count-variable-exposure.mjs` on the current JSON, and read `N` from its top-level `variableExposureCount`. Do not calculate or adjust `N` with the model.

Score: `N`. Lower is better. The minimum score is 0, valid only when the design exposes its changes to no existing variables. An unknown inventory cannot be scored.
