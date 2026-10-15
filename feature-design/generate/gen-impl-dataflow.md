# Generate Implementation Dataflow Narrative and JSON

Use the validated `<feature>.sys-dataflow.json` beside the HLD doc to design implementation changes that complete its User Journeys and satisfy the confirmed High Level Requirements. Read relevant code, then write and verify the Implementation Dataflow narrative before generating its `impl-dataflow` JSON.

## Write the Implementation Dataflow Narrative

### Design the Implementation Paths

- Trace each User Journey's sys-dataflow path from its first `user-input` through later user inputs to required outputs and system effects. Read relevant existing classes, functions, callers, and consumers to understand current behavior and the changes needed to satisfy the confirmed High Level Requirements.
- For each high-level `dataflow` relationship, determine how data reaches and is used by its consumer. Identify sending, intermediate, and receiving functions, their required data, and behavior or contract changes. Choose existing classes and functions to reuse or modify, and design new ones as needed.
- For each `data-processing` node, determine how its required algorithm fits the existing implementation. Read relevant function bodies and supporting code; decide how to change or extend their processing, or allocate new processing across new classes and functions. Prefer to confine these algorithms to as few implementation functions as possible. Describe each function's inputs, transformations, decisions, and results, and how they complete the User Journey.
- Trace every required value's source. Identify state to retain or update and external work to perform. Design state reads and updates, static-data reads, and interactions with existing or new external dependencies, including requirements absent from the sys-dataflow but needed to complete a User Journey.
- Identify UI components and handling or rendering functions behind `user-input` and `user-output` nodes. Check whether separate nodes refer to the same component, such as a selector panel's input and display sides. Identify system inputs and outputs and the functions that receive or send their data.
- Locate each `system-state-read` or `system-state-write` node's state. Map reads and writes of the same state to one implementation entity and identify its reading or updating functions. For external dependencies, identify functions that send requests and consume results.
- Identify `static-data` nodes' fixed data and the functions that read it.
- Merge sys-dataflow nodes referring to the same implementation entity. Preserve each journey's path; unrelated paths may remain disconnected.
- Include only entities and interactions needed to complete User Journeys, including unchanged intermediaries and consumers of the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.
- Walk through each User Journey's proposed implementation: verify that functions receive required inputs, perform required work, and produce the journey's useful result. Resolve gaps by inspecting more code or refining the design.

### Compose the Narrative

- In the HLD doc's Implementation Dataflow section, explain how the implementation completes the User Journeys. Briefly introduce the design approach and class responsibilities, distinguishing existing behavior from proposed changes, then describe implementation paths.
- Organize paths by User Journey or shared processing stage. Consistently use the schema's vocabulary. Name entities and use concise bullets to explain each stage's trigger, data, work, and how results reach the next stage or complete the outcome. Relate stages to journey actions and effects; refer back to shared behavior instead of repeating it.
- Explain consequential choices: class responsibilities, reuse or changes to existing functions, the need for new classes or functions, and state ownership and retention. Ground the rationale in current code and required behavior.
- Design and describe sequencing, branch and loop conditions, stage dependencies, and state read/update order where they affect behavior.
- Describe required work outside the connected path from the sys-dataflow's input, such as asynchronous or batch processing. Explain how it completes the User Journey and relates to the main path.
- Keep behavior and rationale in the narrative, the authoritative implementation design. Resolve design details before generating JSON. Use concise prose and bullets without implementation code or repetition of earlier HLD sections.

### Validate the Narrative

Check the narrative against the User Journeys and sys-dataflow. Resolve gaps by revisiting the design, inspecting more code as needed, and updating the narrative.

- Trace each User Journey's actions and required effects from first user input to useful result. Map each action and effect to named entities and stages. State every required input's source, state read or update, and external interaction, leaving no gaps in journey completion.
- Confirm that the narrative states every design decision needed for JSON: added, modified, or unchanged entities, each state's location, and each new class's owning class.
- Audit mismatches between narrative paths and sys-dataflow: added, missing, or rerouted paths, changed outputs, or changed `system-state-write` updates. Compare paths, not individual entries: one node may map to several functions or vice versa. Detail below the sys-dataflow's abstraction level is not a mismatch.
- Decide whether each mismatch is justified, such as when code reveals a required step, state, or dependency missing from sys-dataflow. Update and re-validate sys-dataflow for justified mismatches; otherwise, correct the design and narrative to match it.

## Generate the Structured Implementation Dataflow

After completing the narrative, create `<feature>.impl-dataflow.json`. Read and follow the representation contract, `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, using `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

- Treat the narrative as authoritative design, not an exhaustive inventory. Represent every entity, relationship, and change needed to realize it, using its entity identities. Fill in implicit dataflows, state accesses, and other details from current code; make no design decisions absent from the narrative.
- Find existing class ownership in current code. For added classes, use the narrative's ownership or decide and add it to the narrative.
- Set `stage` to `high-level-design` and every class's `variableExposure` to `null`. Omit derived counts; this workflow calculates no quantitative quality metrics.
- If representation exposes a design gap, update the narrative before continuing; do not revise the design only in JSON.
