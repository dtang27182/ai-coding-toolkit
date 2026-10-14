# Define Requirements

1. Read `Design Guidelines` in `<outputDirectory>/<feature>/<feature>.hld.md` to understand the intended level of detail and exclusions.
2. Read the refactoring context from chat, relevant code and tests, and repository guidance. Use `Design Guidelines` to distinguish high-level requirements from detailed requirements.

Use the current code and tests to understand existing behavior and constraints, not to choose an implementation. Preserve explicit requirements and decisions without adding unspecified design choices. The confirmed high-level requirements guide design; detailed requirements guide implementation after design handoff.

Use concise bullets for intended outcomes, behavior, scope, and constraints across all sections. Keep numbered journeys and clarification questions equally concise.

## Define High Level Requirements

Replace `<high level requirements section>` under the HLD's `Requirements` section with the contents of `ai-coding-toolkit/refactor-design/define/high-level-requirements-template.md`, preserving its heading levels. Fill its subsections using the guidance below.

### Desired Code Structure

- Describe the end-state code structure the user wants, including responsibilities, boundaries, ownership, and relationships where specified.
- Preserve explicitly requested transformations and constraints. Leave unspecified implementation choices to design generation.

#### Refactoring Goal

- State what the user wants to accomplish with the new structure and how it addresses the current code's problems.

### Scope

Use `Scope` only to group the following subsections; do not generate content directly under its heading.

#### Behavior to Preserve

- Record externally visible behaviors that must remain unchanged, such as user-visible outcomes, API contracts, stored data, and external effects. Existing behavior not explicitly permitted to change remains unchanged.

#### Behaviors that Can Change

- Record externally visible behaviors the user explicitly permits to change as part of the refactor. Treat these as permissions, not required changes; use them only when they support the Refactoring Goal.
- Leave this subsection empty when no behavior changes are permitted.

#### Explicitly Out of Scope

- Record changes the user explicitly rules out, including structural changes, behavior changes, and affected code areas or workflows.

### User Journeys

- Identify user journeys through the affected code, grounded in current code and tests and constrained by Scope. Do not turn optional behavior changes into required journey outcomes or invent interactions to describe restructuring.
- Describe user actions and their visible outputs or effects, with explicit subjects, triggers, and useful results. Omit implementation details.
- Keep dependent actions toward one goal together; separate journeys that produce distinct useful results. Do not create journeys for structural goals or implementation constraints.
- Write a numbered list, giving each journey a short name.

## Define Detailed Requirements

Write `<outputDirectory>/<feature>/<feature>.detailed-requirements.md` and link to it from the `Detailed Requirements` subsection under `Requirements` in the HLD.

- Title the file `# <feature> Detailed Requirements`.
- Record explicit implementation constraints and precise requirements for preserved or permitted behavior from the request and supplied references, such as API compatibility, data formats, ordering, and error behavior. Preserve these details even when `Design Guidelines` exclude them from the HLD design.
- Avoid repeating high-level requirements or adding unspecified behavior or implementation choices.
- Write `None` when no detailed requirements are specified.

## Record Clarification Questions

- Record only unresolved questions about High Level Requirements in the HLD's top-level `Clarification Questions` section, as a numbered list. Write `None` when no questions remain.
