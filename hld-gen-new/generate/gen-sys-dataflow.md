# Generate System Dataflow for an HLD Candidate

`sys-dataflow` is shorthand for the structured JSON representation of the HLD candidate's system dataflow.

Generate the sys-dataflow as the candidate's proposed system-level design from its confirmed behavior, scope, User Flows, Design Context and Related Workflows, and current code, before generating the Implementation Dataflow.

## 1. Inspect the Current System

- Read the candidate HLD doc and use its User Flows and numbered steps to define the graph's scope.
- Read the current code and enough surrounding code to understand the existing dataflow, state, and external dependencies relevant to those flows.
- Ground unchanged nodes in current code. Derive proposed changes from the confirmed behavior and scope, User Flows, and relevant existing system paths.
- Do not import design choices from other candidates or expand the graph to cover related workflows described only as context.

## 2. Read the Format

- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.schema.json`.
- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.example.json` as an HLD example.

## 3. Build the Graph

### Flow Boundaries

- Treat each numbered User Flow in the HLD doc as the scope of one separate connected subgraph.
- Start each subgraph with a `user-input` node for the triggering user action, or a `system-input` node for an externally supplied input. Include later `user-input` nodes when the numbered steps require more user actions.
- Trace `dataflow` relationships from those inputs through relevant `system-state` updates, `data-processing` nodes, and requests to and responses from `external-dependency` nodes, to each `user-output`, `system-output`, or high-level `system-state` update named in the steps.
- Find reads from `system-state` and `static-data` nodes required by that processing or those external dependency requests, and connect each read to its consumer with a `dataflow` relationship even when the steps do not name the read.
- Stop after all named effects are represented. Do not follow unchanged downstream behavior or related workflows that the steps do not name.
- Never include one-time initialization, dependency setup, or object construction that occurs before the triggering `user-input` or `system-input`.

### Graph Representation

- Create nodes for the major system components defined by the schema that directly participate in producing those named effects.
- Within each subgraph, represent each system component once per semantic role. For a component used by multiple User Flows, create distinct flow-specific nodes with the same `location` when appropriate.
- Set `changeType` on every node and relationship relative to the current code, using `unchanged` only when the component or data transfer is necessary to connect a trigger to a named effect.

#### Processing Nodes

- Create a `data-processing` node only when the algorithm directly implements a named action or effect and has at least one of these properties:
  - Conditional or loop logic that meaningfully changes the User Flow's high-level direction, often corresponding to a branch in its steps.
  - Loop logic that expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
- Represent simple data forwarding and request construction with `dataflow` relationships between participating nodes rather than a `data-processing` node.
- Represent an algorithm performed by multiple cooperating methods as one `data-processing` node.

## 4. Write the Dataflow Artifact

- Write `<feature>.system-dataflow.json` beside the candidate HLD doc.
- Set `schemaVersion` to `2` and `stage` to `high-level-design`.

## 5. Validate the Dataflow Artifact

- Run `node ai-coding-toolkit/common/system-dataflow/validate-system-dataflow.mjs <output-path>` to check the schema, unique node names and relationship IDs, and valid relationship endpoints and directions.
- Verify that every User Flow step's named output or high-level state update is represented.
- Correct every validation error before generating the Implementation Dataflow.
