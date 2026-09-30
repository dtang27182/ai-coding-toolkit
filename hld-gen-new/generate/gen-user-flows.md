# Generate User Flows

Fill the HLD doc's `User Flows` section after `Desired Behavior`, `Scope and Assumptions`, and `User Journeys` have been copied from the iteration summary. Keep the section concise and easy to scan. Avoid repeating information from earlier sections.

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
