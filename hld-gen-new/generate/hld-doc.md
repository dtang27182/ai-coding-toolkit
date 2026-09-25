# Generate HLD Doc Sections

Fill the following sections of the HLD doc in order after its `Desired Behavior` and `Scope and Assumptions` have been copied from the iteration summary. Later sections build on the preceding sections.

Describe responsibilities, data, and interactions without writing implementation code. Keep the HLD doc concise and easy to scan. Use short bullets with one idea each unless a numbered structure is required. Avoid repeating information across sections.

## User Outcomes

- Infer the smallest set of user outcomes from Desired Behavior, using Scope and Assumptions only to constrain their interpretation.
- Treat a user outcome as a result that a user intentionally interacts with the feature to produce.
- First distinguish statements that describe independently desired user outcomes from statements that describe constraints, supporting behavior, or implementation details. Only independently desired outcomes contribute to User Outcomes.
- Combine statements that support the same independently desired user outcome into one item; do not translate Desired Behavior point by point.
- Do not create outcomes from implementation or storage choices, scope boundaries, excluded behavior, intermediate system behavior, supported contexts, variations of the same outcome, persistence, initialization, reset, timing, concurrency, availability, compatibility, or unchanged behavior, even when those statements appear under Desired Behavior. Treat them as constraints unless their result is clearly an independently desired user outcome.
- Write User Outcomes as a numbered list, with each item concisely describing the user's intended result without implementation details.

## User Flows

- **Flow mapping:** Create exactly one user flow for each numbered User Outcomes item.
- **Flow boundary:** Capture the shortest causal flow from the initiating user action through the required user actions and direct system effects. End when the user outcome is achieved through its output or high-level state update.
- **Format:** Write User Flows as a numbered list in the same order as User Outcomes. Briefly name each flow, then add a nested numbered list containing its User Flow Steps. Each flow must contain multiple steps.
- **Step granularity:** Each numbered step must contain exactly one user action, system state update, system output, or other system effect. Put each effect caused by a user action in its own subsequent step.
- **User actions:** A flow may contain multiple user actions when they occur in a required sequence or when a user responds to information presented by an earlier system output or effect.
- **Branches and loops:** A user-action step may state a condition and the next step number for each outcome. A branch may target an earlier step to represent a loop.
- **System effects:** Include outputs shown to the user, outputs sent to external systems, updates to high-level internal system state, and other effects needed to complete the flow.
- **Step test:** Include a step only when removing it would leave the causal flow incomplete.
- **Exclusions:** Apply constraints without turning them into steps. Do not include optional variations, demonstrations that a constraint holds, implementation details, scoping commentary, or related features and workflows.

## Design Context and Related Workflows

- Document findings from existing workflows and implementation paths relevant to the Desired Behavior.
- Focus on integration points, state ownership, dependencies, dataflow, constraints, and downstream behavior that Core Logic and Dataflow must account for.
- Name participating code entities and exchanged data where useful.
- Record context rather than proposed design; this section does not expand the core design scope.

## Core Logic and Dataflow

This section is the authoritative design source for the Architecture Diff. Describe only the entities and relationships implementing or connecting the steps in User Flows, including unchanged intermediaries and consumers that read and apply the feature's output or state. Leave surrounding workflows in Design Context and Related Workflows.

Cover:

- User actions, receiving UI components, and handling classes and methods.
- Processing and data transformations needed for the behavior.
- State reads and writes, naming owning classes, instance variables, updating methods, and changes made.
- I/O requests and results, naming external endpoints and the classes and methods sending requests and consuming results. Include network services, files, and local or session storage where applicable.
- Returned data, displaying UI components, and the classes and methods that render or update them, including after asynchronous results.
