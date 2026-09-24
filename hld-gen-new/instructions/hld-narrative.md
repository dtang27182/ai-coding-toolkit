# HLD Narrative

An HLD describes both the surrounding logic relevant to the design and the core logic that directly implements the requested behavior. Relevant Logic and Dataflow traces the broader workflows needed to understand the design. Core Logic and Dataflow maps only the User Flow Steps to their implementing entities and relationships, including unchanged participants. The Architecture Diff represents this core scope.

Describe responsibilities, data, and interactions without writing implementation code. Adjustments needed to reconcile the new flow with existing classes, persistent state, methods, or dataflows that it might disrupt—or that might interfere with it—can remain for later low level design. Detailed error handling and edge cases can also remain for later low level design unless required by the desired behavior.

Keep the narrative concise and easy to scan. Write each section mostly as short bullet points, with one idea per bullet. Use at most one or two brief sentences per section when they help introduce or connect the points. Avoid repeating information across sections.

Use the following seven sections in order:

## Desired Behavior

Copy this section's contents verbatim from `<outputDirectory>/<feature>/<feature>.behavior-and-scope.md`.

## Scope and Assumptions

Copy this section's contents verbatim from `<outputDirectory>/<feature>/<feature>.behavior-and-scope.md`.

## Primary User Goals

- Infer the smallest set of primary user goals from Desired Behavior, using Scope and Assumptions only to constrain their interpretation.
- Treat a primary user goal as an outcome that a user intentionally interacts with the feature to produce; it states the result the user is trying to achieve.
- First distinguish statements that describe independently desired user outcomes from statements that describe constraints, supporting behavior, or implementation details. Only independently desired user outcomes contribute to Primary User Goals.
- Combine statements that support the same independently desired user outcome into one goal; do not translate Desired Behavior point by point.
- Do not create goals from implementation or storage choices, scope boundaries, excluded behavior, intermediate system behavior, supported contexts, variations of the same outcome, persistence, initialization, reset, timing, concurrency, availability, compatibility, or unchanged behavior, even when those statements appear under Desired Behavior. Treat them as constraints unless their result is clearly an independently desired user outcome.
- Write each primary user goal as a concise bullet describing the user's intended outcome without implementation details.

## User Flow Steps

- **Flow mapping:** Create exactly one user flow for each Primary User Goals bullet. Do not create flows for other Desired Behavior or Scope and Assumptions statements; use those sections only to clarify actions, effects, and constraints.
- **Flow boundary:** Capture the shortest causal flow from the initiating user action through the required user actions and direct system effects. End when the primary goal's output or high-level state update is produced.
- **Format:** Give each flow a `###` heading that briefly names the user's goal. Under it, write a short numbered sequence.
- **Step granularity:** Each numbered step must contain exactly one user action, system state update, system output, or other system effect. Put each effect caused by a user action in its own subsequent step.
- **User actions:** A flow may contain multiple user actions when they occur in a required sequence or when a user responds to information presented by an earlier system output or effect.
- **Branches and loops:** A user-action step may state a condition and the next step number for each outcome. A branch may target an earlier step to represent a loop.
- **System effects:** Include outputs shown to the user, outputs sent to external systems, updates to high-level internal system state, and other effects needed to complete the flow.
- **Step test:** Include a step only when removing it would leave the causal flow incomplete.
- **Exclusions:** Apply constraints without turning them into steps. Do not include optional variations, demonstrations that a constraint holds, implementation details, scoping commentary, or related features and workflows.

## Relevant Logic and Dataflow

Use bullets to trace broader workflows needed to understand the design, from user action through processing, state access and updates, and I/O to displayed results and UI updates. Name participating classes, methods, UI and external I/O components, and the data exchanged, including unchanged participants. This context does not expand the core scope or Architecture Diff.

## Core Logic and Dataflow

Describe only the entities and relationships implementing or connecting the User Flow Steps, including unchanged intermediaries and consumers that read and apply the feature's output or state. Keep responsibilities, inputs, outputs, and change types consistent with the Architecture Diff; leave surrounding workflows in Relevant Logic and Dataflow.

Within this scope, cover:

- User actions, receiving UI components, and handling classes and methods.
- Processing and data transformations needed for the behavior.
- State reads and writes, naming owning classes, instance variables, updating methods, and changes made.
- I/O requests and results, naming external endpoints and the classes and methods sending requests and consuming results. Include network services, files, and local or session storage where applicable.
- Returned data, displaying UI components, and the classes and methods that render or update them, including after asynchronous results.

## Open Questions

Include unresolved questions from the behavior and scope artifact and use one bullet per additional question affecting logic, dataflow, or architectural fit. Write `None` when there are no questions.
