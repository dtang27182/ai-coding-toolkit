# Define Behavior and Scope

Populate the `High Level Requirements` subsections (`Desired Behavior`, `Scope and Assumptions`, and `User Journeys`), `Detailed Requirements`, and `Clarification Questions` in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`. Apply the summary's `Design Guidelines` to `High Level Requirements`. The confirmed high-level requirements are the source of truth for every candidate design; detailed requirements guide implementation after design selection.

Read the feature context from chat, relevant code, and repository guidance. Use the current code to understand existing behavior and constraints, not to choose an implementation. Preserve explicit requirements and decisions without adding design choices that the request does not require.

## High Level Requirements

### Desired Behavior

- Use concise bullets for intended outcomes, core use cases, and externally observable behavior.

### Scope and Assumptions

- State what is beyond the scope of the design as it relates to the Desired Behavior.
- Identify related existing behaviors that are in scope for modification and those that must remain unchanged while realizing the Desired Behavior.
- State assumptions needed to interpret the Desired Behavior that the user did not explicitly provide. Keep assumptions independent of candidate design choices, and ask the user to resolve any uncertainty that could materially change the behavior or scope.

### User Journeys

- Identify one or more user journeys from Desired Behavior, using Scope and Assumptions to constrain their interpretation.
- A user journey describes one or more actions and their user-visible outputs or effects that together create a useful result for the user. Omit implementation details.
- Name who performs each action, typically the user. For each key output or visible effect, state what triggers it and when and how it is presented to the user. State what the journey enables the user to accomplish. Use explicit subjects such as "The user" and "The app" rather than commands such as "Select" or "See".
- Keep actions in one journey when the user is working toward one goal and later actions depend on what they did or saw earlier. Separate actions that create distinct useful results. Do not translate Desired Behavior point by point.
- Do not make separate journeys for constraints, storage choices, intermediate system behavior, or variations of the same journey.
- Write User Journeys as a numbered list, giving each journey a short name.

## Detailed Requirements

- Record explicit requirements for implementation after design selection, such as UI controls, copy, formatting, validation rules, and error handling. Preserve requirements from the user request and supplied references even when `Design Guidelines` exclude those details from the HLD design.
- Use concise bullets, grouping related requirements as needed. Preserve required details without repeating the higher-level sections or adding unspecified behavior or implementation choices.
- Write `None` when no detailed requirements are specified.

## Clarification Questions

- Record unresolved clarification questions as a numbered list. Write `None` when no questions remain.
