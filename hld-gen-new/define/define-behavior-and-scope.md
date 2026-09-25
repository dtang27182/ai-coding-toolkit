# Define Behavior and Scope

Populate the `Desired Behavior`, `Scope and Assumptions`, and `Clarification Questions` sections in `<outputDirectory>/<feature>/<feature>.hld-iteration-summary.md`. The confirmed behavior and scope are the source of truth for every candidate design.

Read the feature context from chat, relevant code, and repository guidance. Separate intended outcomes and core use cases from scope boundaries, externally imposed constraints, and assumptions needed to interpret the requested behavior. Use the current code to understand existing behavior and constraints, not to choose an implementation. Preserve explicit requirements and decisions without adding design choices that the request does not require.

## Desired Behavior

- Use concise bullets for intended outcomes, core use cases, and externally observable behavior.

## Scope and Assumptions

- State what is beyond the scope of the design as it relates to the Desired Behavior.
- Identify related existing behaviors that are in scope for modification and those that must remain unchanged while realizing the Desired Behavior.
- State assumptions needed to interpret the Desired Behavior that the user did not explicitly provide. Keep assumptions independent of candidate design choices, and ask the user to resolve any uncertainty that could materially change the behavior or scope.

## Clarification Questions

- Record unresolved clarification questions as a numbered list. Write `None` when no questions remain.
