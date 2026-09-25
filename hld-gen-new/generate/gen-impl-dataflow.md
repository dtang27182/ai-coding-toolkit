# Generate Implementation Dataflow Narrative and JSON

`impl-dataflow` is shorthand for the structured JSON representation of the HLD doc's `Implementation Dataflow` narrative.

Use the validated `<feature>.system-dataflow.json` beside the candidate HLD doc to design the implementation changes that achieve its User Outcomes. Read the relevant code, then write and verify the Implementation Dataflow narrative before generating its `impl-dataflow` JSON.

## Write the Implementation Dataflow Narrative

### Design the Implementation Paths

- Follow each User Flow's sys-dataflow path from `user-input` or `system-input` to its named output or `system-state` update. Locate the relevant existing classes and methods, and read their implementations, callers, and consumers to understand how the current system handles the behavior and where it falls short of the User Outcome.
- For each high-level `dataflow` relationship, work out how the data will actually reach and be used by its consumer. Identify the sending, intermediate, and receiving methods, the data each needs, and the changes required to their behavior or contracts. Choose existing classes and methods to reuse or modify, and design new ones where needed. Describe the resulting direct transfers, including unchanged intermediaries.
- For each `data-processing` node, determine how its required algorithm fits the existing implementation. Read the relevant method bodies and supporting code; decide how to change or extend their processing, or allocate new processing across new classes and methods. Prefer to keep the implementation of the algorithms descripted in the data-processing nodes confined to as few implementation methods as possible. Describe the inputs, transformations, decisions, and results each method is responsible for, including how they produce the User Outcome.
- As the implementation takes shape, trace where every required value comes from, what state must be retained or updated, and what external work must occur. Design the necessary state reads and updates, static-data reads, and interactions with existing or new external dependencies. These implementation requirements may be absent from the sys-dataflow; include them when needed to realize a User Flow Step.
- Identify the UI components and handling or rendering methods behind `user-input` and `user-output` nodes. Determine whether separate nodes refer to the same actual UI component, such as the input and display sides of one selector panel. Identify system inputs and outputs and the methods that receive or send their data.
- Determine where each `system-state` resides. For mutable instance state, identify its owning class, state variable, and reading or updating methods. Treat other state, including browser, file, database, or object storage, as external dependencies; identify the storage resource and any known path or key. For these and other external dependencies, identify the methods that send requests and consume results.
- Identify the fixed data represented by `static-data` nodes and the methods that read it.
- Merge sys-dataflow nodes that refer to the same implementation entity, using a consistent identity for each class, method, state variable, static-data source, and component across User Flows. Preserve each User Flow's path; unrelated paths may remain disconnected.
- Limit the design to entities and interactions that implement or connect User Flow Steps, including unchanged intermediaries and consumers of the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.
- Walk through the proposed implementation for each User Flow to verify that its methods receive the required inputs, perform the required work, and produce the User Outcome; resolve gaps by inspecting more code or refining the design.

### Compose the Narrative

- Write the design in the HLD doc's Implementation Dataflow section as an explanation of how the implementation achieves the User Outcomes. Start with a brief overview of the design approach and class responsibilities, distinguishing existing behavior from proposed changes, then describe the implementation paths.
- Organize paths by User Flow or shared processing stage. Use the schema's implementation vocabulary consistently: classes, methods, state variables, static data, UI components, system inputs and outputs, and external dependencies. Name the entities involved and explain in concise bullets what triggers each stage, what data it uses, what work it performs, and how its results reach the next stage or complete the outcome. Relate stages to User Flow Steps and refer back to shared behavior instead of repeating it.
- Explain the rationale for consequential choices: why responsibilities belong in particular classes, why existing methods are reused or changed, why new classes or methods are needed, and why state is owned or retained where it is. Tie the reasoning to the current code and required behavior.
- Design and describe sequencing, branch and loop conditions, dependencies between stages, and the order of state reads and updates where these affect behavior.
- Describe required parts of the implementation design that do not fit neatly into the connected dataflow path starting at the sys-dataflow's input, such as asynchronous work or batch processing. Explain their role in achieving the User Outcome and how they relate to the main path.
- Keep this behavioral explanation and rationale in the narrative, which is the authoritative implementation design. Resolve these design details before generating JSON, using concise prose and bullets without implementation code or repetition of earlier HLD sections.

### Validate the Narrative

Check the written narrative against the User Flows and sys-dataflow. When the narrative is incomplete, return to the design, inspecting more code as needed, and update the narrative.

- For each User Flow, walk its steps through the narrative from trigger to User Outcome. Each step should map to named entities and stages. The narrative should state the source of every input, every state read or update, and every external interaction, and no step should rely on behavior it leaves unstated.
- Confirm that the narrative states every design decision the JSON will need: which entities are added, modified, or unchanged, where each piece of state lives, and which class owns each new class.
- Audit the mismatches between the narrative's paths and the sys-dataflow, such as added, missing, or rerouted paths, or changed outputs or `system-state` updates. Match paths rather than individual entries, since one node may map to several methods or several nodes to one. Implementation detail below the sys-dataflow's level of abstraction is not a mismatch.
- For each mismatch, decide whether the design justifies it, for example because the code revealed a required step, state, or dependency that the sys-dataflow missed. Update the sys-dataflow for justified mismatches and re-validate it; otherwise, correct the design and narrative to match the sys-dataflow.

## Generate the Structured Implementation Dataflow

After the Implementation Dataflow narrative is complete, create `<feature>.impl-dataflow.json`. Read and follow `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, the representation contract, and use `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an HLD example.

- Treat the narrative as the authoritative design, not an exhaustive inventory. Represent every entity, relationship, and change needed to realize it, using its entity identities. Fill in individual dataflows, state accesses, and other details the narrative leaves implicit from the current code, but make no design decisions it lacks.
- Add `composition` relationships between represented classes where one owns the other. Find existing ownership in the current code; for added classes, use the ownership the narrative gives, or decide it and add it to the narrative.
- Set `stage` to `high-level-design` and every class's `variableExposure` to `null`. Omit derived counts until evaluation.
- Populate `userFlows` from the HLD doc's User Flows and Steps.
- If the representation exposes a design gap, update the narrative before continuing rather than revising the design only in the JSON.
