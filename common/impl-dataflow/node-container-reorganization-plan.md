# Implementation Dataflow Node and Container Reorganization Plan

1. **Define the new schema structure.** Bump the schema version and replace `classes`, `modules`, `components`, and `staticData` with flat `nodes` and `containers` arrays. Keep `relationships` and diff-hunk evidence.

2. **Unify node properties.** Define seven node subtypes: function, UI component, system input, system output, external dependency, static data, and state variable. Share `id`, `name`, `type`, `changeType`, and optional `diffHunkIds`; retain subtype-specific properties.

3. **Define containers and membership.** Give containers an ID, name, and class/module type. Functions and state variables reference exactly one owner through `containerId`; static data may optionally reference an owner. Require owned node names to be unique within their owner and subtype. Both container types can own functions, state variables, and static data.

4. **Separate membership from composition.** Keep class-to-class composition relationships for ownership of child instances. Membership is expressed solely through `containerId`.

5. **Preserve connection constraints.** Use typed node references in dataflow endpoints and encode allowed source/target combinations in the schema. Validate reference existence, endpoint type consistency, membership, and name uniqueness in the semantic validator.

6. **Derive container status and remove exposure analysis.** Remove stored container `changeType` but retain optional container `diffHunkIds`. Derive whether a container is changed from its members; preserve individual member statuses. Remove `variableExposure` and its generation, evaluation, metrics, and UI dependencies.

7. **Update consumers and verify.** Update generation instructions, examples, validators, metrics, visualizer rendering/filtering/collapse behavior, and tests. Cover module-owned state, optionally owned static data, duplicate names across owners, invalid connections, composition, derived container status, and both design and code-review documents.
