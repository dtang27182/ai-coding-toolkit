# Design the System Dataflow Incrementally

`sys-dataflow` is shorthand for system dataflow.

Build and refine `<feature>.sys-dataflow.json` to satisfy the confirmed High Level Requirements, using User Journeys to structure its subgraphs and current code to ground the design.

## 1. Read the Inputs and Initialize the Graph

Use three primary inputs:

- **Desired Behavior and Scope and Assumptions:** Establish the intended end state the design must achieve, including requirements not repeated in User Journeys.
- **User Journeys:** Drive the concrete construction of each subgraph.
- **Current codebase:** Understand existing dataflow, state, and external dependencies. Use Design Context and Related Workflows to locate relevant code.

Apply the level of abstraction in Design Guidelines.

Read `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.schema.json` and `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json`, then initialize `<feature>.sys-dataflow.json` for the `high-level-design` stage.

## 2. Design and Extend the Graph for Each User Journey

### Bound the Journey

- Create one `subgraphs` entry per numbered User Journey, in journey order. Keep each subgraph connected.
- Start with a `user-input` node for the journey's first user action. Add `user-input` nodes for later user actions and `system-input` nodes for required external inputs.
- Capture the journey's useful result and required effects as `user-output` or `system-output` nodes, or `dataflow` relationships into `system-state` nodes. Stop once these outputs and state updates are represented; omit unchanged downstream behavior and related workflows outside the journey.
- Exclude one-time initialization, dependency setup, and object construction before the triggering `user-input` or `system-input`.
- Exclude related workflows described only as context.

### Decide What to Reuse, Modify, or Add

For each journey, inspect the existing paths and determine how its inputs will produce its required outputs and system effects while satisfying the confirmed High Level Requirements. Make the high-level design decisions in the graph as you trace those paths:

- Reuse existing nodes and dataflows as `unchanged` when their current responsibilities and transfers satisfy the journey and fit the confirmed High Level Requirements. Ground these entries in current code and include them only when needed to connect a trigger to a required effect.
- Mark existing nodes and dataflows as `modified` when their responsibilities, behavior, or transferred data must change to satisfy the confirmed High Level Requirements while realizing the journey. Describe their proposed behavior in the graph.
- Add nodes and dataflows as `added` when the journey requires responsibilities or transfers that do not exist in the current codebase.
- Set `changeType` on every node and relationship relative to the current code. Classify each relationship by its own data transfer, independently of its endpoints' change types. Represent necessary removals as `deleted`.

Write these decisions into the JSON as you go. Revisit existing entries when later inspection changes the design; continue until the subgraph explains how the journey is realized.

### Represent the Nodes and Dataflows

- Create nodes for the major system components that directly participate in producing the journey's required effects.
- Within each subgraph, represent each system component once per semantic role. For a component used by multiple User Journeys, create distinct journey-specific nodes with the same `location` when appropriate.
- Explicitly represent the journey's useful result and required effects as `user-output` nodes, `system-output` nodes, or `dataflow` relationships into `system-state` nodes.
- Trace the `dataflow` paths that connect the journey's inputs to those outputs and state updates. Include the supporting `data-processing` nodes and requests to and responses from `external-dependency` nodes needed to realize them.
- Find reads from `system-state` and `static-data` nodes required by the journey, processing, or external dependency requests, and connect each read to its consumer with a `dataflow` relationship even when the journey does not name the read.
- Connect nodes according to the data transfers needed to realize the journey, not merely the order of its actions.
- Use `dataflow` relationships for state updates and outputs into `system-state`, `user-output`, and `system-output` nodes, and for simple data forwarding and request construction between participating nodes.
- Create a `data-processing` node only when at least one of these conditions applies:
  - Conditional or loop logic that meaningfully changes the User Journey's high-level direction.
  - Loop logic that expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
- Do not represent methods or functions that pass data through as `data-processing` nodes unless they meet at least one of the three conditions above. The vast majority of methods and functions should not become `data-processing` nodes.
- When data flows between two sys-dataflow nodes through multiple methods or functions without passing through another sys-dataflow node, merge paths with the same start and end nodes into one `dataflow` relationship. Summarize the data carried across those paths.
- Represent an algorithm performed by multiple cooperating methods as one `data-processing` node.

## 3. Validate and Refine the Working Graph

- Review the in-progress JSON against all confirmed High Level Requirements and current code. Verify that the design satisfies Desired Behavior and Scope and Assumptions, and that each journey's user actions, outputs, required system effects, and useful result are represented, with the supporting dataflows needed to connect them.
- Trace each subgraph from its trigger to its required effects. Check that it is connected, that each relationship supplies data its consumer needs, and that every node and relationship is within the journey's scope.
- Verify that every `changeType` reflects what the design reuses, modifies, adds, or removes relative to the current code.
- Resolve gaps by inspecting more code and updating the JSON. Remove unnecessary nodes and relationships as the design is refined.
- Run `node ai-coding-toolkit/common/sys-dataflow/validate-sys-dataflow.mjs <output-path>` to check the schema, unique subgraph IDs, node names, and relationship IDs, and valid relationship endpoints within each subgraph and permitted directions. Correct errors and rerun validation after revisions.
- Complete journey coverage and correct every validation error before using the graph to generate the Implementation Dataflow.
