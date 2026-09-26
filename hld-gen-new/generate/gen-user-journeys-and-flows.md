# Generate User Journeys and User Flows

Fill the HLD doc's `User Journeys` and `User Flows` sections in order after `Desired Behavior` and `Scope and Assumptions` have been copied from the iteration summary. Keep both sections concise and easy to scan. Avoid repeating information across sections.

## User Journeys

- Identify one or more user journeys from Desired Behavior, using Scope and Assumptions to constrain their interpretation.
- A user journey is a logically grouped set of user input actions that together create a useful result for the user. It may contain one action or several actions that depend on one another, including actions taken after the user sees an earlier result.
- Group actions by the useful result they create together. Keep actions in one journey when their sequence or shared state is needed for that result; separate actions that create distinct useful results. Do not translate Desired Behavior point by point.
- Describe each journey as user actions and the result they create, without implementation details. Do not make separate journeys for constraints, storage choices, intermediate system behavior, or variations of the same journey.
- Write User Journeys as a numbered list. Give each journey a short name and briefly state its user actions and useful result.

## User Flows

- **Flow mapping:** Create exactly one user flow for each numbered User Journey, in the same order. Use the journey's name for the flow.
- **Flow boundary:** Map the journey into a causal sequence from its first user input through every user input action needed to create its useful result. End when the result is available to the user or the required system effect is complete.
- **Format:** Write User Flows as a numbered list. Add a nested numbered list containing the User Flow Steps under each flow. Each flow must contain multiple steps.
- **Step granularity:** Each numbered step must contain exactly one user input action, system state read, system state update, output back to the user, or other system effect. Put each read or effect caused by a user action in its own subsequent step.
- **Causality:** Order the steps so that each required state read, update, output, and other effect follows the input or prior effect that causes it. Include later user inputs when the journey requires another action, including an action responding to an earlier output.
- **Branches and loops:** A user-action step may state a condition and the next step number for each outcome. A branch may target an earlier step to represent a loop.
- **System effects:** Include outputs shown to the user, outputs sent to external systems, updates to high-level internal system state, and other effects needed to complete the journey.
- **Step test:** Include a step only when removing it would leave the causal flow incomplete.
- **Exclusions:** Apply constraints without turning them into steps. Do not include optional variations, demonstrations that a constraint holds, implementation details, scoping commentary, or related features and workflows.
