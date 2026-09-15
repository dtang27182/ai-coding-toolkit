# Label HLD User Flow Participation

Assign the Architecture Diff's `userFlow` and `hasUserFlowState` labels using the narrative's numbered User Flow Steps and relevant current code. Change only those two fields.

## Classification

User-flow participation means being on the data path triggered by a user action, through processing and state reads/updates, to final state persistence, output back to the user, or output to an external component. Persistence includes retained in-memory state.

For each user action in the User Flow Steps, trace these paths through the actual data dependencies, including intermediate results and asynchronous responses. Follow the data, not every call or ownership relationship. Merely running after the action or setting up the objects that handle it does not qualify.

- Set `userFlow` on every method, component, dataflow, and state update: `true` only if that entry lies on a traced path; otherwise `false`.
- Set `hasUserFlowState` on every class: `true` only if it owns state read or updated along a traced path; otherwise `false`. Holding a reference to a participating object is not itself user-flow state.

## Validation

Verify the filtered view preserves each action-to-outcome path. Run `node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <json-path>` and fix failures. The validator checks structure and consistency, not data-path participation.
