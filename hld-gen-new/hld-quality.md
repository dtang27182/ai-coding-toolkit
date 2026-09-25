# HLD Design Evaluation Criteria

Compare design complexity while preserving required behavior and clear responsibilities. Lower counts are better. Consider tradeoffs between criteria without normalizing, combining, or weighting the counts.

Changed means `added`, `modified`, or `deleted`. The counts cover the core user flows.

| Criterion                          | What it measures                                                                           | Best value |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ---------: |
| Changed Classes                    | Number of changed classes.                                                                 |          0 |
| Changed Methods                    | Number of changed methods within changed classes.                                          |          0 |
| Changed Components                 | Number of changed UI, system input/output, and external dependency components.             |          0 |
| Changed Dataflow Relationships     | Number of changed dataflow relationships, excluding state updates and composition.         |          0 |
| Changed State-Update Relationships | Number of changed state-update relationships.                                              |          0 |
| Variable Exposure                  | Distinct existing fields, parameters, and local variables exposed to the design's changes. |          0 |
