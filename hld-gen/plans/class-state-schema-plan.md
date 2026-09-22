# Architecture Diff Class State

## 1. Goal

Make class state explicit in the Architecture Diff instead of inferring it from class-level flags or relationship descriptions.

The diff must:

- List state variables added, modified, or deleted by the design.
- List unchanged state variables read or written by the Core Logic and Dataflow.
- Represent reads as explicit `state-read` relationships.
- Make both state reads and state updates reference the exact variable involved.

## 2. Definition of `stateVariables`

Add a required `stateVariables` array to every class. It represents mutable runtime state, not every language-level instance field. Use `[]` when the class has no state in Architecture Diff scope.

Each entry contains:

- `name`: the variable name, unique within its class.
- `changeType`: `added`, `modified`, `deleted`, or `unchanged`.
- `userFlow`: whether the variable participates in a traced user flow.

```json
"stateVariables": [
  {
    "name": "changes",
    "changeType": "unchanged",
    "userFlow": true
  }
]
```

Include:

- Every mutable instance variable whose declaration or architectural meaning is added, modified, or deleted.
- Every unchanged mutable instance variable read or written by the Core Logic and Dataflow.

Exclude:

- Unrelated fields outside the Core Logic and Dataflow.
- Static/class variables and method-local variables.
- Read-only, immutable, or final fields, including fields assigned only at declaration or construction. These define instance configuration or identity, and constructor assignment is initialization rather than a state update.
- Fields used only to reference owned child objects. Represent them with `composition`, not `stateVariables` or state relationships.
- Fields included solely because they appear in `variableExposure`; excluded fields can remain in that declaration-level inventory.

`changeType` describes a declaration or semantic change. Writing a new runtime value to an existing variable does not by itself make that variable `modified`.

## 3. Architecture Diff Schema Updates

Update `hld-gen/references/architecture-diff.schema.json` to schema version 9.

### Class shape

- Require `stateVariables` on every class.
- Define a `stateVariable` schema with required `name`, `changeType`, and `userFlow` fields and no additional properties.
- Remove `hasUserFlowState`; class participation can be derived from its state variables, methods, and relationships.

### State-variable endpoints

Add an endpoint that identifies a variable and its owning class:

```json
{ "class": "ChangeModel", "stateVariable": "changes" }
```

The class and variable must resolve to an entry in that class's `stateVariables` array.

### Relationship shapes

Add `state-read` and change `state-update` to use exact state-variable endpoints:

| Relationship   | From                    | To                      |
| -------------- | ----------------------- | ----------------------- |
| `dataflow`     | Method or component     | Method or component     |
| `state-read`   | State-variable endpoint | Method                  |
| `state-update` | Method                  | State-variable endpoint |
| `composition`  | Class                   | Class                   |

Both state relationship types require `dataDescription`, `purpose`, `changeType`, and `userFlow`. `dataDescription` describes the value read or the mutation performed; it no longer serves as the variable identifier. Do not create state relationships for reads of read-only, constructor-only, or composition-reference fields.

### Implementation order

1. Update the core Architecture Diff authoring and add minimal visualization.

   - Update `hld-architecture-diff.md` with the `stateVariables` definition, exclusions, exact state-variable endpoints, and state-read/state-update rules.
   - Update the JSON Schema to version 9 and migrate `architecture-diff.example.json` and the bundled visualizer sample. Include at least one state read and one state update.
   - Update the visualizer types and rendering only as needed to load schema-v9 files and show one state box, marked `s`, at the left of the method row inside each class. List all state variables in that box and route every state-read and state-update edge to it while retaining the exact variable in the relationship data.

2. Align the remaining authoring instructions and finish the visualizer integration.

   - Update `hld-user-flow.md` to classify state variables and state-read relationships and to remove `hasUserFlowState` handling.
   - Update `hld-dataflow-narrative.md` to describe state reads, and make the one-line state-read terminology update in `generate-hld.md`.
   - Complete the visualizer's semantic validation, filtering, selection, inspector, summaries, and legend behavior for state variables and both state relationship types.
