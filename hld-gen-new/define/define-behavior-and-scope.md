# Define Behavior and Scope

Populate the `Desired Behavior`, `Scope and Assumptions`, `User Journeys`, and `Clarification Questions` sections in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`. The confirmed behavior, scope, and user journeys are the source of truth for every candidate design.

Read the feature context from chat, relevant code, and repository guidance. Separate intended outcomes and core use cases from scope boundaries, externally imposed constraints, and assumptions needed to interpret the requested behavior. Use the current code to understand existing behavior and constraints, not to choose an implementation. Preserve explicit requirements and decisions without adding design choices that the request does not require.

## Desired Behavior

- Use concise bullets for intended outcomes, core use cases, and externally observable behavior.

## Scope and Assumptions

- State what is beyond the scope of the design as it relates to the Desired Behavior.
- Identify related existing behaviors that are in scope for modification and those that must remain unchanged while realizing the Desired Behavior.
- State assumptions needed to interpret the Desired Behavior that the user did not explicitly provide. Keep assumptions independent of candidate design choices, and ask the user to resolve any uncertainty that could materially change the behavior or scope.

## User Journeys

- Identify one or more user journeys from Desired Behavior, using Scope and Assumptions to constrain their interpretation.
- A user journey is a logically grouped set of user input actions that together create a useful result for the user. It may contain one action or several actions that depend on one another, including actions taken after the user sees an earlier result.
- Group actions by the useful result they create together. Keep actions in one journey when their sequence or shared state is needed for that result; separate actions that create distinct useful results. Do not translate Desired Behavior point by point.
- Describe each journey as user actions and the result they create, without implementation details. Do not make separate journeys for constraints, storage choices, intermediate system behavior, or variations of the same journey.
- Write User Journeys as a numbered list. Give each journey a short name and briefly state its user actions and useful result.

## Clarification Questions

- Record unresolved clarification questions as a numbered list. Write `None` when no questions remain.
