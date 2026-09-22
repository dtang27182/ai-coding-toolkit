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
- Create one user flow for each listed primary user goal. Use the copied sections to clarify direct actions and effects, but do not derive additional flows or steps from them.
- For each primary user goal, capture the shortest continuous causal chain from the initiating user action to the output or high-level state update that fulfills the goal.
- Give each user flow a `###` heading that briefly names the user's goal under the `## User Flow Steps` heading.
- Under each heading, write a short numbered sequence. Each step must contain a user action and the direct system effects caused by that action.
- Include these system effects when applicable:
  - Outputs shown to the user.
  - Outputs sent to external systems.
  - Updates to high-level internal system state.
- End the flow when the primary requested outcome is produced.
- Include a step only when removing it would leave the causal chain from the initiating action to the primary outcome incomplete.
- Apply constraints from the copied sections without turning them into steps.
- Do not include optional variations, demonstrations that a constraint holds, implementation details, scoping commentary, or related features and workflows.
