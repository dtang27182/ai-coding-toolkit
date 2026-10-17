# Generate a System Dataflow from the Selected Diff in Four Passes

Build the code-review dataflow incrementally: write the inputs and effects named in each User Journey, add the supporting nodes, connect the nodes, and validate the completed graph against the implementation and User Journeys.

## Preparation

- Read the `High Level Requirements` and `User Journeys` in the selected `<outputDirectory>/<feature>/<feature>.hld.md` to understand the feature scope.
- Generate the System Dataflow independently. Do not read or use the Implementation Dataflow generation instructions or its JSON artifact as input.
- Read `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.schema.json` and `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json`.
- Initialize `<outputDirectory>/<feature>/<feature>.cr.sys-dataflow.json` for the `code-review` stage with empty `subgraphs` and `diffHunks` arrays. Update this file during each pass.

## Rules for All Passes

- Use the generated patch and selected target code as evidence. For commit comparisons, read target files with `git show <target-commit>:<path>`; the checked-out files may differ. Ground changed nodes in the patch, unchanged nodes in target code, and every relationship in either. Do not infer implementation from plans.
- Build one entry in `subgraphs` for each numbered User Journey in the HLD, in journey order. Each subgraph must be connected and limited to the runtime path needed for its journey's actions, required effects, and useful result. Exclude related workflows, unchanged downstream behavior, and initialization, dependency setup, or object construction before the trigger.
- Represent each component once per semantic role within a journey. Use separate journey-specific nodes with the same grounded `location` when a component appears in multiple journeys.
- Set `changeType` on every node and relationship from the diff. Use `unchanged` only for components or transfers needed to connect a trigger to a named effect.
- For changed nodes and relationships, immediately reference only the smallest supporting diff hunks with `diffHunkIds`; do not attach hunks to unchanged entities. Store only referenced hunks in `diffHunks`, using monotonically increasing IDs. Reuse IDs when a hunk supports multiple entities.

## 1. Inspect and Write the Inputs and Named Effects

- For each User Journey, inspect the implementation with a focus on the diff to locate the inputs, state writes, outputs, and other effects specified by the journey and applicable High Level Requirements.
- Write nodes for the journey's triggering and subsequent user actions, external inputs, state updates, outputs, and other named effects before tracing their supporting implementation. An externally triggered journey starts with a `system-input` node.
- Leave `relationships` empty for now. At the end of this pass, the JSON contains the implemented inputs and named effects for each User Journey.

## 2. Trace and Write the Supporting Nodes

- Revisit the implementation for each User Journey, using its existing nodes to bound the trace. Follow the runtime paths that produce the named effects and inspect the data those paths consume.
- Add state reads and fixed data consumed by these paths, including those not explicitly named in the HLD.
- Add participating external dependencies needed to produce the named effects, reusing any already written in pass 1.
- Add a `data-processing` node whenever a transformation, decision, or algorithm is needed to explain the runtime path from the journey's inputs and reads to its named effects. Include processing that is unchanged or not explicitly named in the HLD when it is needed to trace that path. Examples include:
  - Conditional logic that meaningfully changes the User Journey's high-level direction, often corresponding to a branch in the journey.
  - Loop logic that meaningfully changes the user workflow's high-level direction or expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
- Represent an algorithm implemented by multiple cooperating methods as one `data-processing` node.
- Leave simple data forwarding and request construction for relationships in pass 3; do not create processing nodes for them.
- Write the additional nodes to the JSON as they are identified. At the end of this pass, each journey has the nodes needed to explain how its inputs produce its named effects.

## 3. Trace and Write the Relationships

- Review the in-progress JSON alongside the patch and selected target code. For each User Journey, trace the actual data transfers between its nodes and write the corresponding relationships to the JSON.
- Merge implementation paths with the same source and destination nodes already written to the JSON in passes 1 and 2 into one directed relationship when those paths pass through no other node in the JSON. Summarize the data carried across the paths. Do not add intermediate classes or methods as nodes merely because they relay data.
- Connect every required `system-state-read` and `static-data` node to its consumer, and every state write to its `system-state-write` node. Connect inputs, processing, external dependency requests and responses, and outputs according to the implemented data transfers. Represent simple forwarding and request construction with relationships between the participating nodes.
- Add only relationships supported by an actual data transfer. Action order or the presence of two nodes in the same method does not establish a relationship.
- Set each relationship's `changeType` from the diff independently of its endpoints' change types. For each changed relationship, attach the smallest set of diff hunks showing the represented transfer, such as an assignment, argument, return value, request field, or state update. Record and reuse hunks using the evidence rules above.
- If tracing reveals a missing required node, return to passes 1 and 2 to evaluate and add it before continuing. At the end of this pass, each User Journey forms a separate connected subgraph containing all data transfers needed for its named effects.

## 4. Validate Against the Implementation and User Journeys

- Review the completed JSON alongside the HLD's High Level Requirements and User Journeys, patch, and selected target code.
- Check each User Journey and its applicable High Level Requirements against its subgraph: every specified user action, system input, state update, output, and other effect must be represented, with the reads, processing, and external dependencies needed to explain it.
- Trace each subgraph from its trigger to its named effects. Verify that it is connected, that relationships carry the data the implementation actually supplies and consumes, and that represented branches and loops agree with the implementation and User Journey.
- Check that every node and relationship belongs to that journey's scope. Remove unrelated workflows, unchanged downstream behavior beyond the named effects, setup before the trigger, duplicate semantic roles, and unnecessary processing nodes.
- Verify every `changeType` against the patch and confirm the cited evidence supports the represented behavior or transfer. Unchanged nodes and relationships must have no `diffHunkIds`. Check that every stored hunk is referenced.
- Correct graph errors by revisiting the implementation and updating the JSON. If a User Journey action or required effect is not implemented, report the discrepancy instead of inventing nodes or relationships to satisfy it.
- Run `node ai-coding-toolkit/enrich-diff/scripts/validate-sys-dataflow.mjs <output-path>`. Correct every validation error and rerun the validator after corrections. The manual checks above are required in addition to schema validation.

## Report the Result

- Report the generated JSON path and any unresolved discrepancies between the implementation and the HLD's High Level Requirements and User Journeys.
