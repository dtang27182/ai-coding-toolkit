# Generate Implementation Dataflow JSON and Narrative

Design implementation changes that satisfy the confirmed High Level Requirements and complete the User Journeys, without generating a System Dataflow.

## Understand the Requirements and Existing Code

- Read the HLD's confirmed High Level Requirements: Desired Behavior, Scope and Assumptions, and User Journeys. Apply its `Design Guidelines`; do not use `Detailed Requirements` for design generation.
- Read and apply `ai-coding-toolkit/common/hld/hld-quality.md`. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.
- Inspect current code relevant to each User Journey. Use the HLD's `Design Context and Related Workflows` to locate supplemental code; related workflows do not expand confirmed scope.

## Design the Implementation in impl-dataflow.json

Capture a comprehensive, working implementation-level design in `<feature>.impl-dataflow.json` through concrete dataflows and state accesses between named methods, functions, class or module state, static data, and boundary nodes.

### Initialize impl-dataflow.json

- Read `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json` and use `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an example.
- Initialize `<feature>.impl-dataflow.json` beside the HLD for the `high-level-design` stage. Omit derived counts; calculate no quantitative quality metrics.

### Design the Implementation

- Build one shared graph for all User Journeys.
- Bound each journey by its explicit user actions, required external inputs, useful result, and effects. Omit unrelated workflows and unchanged downstream behavior.
- Trace these paths through current code, including required state accesses, static data, and external interactions even when unstated in the journey.
- Assign required data combinations, transformations, meaningful branches, loops, and algorithms to concrete functions.
- Decide what to reuse or change, recording proposed responsibilities and transfers in the JSON as you inspect code; revise earlier decisions as needed.
- Review every High Level Requirement and add any entities needed to satisfy it, including required initialization and behavior outside the User Journeys.
- Trim unchanged entities from the graph:
  - Remove unchanged nodes unless they are directly connected to at least one changed node by a dataflow relationship.
  - Retain the containers of all remaining owned nodes, including unchanged context nodes. Remove containers with no remaining owned nodes.
  - Remove relationships whose endpoints refer to removed nodes.

### Evaluate and Correct Design Quality

- Read `ai-coding-toolkit/common/hld/hld-quality.md` again and evaluate the implementation design against its goals and design principles. Identify deficiencies using the confirmed High Level Requirements and actual codebase as evidence.
- Correct the deficiencies in `<feature>.impl-dataflow.json`.

### Verify Coverage and Validate the JSON

- Review every confirmed High Level Requirement directly and verify that the design satisfies it.
- Trace each User Journey to verify its required effects and that each consumer receives the data it needs. Remove unsupported user actions and dependent branches.
- Correct gaps by inspecting more code and updating the design.
- Run `node ai-coding-toolkit/common/impl-dataflow/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json`. Correct errors and rerun after revisions.
- Run `node ai-coding-toolkit/common/impl-dataflow/annotate-helper-functions.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json`.

### Write the HLD Narrative from the Design

Write the HLD's `Implementation Dataflow` subsection using the impl-dataflow design:

- High Level Overview: Summarize the design approach.
- Major Design Choices: Explain consequential design choices.
- User Journeys: Walk through each User Journey using the design's named entities. Cover significant inputs and outputs, state reads and writes, non-trivial processing, and external component interactions.
- Supporting Implementation: Describe required work outside the graph, such as asynchronous or batch processing, and how it supports the User Journeys.

Keep the narrative concise and use Markdown headings and bullets where useful.
