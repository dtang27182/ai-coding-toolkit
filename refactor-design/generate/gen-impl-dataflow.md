# Generate Implementation Dataflow JSON and Narrative

Design implementation changes that satisfy the confirmed High Level Requirements while preserving behavior except for explicitly permitted changes.

## 1. Understand the High Level Requirements and Design Guidelines

- Understand the required behavior, constraints, and outcomes by reading the HLD's confirmed High Level Requirements: Desired Code Structure (including Refactoring Goal) and Scope.
- Read and apply the HLD's `Design Guidelines`; do not use `Detailed Requirements` for design generation.
- Read and apply `ai-coding-toolkit/common/hld/hld-quality.md`. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

## 2. Understand the Existing Codebase

- Understand the existing codebase, especially the parts relevant to the required behavior.
- Use the HLD's `Design Context and Related Workflows` section to locate supplemental code that could be relevant to the implementation.
- This navigation aid does not limit design coverage or prescribe implementation boundaries; related workflows do not expand confirmed scope.

## 3. Design the Implementation in impl-dataflow.json

Design the additions and changes to current code needed to satisfy High Level Requirements. Capture a comprehensive, working implementation-level design in `<feature>.impl-dataflow.json` through concrete dataflows and state accesses between named methods, functions, class or module state, static data, and boundary nodes.

### Initialize impl-dataflow.json

- Follow `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.schema.json`, using `ai-coding-toolkit/common/impl-dataflow/impl-dataflow.example.json` as an example.
- Initialize `<feature>.impl-dataflow.json` beside the HLD for the `high-level-design` stage. Calculate no quantitative quality metrics.

### Design the Implementation

- Build one graph for the affected code, with one node per real implementation entity.
- Trace the existing code paths and state accesses affected by the requested structure. Represent their concrete functions, methods, state, data, and boundaries in the impl-dataflow.
- Design the additions and changes needed for the Desired Code Structure and Refactoring Goal within Scope. Represent preserved behavior and any explicitly permitted changes through the relevant nodes and relationships.
- Review every High Level Requirement and add any entities needed to satisfy it.
- Trim unchanged entities from the impl-dataflow graph.
    - Remove unchanged nodes unless they are directly connected to at least one changed node by a dataflow relationship.
    - Retain the containers of all remaining owned nodes, including unchanged context nodes. Remove containers with no remaining owned nodes.
    - Remove relationships whose endpoints refer to removed nodes.

### Evaluate and Correct Design Quality

- Read `ai-coding-toolkit/common/hld/hld-quality.md` again and evaluate the implementation design against its goals and design principles. Identify deficiencies using the confirmed High Level Requirements and actual codebase as evidence.
- Correct the deficiencies in `<feature>.impl-dataflow.json`.

### Verify Coverage and Validate the JSON

- Review every confirmed High Level Requirement directly. Verify that the impl-dataflow creates a design that satisfies it.
- Trace affected existing paths from inputs through outputs and state updates. Verify that the design preserves externally observable behavior except for explicitly permitted changes.
- Correct unjustified behavior changes and gaps in the implementation design.
- Run `node ai-coding-toolkit/common/impl-dataflow/validate-impl-dataflow.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json`. Correct errors and rerun after revisions.
- Run `node ai-coding-toolkit/common/impl-dataflow/annotate-helper-functions.mjs <outputDirectory>/<feature>/<feature>.impl-dataflow.json`.

### Write the HLD Narrative from the Design

Write the HLD's `Implementation Dataflow` subsection using the impl-dataflow design.

- Write a narrative using the following the sections:
    - High Level Overview: Succint narrative summary of the design approach.
    - Major Design Choices: Explain consequential design choices.
    - Affected Workflows: Write a succinct walk through of the affected code paths using the design's named entities. Cover only significant inputs/outputs, state reads/writes, non-trivial data processing, and external component interactions.
    - Supporting Implementation: Describe required work outside the impl-dataflow graph, such as asynchronous or batch processing, and how it supports the refactoring.
- Make the narrative as concise and easy to understand as possible. Make fully use of markdown formatting, especially headers for hierarchy and bullet points for listing content that does not need connective prose.
