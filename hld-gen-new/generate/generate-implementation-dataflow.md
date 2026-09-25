# Generate Implementation Dataflow and Architecture Diff

Complete the HLD doc's `Implementation Dataflow` section, then generate its Architecture Diff (`arch-diff`) from that narrative. Finish and verify the narrative before creating the Architecture Diff.

## Write the Implementation Dataflow Narrative

Describe responsibilities, data, and interactions without writing implementation code. Keep the narrative concise and easy to scan. Use short bullets with one idea each and avoid repeating information from earlier HLD sections.

The Implementation Dataflow is the authoritative design source for the Architecture Diff. Describe only the entities and relationships implementing or connecting the steps in User Flows, including unchanged intermediaries and consumers that read and apply the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.

Cover:

- User actions, receiving UI components, and handling classes and methods.
- Processing and data transformations needed for the behavior.
- State reads and writes, naming owning classes, instance variables, updating methods, and changes made.
- I/O requests and results, naming external endpoints and the classes and methods sending requests and consuming results. Include network services, files, and local or session storage where applicable.
- Returned data, displaying UI components, and the classes and methods that render or update them, including after asynchronous results.

## Generate the Architecture Diff

After the Implementation Dataflow narrative is complete, create the Architecture Diff beside the HLD doc. Use the narrative as the authoritative design source. Read and follow `ai-coding-toolkit/common/arch-diff/arch-diff.schema.json`, the representation contract, and use `ai-coding-toolkit/common/arch-diff/arch-diff.example.json` as an HLD example.

Set `stage` to `high-level-design`. Set every class's `variableExposure` to `null`.

### Represent Implementation Dataflow

- Represent every entity and relationship described in Implementation Dataflow, including all required changes.
- Include unchanged entities and relationships only when Implementation Dataflow identifies them as implementing or connecting User Flow Steps, preserving intermediaries, state owners, and consumers.
- Do not add workflows or implementation details found only in Design Context and Related Workflows.
- When a User Flow Step supplies data or state to existing behavior, stop where Implementation Dataflow says it is read and applied.
- Ground every entry in Implementation Dataflow and the current code. If the representation exposes a design gap, update the narrative before continuing rather than expanding or revising the design only in the Architecture Diff.

### Represent User Flows

- Populate `userFlows` from the HLD doc's User Flows and their User Flow Steps.
- Set `userFlow` on every method, state variable, component, and non-composition relationship. Use `true` only when the entry explicitly participates in the dataflow of at least one documented User Flow, and `false` otherwise.
- Do not treat one-time initialization or object construction as User Flow participation.

### Validate Traceability

- Verify that every Architecture Diff entry is traceable to Implementation Dataflow.
- For each unchanged entry and relationship, identify the User Flow and numbered step it implements or connects; omit it if neither applies.
- Verify that every User Flow Step remains traceable through its unchanged participants.
- Preserve all changes required by Implementation Dataflow regardless of diagram size.
