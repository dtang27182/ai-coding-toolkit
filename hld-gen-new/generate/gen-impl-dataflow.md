# Generate Implementation Dataflow Narrative and JSON

`impl-dataflow` is shorthand for the structured JSON representation of the HLD doc's `Implementation Dataflow` narrative.

Complete the HLD doc's Implementation Dataflow narrative, then generate its structured JSON representation (`impl-dataflow`) from that narrative. Use the sys-dataflow to preserve the candidate's proposed trigger-to-outcome paths while specifying the classes, methods, and state that realize them. Finish and verify the narrative before creating the JSON.

## Write the Implementation Dataflow Narrative

Describe responsibilities, data, and interactions without writing implementation code. Keep the narrative concise and easy to scan. Use short bullets with one idea each and avoid repeating information from earlier HLD sections.

The Implementation Dataflow narrative is the authoritative design source for its structured JSON representation. Describe only the entities and relationships implementing or connecting the steps in User Flows, including unchanged intermediaries and consumers that read and apply the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.

Cover:

- User actions, receiving UI components, and handling classes and methods.
- Processing and data transformations needed for the behavior.
- State reads and writes, naming owning classes, instance variables, updating methods, and changes made.
- I/O requests and results, naming external endpoints and the classes and methods sending requests and consuming results. Include network services, files, and local or session storage where applicable.
- Returned data, displaying UI components, and the classes and methods that render or update them, including after asynchronous results.

## Generate the Structured Implementation Dataflow

After the Implementation Dataflow narrative is complete, create `<feature>.impl-dataflow.json` beside the HLD doc. Use the narrative as the authoritative design source. Read and follow `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, the representation contract, and use `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

Set `stage` to `high-level-design`. Set every class's `variableExposure` to `null`. Omit derived counts until evaluation.

### Represent the Implementation Dataflow Narrative

- Represent every entity and relationship described in the Implementation Dataflow narrative, including all required changes.
- Include unchanged entities and relationships only when the Implementation Dataflow narrative identifies them as implementing or connecting User Flow Steps, preserving intermediaries, state owners, and consumers.
- Do not add workflows or implementation details found only in Design Context and Related Workflows.
- When a User Flow Step supplies data or state to existing behavior, stop where the Implementation Dataflow narrative says it is read and applied.
- Ground every entry in the Implementation Dataflow narrative and the current code. If the representation exposes a design gap, update the narrative before continuing rather than expanding or revising the design only in the JSON.

### Represent User Flows

- Populate `userFlows` from the HLD doc's User Flows and their User Flow Steps.
- Set `userFlow` on every method, state variable, component, and non-composition relationship. Use `true` only when the entry explicitly participates in the dataflow of at least one documented User Flow, and `false` otherwise.
- Do not treat one-time initialization or object construction as User Flow participation.

### Validate Traceability

- Verify that the Implementation Dataflow realizes each sys-dataflow path to a named output or high-level state update. Reconcile design gaps in both artifacts before evaluation.
- Verify that every JSON entry is traceable to the Implementation Dataflow narrative.
- For each unchanged entry and relationship, identify the User Flow and numbered step it implements or connects; omit it if neither applies.
- Verify that every User Flow Step remains traceable through its unchanged participants.
- Preserve all changes required by the Implementation Dataflow narrative regardless of diagram size.
