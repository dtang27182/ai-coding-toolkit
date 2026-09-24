# Generate the Diff Description

Use the final HLD selected by the `annotate-diff` workflow.

## Initialize the Document

- Create `<outputDirectory>/<feature>/<feature>.diff-description.md`.
- Copy the HLD's `Desired Behavior` and `Scope and Assumptions` headings and their contents verbatim.

## Identify Primary User Goals

- Add a `## Primary User Goals` section after the copied sections.
- Infer the smallest set of primary user goals from `Desired Behavior`, using `Scope and Assumptions` only to constrain their interpretation.
- A primary user goal is an outcome that a user intentionally interacts with the feature to produce. It answers what result the user is trying to achieve.
- Do not translate the source sections point by point. Combine statements that support the same outcome into one goal.
- Do not make separate goals from statements that describe:
  - Implementation or storage choices.
  - Scope boundaries or excluded behavior.
  - Intermediate system behavior.
  - Supported contexts or variations of the same outcome.
  - Persistence, initialization, reset, timing, concurrency, availability, compatibility, or unchanged behavior.
- Treat such statements as constraints unless the HLD clearly presents their result as an independently desired user outcome.
- Write each primary user goal as a concise bullet describing the user's intended outcome, without implementation details.

## Generate User Flow Steps

- Generate a new `## User Flow Steps` section after `Primary User Goals`. Do not copy or consult the HLD's user flow steps.
- **Flow mapping:** Create exactly one user flow for each Primary User Goals bullet. Do not create flows for other copied Desired Behavior or Scope and Assumptions statements; use those sections only to clarify actions, effects, and constraints.
- **Flow boundary:** Capture the shortest causal flow from the initiating user action through the required user actions and direct system effects. End when the primary goal's output or high-level state update is produced.
- **Format:** Give each flow a `###` heading that briefly names the user's goal. Under it, write a short numbered sequence.
- **Step granularity:** Each numbered step must contain exactly one user action, system state update, system output, or other system effect. Put each effect caused by a user action in its own subsequent step.
- **User actions:** A flow may contain multiple user actions when they occur in a required sequence or when a user responds to information presented by an earlier system output or effect.
- **Branches and loops:** A user-action step may state a condition and the next step number for each outcome. A branch may target an earlier step to represent a loop.
- **System effects:** Include outputs shown to the user, outputs sent to external systems, updates to high-level internal system state, and other effects needed to complete the flow.
- **Step test:** Include a step only when removing it would leave the causal flow incomplete.
- **Exclusions:** Apply constraints without turning them into steps. Do not include optional variations, demonstrations that a constraint holds, implementation details, scoping commentary, or related features and workflows.
