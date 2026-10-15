# Generate Implementation Dataflow JSON and Narrative

Design implementation changes that satisfy the confirmed High Level Requirements and complete the User Journeys. Initialize the `impl-dataflow` JSON, design implementation paths in it while reading relevant code, then write and verify the Implementation Dataflow narrative.

## Read the Inputs and Initialize the Implementation Dataflow

Use both design inputs:

- **High Level Requirements in the HLD doc:** Define the behavior and constraints the implementation must satisfy. Use them to guide design decisions, including requirements not explicit in sys-dataflow.
- **Validated `<feature>.sys-dataflow.json` beside the HLD doc:** Provides the starting nodes and paths to map into implementation entities and relationships. Refine this initial mapping against the requirements and current code.

Read and follow the representation contract, `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, using `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

- Initialize `<feature>.impl-dataflow.json` beside the HLD doc with `schemaVersion` set to `13`, `stage` set to `high-level-design`, and empty `classes`, `modules`, `components`, `staticData`, and `relationships` arrays.
- Set each class's `variableExposure` to `null` as it is added to the graph. Omit derived counts; this workflow calculates no quantitative quality metrics.

## Design the Implementation Paths

- Work in the JSON.
  - Add and revise entities, relationships, and changes as you inspect code and make design decisions.
- Trace each User Journey.
  - Follow its sys-dataflow path from the first `user-input` through later user inputs to required outputs and system effects.
  - Read relevant classes, function bodies, supporting code, callers, and consumers to understand current behavior and changes needed to satisfy confirmed High Level Requirements.
- Design each high-level `dataflow` relationship.
  - Identify sending, intermediate, and receiving functions, their required data, and how the consumer uses it.
  - Determine behavior or contract changes. Reuse or modify existing classes and functions; design new ones as needed.
- Design each `data-processing` node's algorithm implementation.
  - Decide how to change or extend processing, or allocate it across new classes and functions.
  - Prefer as few implementation functions as possible.
  - Define each function's inputs, transformations, decisions, and results. Capture its role in journey completion in relationship descriptions and purposes.
- Identify required data, state, and external work.
  - Trace every required value's source; design state retention, reads, and updates.
  - Locate each `system-state-read` or `system-state-write` node's state and identify its reading or updating functions.
  - Identify `static-data` nodes' fixed data and readers.
  - Identify existing or new external dependencies and functions that send requests and consume results.
  - Include work absent from sys-dataflow but needed to satisfy High Level Requirements or complete a User Journey.
- Map UI and system boundaries.
  - Identify `user-input` and `user-output` nodes' UI components and handling or rendering functions.
  - Identify system inputs and outputs and the functions that receive or send their data.
- Resolve ownership, identity, and scope.
  - Find existing class ownership in current code and decide ownership for new classes.
  - Merge sys-dataflow nodes referring to the same implementation entity, including:
    - Reads and writes of the same state.
    - Shared UI components, such as a selector panel's input and display sides.
  - Preserve each journey's path; unrelated paths may remain disconnected.
  - Include only entities and interactions needed to satisfy High Level Requirements or complete User Journeys, including unchanged intermediaries and consumers of the feature's output or state.
  - Leave surrounding workflows in Design Context and Related Workflows.

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
