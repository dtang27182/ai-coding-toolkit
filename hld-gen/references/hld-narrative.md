# HLD Narrative

An HLD describes the core logic and dataflow needed to support the desired behavior end-to-end. Trace each core use case from the initiating user action through processing, persistent state access and updates, and I/O to the data displayed and resulting UI updates. Include every class, method, UI component, and external I/O component participating in that flow, whether changed or reused unchanged.

Describe responsibilities, data, and interactions without writing implementation code. Adjustments needed to reconcile the new flow with existing classes, persistent state, methods, or dataflows that it might disrupt—or that might interfere with it—can remain for later low level design. Detailed error handling and edge cases can also remain for later low level design unless required by the desired behavior.

Keep the narrative concise and easy to scan. Write each section mostly as short bullet points, with one idea per bullet. Use at most one or two brief sentences per section when they help introduce or connect the points. Avoid repeating information across sections.

Use the following six sections in order:

## Desired Behavior

Use bullets for the intended outcomes and core use cases.

## Scope and Assumptions

Use bullets for included and excluded scope, explicit constraints, and working assumptions.

## Core Logic and Dataflow

Begin with a brief paragraph explaining the overall approach. Then trace each flow in order, naming the participating UI and external I/O components, responsible classes and methods, and data passed between them:

- The initiating user action, the UI component receiving it, and its handling class and method.
- Processing and data transformations needed to support the behavior.
- Reads and writes of system state, including persistent instance variables in classes; identify the owning class and how the state changes.
- I/O requests and results, naming the external I/O components and the classes and methods sending requests and consuming results. Include network services, files, local or session storage, and other endpoints where applicable.
- Data returned to the user, the UI components displaying it, and the classes and methods that update or render them, including updates following asynchronous results.

Cover every applicable step; do not stop at a service boundary or omit existing methods that carry the flow through to its user-visible result.

## Touch Points

Use brief prose to group related classes, methods, UI components, and external I/O components touched by the end-to-end flow. Under each group, use concise bullets naming every participant, its responsibility, relevant inputs and outputs, and whether it is added, modified, deleted, or reused unchanged. Describe UI and external I/O components as interaction endpoints and identify their implementation classes and methods separately. Keep names, component types, and change types consistent with the Architecture Diff.

## Variable Exposure

Follow `hld-variable-exposure.md`. Use brief bullets to summarize the existing state that constrains each changed class. Keep individual declarations in the Architecture Diff.

## Open Questions

Use one bullet per unresolved question affecting behavior, scope, logic, dataflow, or architectural fit. Write `None` when there are no questions.
