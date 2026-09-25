# Generate Implementation Dataflow Narrative and JSON

`impl-dataflow` is shorthand for the structured JSON representation of the HLD doc's `Implementation Dataflow` narrative.

Use the validated `<feature>.system-dataflow.json` beside the candidate HLD doc to design the implementation changes that achieve its User Outcomes. Read the relevant code, then write and verify the Implementation Dataflow narrative before generating its `impl-dataflow` JSON.

## Write the Implementation Dataflow Narrative

### Design the Implementation Paths

- Follow each User Flow's sys-dataflow path from `user-input` or `system-input` to its named output or `system-state` update. Locate the relevant existing classes and methods, and read their implementations, callers, and consumers to understand how the current system handles the behavior and where it falls short of the User Outcome.
- For each high-level `dataflow` relationship, work out how the data will actually reach and be used by its consumer. Identify the sending, intermediate, and receiving methods, the data each needs, and the changes required to their behavior or contracts. Choose existing classes and methods to reuse or modify, and design new ones where needed. Describe the resulting direct transfers, including unchanged intermediaries.
- For each `data-processing` node, determine how its required algorithm fits the existing implementation. Read the relevant method bodies and supporting code; decide how to change or extend their processing, or allocate new processing across new classes and methods. Describe the inputs, transformations, decisions, and results each method is responsible for, including how they produce the User Outcome.
- As the implementation takes shape, trace where every required value comes from, what state must be retained or updated, and what external work must occur. Add the necessary `stateVariables` and `staticData` entries, with `state-read`, `state-update`, and `dataflow` relationships, including interactions with existing or new `external-dependency` components. These implementation requirements may be absent from the sys-dataflow; include them when needed to realize a User Flow Step.
- Walk through the proposed implementation for each User Flow to verify that its methods receive the required inputs, perform the required work, and produce the User Outcome; resolve gaps by inspecting more code or refining the design.

### Use the Schema Entities

- Map `user-input` and `user-output` nodes to `ui-component` components and their handling or rendering methods. Use one component when both nodes refer to the same actual UI component, such as one selector panel; otherwise use separate components. Map `system-input` and `system-output` nodes to components of matching types and their receiving or sending methods.
- Map `external-dependency` nodes to components of type `external-dependency` and methods that send requests and consume results.
- Map `system-state` held in a mutable class instance field to its owning `class` and `stateVariable`, with `state-read` and `state-update` relationships between the variable and methods that access it.
- Map other `system-state`, including browser, file, database, or object storage, to `external-dependency` components. Use `name` and `description` to identify the storage resource and its path or key when known; connect it to reading or updating methods with `dataflow` relationships.
- Map `static-data` nodes to `staticData` entries, merging nodes that refer to the same data source.
- Add a `dataflow` relationship from each `staticData` entry to each method that reads it.
- Merge sys-dataflow nodes that refer to the same implementation entity so each `class`, `method`, `stateVariable`, `staticData` entry, and `component` appears once in the impl-dataflow. Preserve each User Flow's path; unrelated paths may remain disconnected.
- Limit represented `classes`, `methods`, `stateVariables`, `staticData`, `components`, and `relationships` to those that implement or connect User Flow Steps, including unchanged intermediaries and consumers of the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.

### Compose the Narrative

- Write the design in the HLD doc's Implementation Dataflow section as an explanation of how the implementation achieves the User Outcomes. Start with a brief overview of the design approach and class responsibilities, distinguishing existing behavior from proposed changes, then describe the implementation paths.
- Organize paths by User Flow or shared processing stage. Use concise bullets in execution order, naming the classes, methods, components, and state involved. Explain what triggers each stage, what data it uses, what work it performs, and how its results reach the next stage or complete the outcome. Relate stages to User Flow Steps and refer back to shared behavior instead of repeating it.
- Explain the rationale for consequential choices: why responsibilities belong in particular classes, why existing methods are reused or changed, why new classes or methods are needed, and why state is owned or retained where it is. Tie the reasoning to the current code and required behavior.
- Design and describe sequencing, branch and loop conditions, dependencies between stages, and the order of state reads and updates where these affect behavior.
- Describe required parts of the implementation design that do not fit neatly into the connected dataflow path starting at the sys-dataflow's input, such as asynchronous work or batch processing. Explain their role in achieving the User Outcome and how they relate to the main path.
- Keep this behavioral explanation and rationale in the narrative, which is the authoritative implementation design. The JSON records its entities and direct `dataflow`, `state-read`, `state-update`, and `composition` relationships; it does not replace the explanation of how execution unfolds. Resolve these design details before generating JSON, using concise prose and bullets without implementation code or repetition of earlier HLD sections.

## Generate the Structured Implementation Dataflow

After the Implementation Dataflow narrative is complete, create `<feature>.impl-dataflow.json` beside the HLD doc. Use the narrative as the authoritative design source. Read and follow `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, the representation contract, and use `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

Set `stage` to `high-level-design`. Set every class's `variableExposure` to `null`. Omit derived counts until evaluation.

### Represent the Implementation Dataflow Narrative

- Represent every entity and relationship described in the Implementation Dataflow narrative, including all required changes.
- Represent boundary participants in `components` as `ui-component`, `system-input`, `system-output`, or `external-dependency`. Give each a name and description identifying the component and any known URL, path, or key. Use `component` endpoints; system inputs only send data, and system outputs only receive it.
- Represent fixed data as `staticData`, with a `dataflow` relationship from the source to each method that reads it. Represent files and storage as `external-dependency` components.
- Include unchanged entities and relationships only when the Implementation Dataflow narrative identifies them as implementing or connecting User Flow Steps, preserving intermediaries, state owners, and consumers.
- Do not add workflows or implementation details found only in Design Context and Related Workflows.
- When a User Flow Step supplies data or state to existing behavior, stop where the Implementation Dataflow narrative says it is read and applied.
- Ground unchanged entries in the Implementation Dataflow narrative and current code, and proposed changes in the narrative and candidate design. If the representation exposes a design gap, update the narrative before continuing rather than expanding or revising the design only in the JSON.

### Represent User Flows

- Populate `userFlows` from the HLD doc's User Flows and their User Flow Steps.
- Set `userFlow` on every method, state variable, static-data entry, component, and non-composition relationship. Use `true` only when the entry explicitly participates in the dataflow of at least one documented User Flow, and `false` otherwise.
- Do not treat one-time initialization or object construction as User Flow participation.

### Validate Traceability

- Verify that each implementation path achieves its User Outcome and realizes the corresponding sys-dataflow path to a named output or high-level state update, including required state and static-data reads. Compare paths rather than expecting a one-to-one mapping between graph entries. Reconcile any changes to system-level behavior or paths with the sys-dataflow before evaluation.
- Verify that every JSON entry is traceable to the Implementation Dataflow narrative.
- For each unchanged entry and relationship, identify the User Flow and numbered step it implements or connects; omit it if neither applies.
- Verify that every User Flow Step remains traceable through its unchanged participants.
- Preserve all changes required by the Implementation Dataflow narrative regardless of diagram size.
