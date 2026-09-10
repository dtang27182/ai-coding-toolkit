# HLD Quality Rubric

Evaluate the narrative design and Architecture Diff as one HLD. Each attribute defines its own raw score and whether higher or lower values are better. Do not normalize or combine the scores.

## Scoring Preconditions

Score the HLD only when the Architecture Diff is valid, consistent with the narrative, covers the core logic and interface points defined in `hld-narrative.md`, and does not combine unrelated responsibilities merely to reduce counts. Do not reward omitted classes, methods, relationships, or `coreChange` markers within that scope. If these preconditions are not met, return no scores and explain why in the qualitative assessment.

Count `added`, `modified`, and `deleted` entries as changed. Exclude `unchanged` context entries.

Each attribute specifies its raw score, whether higher or lower values are better, and a best possible value when one exists.

## Attributes

### Changed Classes

Let `N` be the number of changed classes. At least one class must change.

Score: `N`. Lower is better. The minimum valid score is 1.

### Changed Public Methods

Let `N` be the number of methods listed in changed classes. These are the added, modified, or deleted public methods required by the Architecture Diff.

Score: `N`. Lower is better. The minimum score is 0.

### Changed Dataflow Relationships

Let `N` be the number of `dataflow` relationships whose `changeType` is `added`, `modified`, or `deleted`.

Score: `N`. Lower is better. The minimum score is 0.

### Core-Change Classes

Let `N` be the number of changed classes with `coreChange: true`. At least one changed class must identify where the core feature logic resides.

Score: `N`. Lower is better. The minimum valid score is 1.

### Core-Change Methods

Let `N` be the number of methods with `coreChange: true`.

Score: `N`. Lower is better. The minimum score is 0, which is valid only when no changed public method owns core feature logic.
