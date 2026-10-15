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
- Capture the journey's useful result and required effects as `user-output` or `system-output` nodes, or `dataflow` relationships into `system-state-write` nodes. Stop once these outputs and state updates are represented; omit unchanged downstream behavior and related workflows outside the journey.
- Exclude one-time initialization, dependency setup, and object construction before the triggering `user-input` or `system-input`.
- Exclude related workflows described only as context.

### Decide What to Reuse, Modify, or Add

For each journey, trace paths in the current code base from inputs to required outputs and system effects, making high-level design decisions that satisfy the confirmed High Level Requirements:

- Mark nodes and dataflows as `unchanged` when their current responsibilities and transfers satisfy the journey and confirmed High Level Requirements. Ground them in current code; include only those needed to connect a trigger to a required effect.
- Mark nodes and dataflows as `modified` when responsibilities, behavior, or transferred data must change to realize the journey and satisfy the confirmed High Level Requirements. Describe their proposed behavior in the graph.
- Add nodes and dataflows as `added` for required responsibilities or transfers absent from current code.
- Mark existing nodes and dataflows as `deleted` when their responsibilities, behavior, or transfers must be removed to realize the journey and satisfy the confirmed High Level Requirements.
- Set every node's and relationship's `changeType` relative to current code. Classify relationships by their own transfers, independently of endpoint change types.

Record decisions in the JSON as you go, revising entries when later inspection changes the design until each subgraph explains how its journey is realized.

### Represent the Nodes and Dataflows

- Create nodes for major system components directly contributing to the journey's required effects.
- Represent each component once per semantic role in each subgraph. For components shared across journeys, use distinct journey-specific nodes with the same `location` when appropriate.
- Use the same `location` for `user-input` and `user-output` nodes referring to the same UI surface, and for `system-state-read` and `system-state-write` nodes referring to the same state.
- Capture the journey's useful result and required effects as `user-output` or `system-output` nodes, or `dataflow` relationships into `system-state-write` nodes.
- Connect journey inputs to outputs and state updates with `dataflow` paths, including required `data-processing` nodes and requests to and responses from `external-dependency` nodes.
- Connect every `system-state-read` and `static-data` node needed by the journey, processing, or external requests to its consumer via `dataflow`, even if the journey omits the read.
- Connect nodes by required data transfers, not merely action order.
- Each incoming `dataflow` must carry a complete input for its destination's role, ready for non-processing nodes to use, display, store, or output as-is. Put required combinations and meaningful transformations in preceding `data-processing` nodes.
- Insert a `data-processing` node for any of:
  - Combining two or more data sources into one result.
  - Meaningfully transforming data between nodes.
  - Conditional or loop logic that meaningfully changes the journey's high-level direction.
  - Loops expressing meaningful patterns for processing large data sets.
  - Non-trivial algorithms such as search, sorting, or tree or graph traversal.
- Use `dataflow` for simple forwarding, pass-through methods and functions, and request construction unless a processing criterion applies. The vast majority of methods and functions should not become `data-processing` nodes.
- Represent one processing operation or algorithm spanning multiple cooperating methods as one `data-processing` node.

## 3. Validate and Refine the Working Graph

- Review the in-progress JSON against all confirmed High Level Requirements and current code. Verify that the design satisfies Desired Behavior and Scope and Assumptions, and that each journey's user actions, outputs, required system effects, and useful result are represented, with the supporting dataflows needed to connect them.
- Trace each subgraph from its trigger to its required effects. Check that it is connected, that each relationship supplies data its consumer needs, and that every node and relationship is within the journey's scope.
- Verify that every `changeType` reflects what the design reuses, modifies, adds, or removes relative to the current code.
- Resolve gaps by inspecting more code and updating the JSON. Remove unnecessary nodes and relationships as the design is refined.
- Run `node ai-coding-toolkit/common/sys-dataflow/validate-sys-dataflow.mjs <output-path>` to check the schema, unique subgraph IDs, node names, and relationship IDs, and valid relationship endpoints within each subgraph and permitted directions. Correct errors and rerun validation after revisions.
- Complete journey coverage and correct every validation error before using the graph to generate the Implementation Dataflow.
