# Design the System Dataflow Incrementally

`sys-dataflow` is shorthand for system dataflow.

Design how the system will realize each User Journey by building and refining `<feature>.sys-dataflow.json`. The System Dataflow provides the high-level specification of how to realize the User Journeys in the context of the current codebase.

## 1. Read the Inputs and Initialize the Graph

Use two primary inputs:

- **User Journeys:** Read the candidate HLD doc's User Journeys to identify the user actions, outputs, required system effects, and useful results the design must realize. Apply the Desired Behavior, Scope and Assumptions, and Design Guidelines sections as constraints.
- **Current codebase:** Read the relevant code and enough surrounding code to understand the existing dataflow, state, and external dependencies. Use Design Context and Related Workflows to locate relevant paths without expanding the design's scope.

Read `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.schema.json` and `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json` to understand the graph's node types, relationship format, and permitted directions.

Initialize `<feature>.sys-dataflow.json` with `schemaVersion` set to `2`, `stage` set to `high-level-design`, the feature name, and empty `nodes` and `relationships` arrays. Use this file as the working design artifact: write nodes and relationships as decisions are made, then revise them as code inspection and journey tracing reveal gaps or better choices.

## 2. Design and Extend the Graph for Each User Journey

### Bound the Journey

- Create one subgraph for each numbered User Journey. Each subgraph must be internally connected, with no relationships connecting it to another journey's subgraph.
- Start each subgraph with a `user-input` node for the journey's first user action. Include later `user-input` nodes for its other user actions and `system-input` nodes for externally supplied inputs needed by the journey.
- Explicitly capture the journey's useful result and required effects as `user-output` nodes, `system-output` nodes, or `dataflow` relationships into `system-state` nodes. Stop tracing once these outputs and state updates are represented. Do not follow unchanged downstream behavior or related workflows outside the journey.
- Never include one-time initialization, dependency setup, or object construction that occurs before the triggering `user-input` or `system-input`.
- Do not import design choices from other candidates or expand the graph to cover related workflows described only as context.

### Decide What to Reuse, Modify, or Add

For each journey, inspect the existing paths and determine how its inputs will produce its required outputs and system effects. Make the high-level design decisions in the graph as you trace those paths:

- Reuse existing nodes and dataflows as `unchanged` when their current responsibilities and transfers already satisfy the journey. Ground these entries in current code and include them only when needed to connect a trigger to a required effect.
- Mark existing nodes and dataflows as `modified` when their responsibilities, behavior, or transferred data must change to realize the journey. Describe their proposed behavior in the graph.
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

- Review the in-progress JSON against the User Journeys and current code. Verify that each journey's user actions, outputs, required system effects, and useful result are represented, with the supporting dataflows needed to connect them.
- Trace each subgraph from its trigger to its required effects. Check that it is connected, that each relationship supplies data its consumer needs, and that every node and relationship is within the journey's scope.
- Verify that every `changeType` reflects what the design reuses, modifies, adds, or removes relative to the current code.
- Resolve gaps by inspecting more code and updating the JSON. Remove unnecessary nodes and relationships as the design is refined.
- Run `node ai-coding-toolkit/common/sys-dataflow/validate-sys-dataflow.mjs <output-path>` to check the schema, unique node names and relationship IDs, and valid relationship endpoints and directions. Correct errors and rerun validation after revisions.
- Complete journey coverage and correct every validation error before using the graph to generate the Implementation Dataflow.
