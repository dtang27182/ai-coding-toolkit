# HLD Narrative

An HLD describes both the surrounding logic relevant to the design and the implementation dataflow that directly realizes the requested behavior. Relevant Logic and Dataflow traces the broader workflows needed to understand the design. Implementation Dataflow maps only the User Flow Steps to their implementing entities and relationships, including unchanged participants. The Architecture Diff represents this core scope.

Describe responsibilities, data, and interactions without writing implementation code. Adjustments needed to reconcile the new flow with existing classes, persistent state, methods, or dataflows that it might disrupt—or that might interfere with it—can remain for later low level design. Detailed error handling and edge cases can also remain for later low level design unless required by the desired behavior.

Keep the narrative concise and easy to scan. Write each section mostly as short bullet points, with one idea per bullet. Use at most one or two brief sentences per section when they help introduce or connect the points. Avoid repeating information across sections.

Use the following six sections in order:

## Desired Behavior

Use bullets for the intended outcomes and core use cases.

## Scope and Assumptions

Use bullets for included and excluded scope, explicit constraints, and working assumptions.

## User Flow Steps

There can be more than one user flow. Write a separate set of steps for each user flow, under a short heading naming the user's goal in that flow. Use a short numbered sequence of user actions and app responses that directly realize the requested behavior, including retained state and its later use where required. Omit implementation names and surrounding workflows; these steps define the core scope. The steps may include conditional branches or loop back to earlier steps.

## Relevant Logic and Dataflow

Use bullets to trace broader workflows needed to understand the design, from user action through processing, state access and updates, and I/O to displayed results and UI updates. Name participating classes, methods, UI and external I/O components, and the data exchanged, including unchanged participants. This context does not expand the core scope or Architecture Diff.

## Implementation Dataflow

Describe only the entities and relationships implementing or connecting the User Flow Steps, including unchanged intermediaries and consumers that read and apply the feature's output or state. Keep responsibilities, inputs, outputs, and change types consistent with the Architecture Diff; leave surrounding workflows in Relevant Logic and Dataflow.

Within this scope, cover:

- User actions, receiving UI components, and handling classes and methods.
- Processing and data transformations needed for the behavior.
- State reads and writes, naming owning classes, instance variables, updating methods, and changes made.
- I/O requests and results, naming external endpoints and the classes and methods sending requests and consuming results. Include network services, files, and local or session storage where applicable.
- Returned data, displaying UI components, and the classes and methods that render or update them, including after asynchronous results.

## Open Questions

Use one bullet per unresolved question affecting behavior, scope, logic, dataflow, or architectural fit. Write `None` when there are no questions.
