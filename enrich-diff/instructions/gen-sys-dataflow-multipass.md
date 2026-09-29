# Generate a System Dataflow from the Selected Diff in Four Passes

Build the code-review dataflow incrementally: write the inputs and effects named in each user flow, add the supporting nodes, connect the nodes, and validate the completed graph against the implementation and user flows.

## Preparation

- Read and follow `ai-coding-toolkit/enrich-diff/instructions/generate-diff-description.md`.
- After creating the diff-description, use it instead of the HLD for all feature scope and user-flow references.
- Read `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.schema.json` and `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json`.
- Initialize `<outputDirectory>/<feature>/<feature>.cr.sys-dataflow.json` with `schemaVersion` set to `2`, `stage` set to `code-review`, the feature name, and empty `nodes`, `relationships`, and `diffHunks` arrays. Update this file during each pass.

## Rules for All Passes

- Use the generated patch and selected target code as evidence. For commit comparisons, read target files with `git show <target-commit>:<path>`; the checked-out files may differ. Ground changed nodes in the patch, unchanged nodes in target code, and every relationship in either. Do not infer implementation from plans.
- Build one connected subgraph for each `###` user flow in the diff-description, limited to the runtime path needed for its numbered steps' named effects. Exclude related workflows, unchanged downstream behavior, and initialization, dependency setup, or object construction before the trigger.
- Represent each component once per semantic role within a flow. Use separate flow-specific nodes with the same grounded `location` when a component appears in multiple flows.
- Set `changeType` on every node and relationship from the diff: `added`, `modified`, `deleted`, or `unchanged`. Use `unchanged` only for components or transfers needed to connect a trigger to a named effect.
- For changed nodes and relationships, immediately reference only the smallest supporting diff hunks with `diffHunkIds`; do not attach hunks to unchanged entities. Store only referenced hunks in `diffHunks`, with repository-relative paths, exact unified diff text including the `@@` header, and monotonically increasing IDs. Reuse IDs when a hunk supports multiple entities.

## 1. Inspect and Write the Inputs and Named Effects

- For each user flow, inspect the implementation with a focus on the diff to locate the inputs, state writes, outputs, and other effects already specified in its numbered steps.
- Write `user-input` nodes for the triggering and subsequent user actions, and `system-input` nodes for the externally supplied inputs named in the flow. An externally triggered flow starts with a `system-input` node.
- Write `system-state` nodes for the high-level state updated by the flow. Describe the state and the represented update; relationships added in pass 3 will show the writes.
- Write `user-output` nodes for information presented to the user and `system-output` nodes for final outputs sent to an external system. Represent other named effects with the applicable schema node type, including an `external-dependency` when the flow explicitly names a participating external service or datastore.
- For every node, fill in its `type`, unique `name`, `description`, `medium`, and grounded `location`. Use a concrete UI component, storage location, service URI, or class and method name for `location`, not a source-code file or line location. Represent a UI component separately as user input and user output when it serves both roles.
- Leave `relationships` empty for now. At the end of this pass, the JSON contains the implemented inputs and named effects for each user flow.

## 2. Trace and Write the Supporting Nodes

- Revisit the implementation for each user flow, using its existing nodes to bound the trace. Follow the runtime paths that produce the named effects and inspect the data those paths consume.
- Find the `system-state` reads needed by the flow, including reads not explicitly named in its steps. Reuse a state node already written in pass 1 when it represents the same state and semantic role; add a node for any additional state required by the flow.
- Add `static-data` nodes for fixed data consumed by these paths, such as configuration, constants, schemas, and lookup data.
- Add `external-dependency` nodes for participating services or datastores whose requests or responses are needed to produce the named effects, reusing any already written in pass 1.
- Add a `data-processing` node whenever a transformation, decision, or algorithm is needed to explain the runtime path from the flow's inputs and reads to its named effects. Include processing that is unchanged or does not directly implement a named step when it is needed to trace that path. Examples include:
  - Conditional logic that meaningfully changes the user workflow's high-level direction, often corresponding to a branch in its steps.
  - Loop logic that meaningfully changes the user workflow's high-level direction or expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
  - Represent an algorithm implemented by multiple cooperating methods as one `data-processing` node. Give it a short natural-language summary of the algorithm in `description` and actual pseudocode in `pseudo-code`. Use the programming language as its `medium`. For changed nodes, the referenced diff hunks provide the source code; do not copy source code into `pseudo-code`.
- Leave simple data forwarding and request construction for relationships in pass 3; do not create processing nodes for them.
- Write the additional nodes to the JSON with the same required fields, change classification, and minimal diff hunk evidence used in pass 1. At the end of this pass, each flow has the nodes needed to explain how its inputs produce its named effects.

## 3. Trace and Write the Relationships

- Review the in-progress JSON alongside the patch and selected target code. For each user flow, trace the actual data transfers between its nodes and write the corresponding relationships to the JSON.
- Give each relationship a unique `id`, `type` set to `dataflow`, and `from` and `to` values matching the exact node names. Describe the transferred data, including its shape, in `data`, and explain the behavior enabled by the transfer in `purpose`.
- Connect every required state read and static data read to its consumer, and every state write to the state node being updated. Connect inputs, processing, external dependency requests and responses, and outputs according to the implemented data transfers. Represent simple forwarding and request construction with relationships between the participating nodes.
- Respect node directions: relationships may leave `user-input`, `system-input`, and `static-data` nodes; may enter `user-output` and `system-output` nodes; and may both enter and leave `system-state`, `data-processing`, and `external-dependency` nodes.
- Add only relationships supported by an actual data transfer. Step order or the presence of two nodes in the same method does not establish a relationship.
- Set each relationship's `changeType` from the diff independently of its endpoints' change types. For each changed relationship, attach the smallest set of diff hunks showing the represented transfer, such as an assignment, argument, return value, request field, or state update. Record and reuse hunks using the evidence rules above.
- If tracing a transfer reveals a missing required node, add it using the rules from passes 1 and 2 before writing its relationships. At the end of this pass, each user flow forms a separate connected subgraph containing all data transfers needed for its named effects.

## 4. Validate Against the Implementation and User Flows

- Review the completed JSON alongside the diff-description, patch, and selected target code.
- Check each user flow step against its subgraph: every specified user action, system input, state update, output, and other effect must be represented, with the reads, processing, and external dependencies needed to explain it.
- Trace each subgraph from its trigger to its named effects. Verify that it is connected, that relationships carry the data the implementation actually supplies and consumes, and that represented branches and loops agree with the implementation and user flow.
- Check that every node and relationship belongs to that flow's scope. Remove unrelated workflows, unchanged downstream behavior beyond the named effects, setup before the trigger, duplicate semantic roles, and unnecessary processing nodes.
- Verify every `changeType` and diff hunk reference against the patch. Changed nodes must have evidence for their behavior, changed relationships must have evidence for their data transfer, and unchanged entities must have no `diffHunkIds`. Ensure hunk text is exact, IDs resolve, and every stored hunk is referenced.
- Correct graph errors by revisiting the implementation and updating the JSON. If a user-flow step is not implemented, report the discrepancy instead of inventing nodes or relationships to satisfy it.
- Run `node ai-coding-toolkit/enrich-diff/scripts/validate-sys-dataflow.mjs <output-path>` to check the schema, unique node names and IDs, hunk references, relationship endpoints, and permitted directions. Correct every validation error and rerun the validator after corrections. The manual checks above are required in addition to schema validation.

## Report the Result

- Report the generated JSON path and any unresolved discrepancies between the implementation and the user flows.
