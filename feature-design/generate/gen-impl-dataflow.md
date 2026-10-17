# Generate Implementation Dataflow JSON and Narrative

Design implementation changes that satisfy the confirmed High Level Requirements and complete the User Journeys.

## 1. Understand the High Level Requirements and Design Guidelines

- Understand the required behavior, constraints, and outcomes by reading the HLD's confirmed High Level Requirements: Desired Behavior, Scope and Assumptions, and User Journeys.
- Read and apply the HLD's `Design Guidelines`; do not use `Detailed Requirements` for design generation.
- Read and apply `ai-coding-toolkit/feature-design/hld-quality.md`. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

## 2. Understand the Existing Codebase

- Understand the existing codebase, especially the parts relevant to the required behavior.
- Use the validated `<feature>.sys-dataflow.json` as a guide to locate the core code relevant to the implementation.
- Use the HLD's `Design Context and Related Workflows` section to locate supplemental code that could be relevant to the implementation.
- These navigation aids do not limit design coverage or prescribe implementation boundaries; related workflows do not expand confirmed scope.

## 3. Design the Implementation in impl-dataflow.json

Design the additions and changes to current code needed to satisfy High Level Requirements. Capture a comprehensive, working implementation-level design in `<feature>.impl-dataflow.json` through concrete dataflows and state accesses between named methods, functions, class or module state, static data, and boundary nodes.

### Initialize impl-dataflow.json

- Follow `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, using `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an example.
- Initialize `<feature>.impl-dataflow.json` beside the HLD with `schemaVersion: 14`, `stage: "high-level-design"`, and empty `nodes`, `containers`, and `relationships` arrays.
- Omit diff-hunk references and derived counts; calculate no quantitative quality metrics.

### Design the Implementation

- Build one shared graph for all User Journeys, with one node per real implementation entity. Unlike the sys-dataflow, the impl-dataflow should not have duplicated nodes.
- Map the nodes from the sys-dataflow to entities defined in the impl-dataflow schema.
    - Locate concrete entities in the code base corresponding to the sys-dataflow entities.
- Based on the actual codebase, expand the sys-dataflow's dataflow relationships and data-processing nodes into concrete functions, methods, and dataflows in impl-dataflow to create a comprehensive implementation-level design that satisfies the requirements.
- Review the High Level Requirements. Based on the existing codebase, add any impl-dataflow entities needed to fullfill the High Level Requirement that could not be derived from mapping and expanding out the sys-dataflow.
- Trim unchanged entities from the impl-dataflow graph.
    - Remove unchanged nodes unless they are directly connected to at least one changed node by a dataflow relationship.
    - Retain the containers of all remaining owned nodes, including unchanged context nodes. Remove containers with no remaining owned nodes.
    - Remove relationships whose endpoints refer to removed nodes.

### Verify Coverage and Validate the JSON

- Review every confirmed High Level Requirement directly, including those not explicit in sys-dataflow. Verify that the impl-dataflow creates a design that satisfies it.
- Trace each User Journey from triggering actions to useful results and required effects. Verify that the impl-dataflow creates an implementation that realizes the User Journey
- Compare impl-dataflow with sys-dataflow for added, missing, or rerouted paths, changed outputs, and changed state updates. Detail below its abstraction level is not a mismatch.
- Correct unjustified mismatches in the implementation design. Update and re-validate sys-dataflow where requirements and code inspection justify a system-level correction.
- Run `node ai-coding-toolkit/common/impl-dataflow/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json`. Correct errors and rerun after revisions.

### Write the HLD Narrative from the Design

Write the HLD's `Implementation Dataflow` subsection using the impl-dataflow design:

- Use concise bullet points throughout the narrative.
- Give a succinct high-level overview of the design approach, class responsibilities, and changes and additions to existing code.
- Walk through each User Journey using the design's named entities. Cover only significant inputs/outputs, state reads/writes, non-trivial data processing, and external component interactions.
- Explain consequential design choices that cannot be understood from impl-dataflow alone.
- Describe required work outside the impl-dataflow graph, such as asynchronous or batch processing, and how it supports the User Journeys.
- Explain significant deviations from sys-dataflow and their justification in actual code and implementation-level constraints.
