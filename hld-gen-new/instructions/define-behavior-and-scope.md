# Define Behavior and Scope

Create `<outputDirectory>/<feature>/<feature>.behavior-and-scope.md` as the source of truth for the behavior and scope used by every candidate design.

Read the feature context from chat, relevant code, and repository guidance. Separate intended outcomes and core use cases from scope boundaries, constraints, and implementation assumptions. Preserve explicit requirements and decisions without adding design choices that the request does not require.

Use these sections in order:

## Desired Behavior

Use concise bullets for intended outcomes, core use cases, and externally observable behavior.

## Scope and Assumptions

Use concise bullets for included and excluded scope, explicit constraints, and working assumptions. Label assumptions clearly and do not present them as confirmed requirements.

## Open Questions

Use one bullet per unresolved question that could affect behavior or scope. Write `None` when there are no questions. Do not silently resolve an open question with an assumption when its answer could materially change the design.

Present the draft to the user and ask them to confirm or correct it. Stop and wait for their response before generating candidate designs. Incorporate their response into the artifact, retaining any unresolved questions and assumptions, and treat the resulting artifact as confirmed only after the user explicitly approves it.
