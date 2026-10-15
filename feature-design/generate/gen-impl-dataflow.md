# Generate Implementation Dataflow JSON and Narrative

Design implementation changes that satisfy the confirmed High Level Requirements and complete the User Journeys. Initialize the `impl-dataflow` JSON, design implementation paths in it while reading relevant code, then write and verify the Implementation Dataflow narrative.

## Read the Inputs and Initialize the Implementation Dataflow

Use both design inputs:

- **High Level Requirements in the HLD doc:** Define the behavior and constraints the implementation must satisfy. Use them to guide design decisions, including requirements not explicit in sys-dataflow.
- **Validated `<feature>.sys-dataflow.json` beside the HLD doc:** Provides the starting nodes and paths to map into implementation entities and relationships. Refine this initial mapping against the requirements and current code.

Read and follow the representation contract, `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, using `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

- Initialize `<feature>.impl-dataflow.json` with `schemaVersion` set to `13`, `stage` set to `high-level-design`, and empty `classes`, `modules`, `components`, `staticData`, and `relationships` arrays.
- Set each class's `variableExposure` to `null` as it is added to the graph. Omit derived counts; this workflow calculates no quantitative quality metrics.

## Create the Implementation-Level Design

Design the additions and changes to current code needed to satisfy High Level Requirements. Use `<feature>.impl-dataflow.json` to capture a comprehensive, working implementation-level design through concrete dataflows and state accesses between named methods, functions, class instance state, static data, and components.

### Map sys-dataflow into impl-dataflow Entities

- Create impl-dataflow entities corresponding to sys-dataflow nodes:
  - `user-input` and `user-output`: `ui-component` components.
  - `system-input` and `system-output`: components of the matching type.
  - `system-state-read` and `system-state-write`: state variables under their owning classes, or `external-dependency` components for external state.
  - `static-data`: static data entries.
  - `external-dependency`: external dependency components.
- Inspect current code and sys-dataflow to find each entity's identity and concrete identifiers, such as URLs, file paths, storage keys, or source symbols. Include available identifiers in component descriptions.
- Defer mapping `dataflow` relationships and `data-processing` nodes to "Design Changes to Satisfy High Level Requirements".

### Consolidate Mapped Entities Before Designing Changes

- In the working `<feature>.impl-dataflow.json`, merge entities representing the same real implementation entity across User Journeys, including:
  - State variable entries for reads and writes of the same state.
  - UI component entries for the same surface, such as a selector panel's input and display sides.
- Represent all User Journeys in one shared graph, with one entry per real implementation entity and no separate subgraphs for individual journeys.

### Design Changes to Satisfy High Level Requirements

- Use current code to ground design decisions. Inspect relevant implementations, callers, consumers, and ownership to decide what to reuse, modify, or add.
- Map each sys-dataflow `dataflow` relationship into implementation functions and relationships:
  - Identify sending, intermediate, and receiving functions, their required data, and how the consumer uses it.
  - Determine behavior or contract changes. Reuse or modify existing classes and functions; design new ones as needed.
- Map each `data-processing` node's algorithm into implementation functions:
  - Decide how to change or extend processing, or allocate it across new classes and functions.
  - Prefer as few implementation functions as possible.
  - Define each function's inputs, transformations, decisions, and results. Capture its role in journey completion in relationship descriptions and purposes.
- Trace every required value's source; design state retention, reads, and updates.
- Find existing class ownership in current code and decide ownership for new classes.

### Check Requirement Coverage in the Working impl-dataflow

- Review each confirmed High Level Requirement directly, independently of sys-dataflow, and trace the implementation paths needed to satisfy it.
- Add missing classes, modules, functions, state variables, components, static data, and relationships, including those omitted by sys-dataflow.
- Resolve all coverage gaps before composing the narrative.

## Compose the Narrative

- Use the working JSON to write the HLD doc's Implementation Dataflow section, explaining how the implementation satisfies High Level Requirements and completes User Journeys. Briefly introduce the design approach and class responsibilities, distinguishing existing behavior from proposed changes, then describe implementation paths.
- Organize paths by User Journey or shared processing stage. Consistently use the schema's vocabulary. Name entities and use concise bullets to explain each stage's trigger, data, work, and how results reach the next stage or complete the outcome. Relate stages to journey actions and effects; refer back to shared behavior instead of repeating it.
- Explain consequential choices: class responsibilities, reuse or changes to existing functions, the need for new classes or functions, and state ownership and retention. Ground the rationale in current code and required behavior.
- Design and describe sequencing, branch and loop conditions, stage dependencies, and state read/update order where they affect behavior.
- Describe required work outside the connected path from the sys-dataflow's input, such as asynchronous or batch processing. Explain how it completes the User Journey and relates to the main path.
- Keep behavior and rationale in the narrative, using the JSON's entity identities and paths. Update the JSON for design refinements made while writing. Use concise prose and bullets without implementation code or repetition of earlier HLD sections.

## Validate the JSON and Narrative

Check the JSON and narrative against each other, the High Level Requirements, User Journeys, and sys-dataflow. Resolve gaps by revisiting the design, inspecting more code as needed, and updating both artifacts.

- Verify that the proposed implementation satisfies every confirmed High Level Requirement, including those not explicit in sys-dataflow or User Journeys.
- Trace each User Journey's actions and required effects through the JSON and narrative, from first user input to useful result.
  - Map each action and effect to named entities and stages.
  - Verify that functions receive required inputs, perform required work, and produce the journey's useful result.
  - State every required input's source, state read or update, and external interaction, leaving no gaps in journey completion.
- Confirm that the narrative explains the JSON's design decisions: added, modified, or unchanged entities, each state's location, and each new class's owning class. The JSON supplies implementation detail, not an exhaustive inventory to repeat in prose.
- Audit mismatches between implementation paths and sys-dataflow: added, missing, or rerouted paths, changed outputs, or changed `system-state-write` updates. Compare paths, not individual entries: one node may map to several functions or vice versa. Detail below the sys-dataflow's abstraction level is not a mismatch.
- Decide whether each mismatch is justified, such as when requirements or code inspection reveal a required step, state, or dependency missing from sys-dataflow. Update and re-validate sys-dataflow for justified mismatches; otherwise, correct the implementation JSON and narrative to match it.
