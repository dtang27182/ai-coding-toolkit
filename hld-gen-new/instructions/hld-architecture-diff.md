# HLD Architecture Diff

Use the Architecture Diff (arch-diff) to show how the existing architecture changes to implement the HLD. Read and follow `../../common/arch-diff/arch-diff.schema.json`, the authoritative representation contract, and use `../../common/arch-diff/arch-diff.example.json` as an HLD example.

Set `stage` to `high-level-design`. Set every class's `variableExposure` to `null`.

## Scope

- Represent Core Logic and Dataflow, including all changes required by the User Flow Steps. Keep broader workflows in Relevant Logic and Dataflow, outside the diagram.
- Include every changed class, method, state variable, component, and relationship required by the HLD.
- Include unchanged entities and relationships only when they implement or connect User Flow Steps, preserving intermediaries, state owners, and consumers. When a step supplies data or state to existing behavior, stop where it is read and applied.
- Shared entities, state, or execution paths do not bring other methods or workflows into scope. Following calls helps locate code but does not determine inclusion.
- Defer adjustments for interference with existing behavior to low level design, as defined in `hld-narrative.md`.
- Ground every entry in the feature context, narrative, or current code.

## User Flows

- Populate `userFlows` from the narrative's User Flow Steps.
- Set `userFlow` on every method, state variable, component, and non-composition relationship. Use `true` only when the entry explicitly participates in the dataflow of at least one user flow documented in the HLD narrative, and `false` otherwise.
- Do not treat one-time initialization or object construction as user-flow participation.

## Validation

For each unchanged entry and relationship, identify the numbered User Flow Step it implements or the steps it connects; omit it if neither applies. Relevance to design investigation, execution in the same workflow, or downstream carriage of the feature's data does not satisfy this check. Verify that every User Flow Step remains traceable through its unchanged participants. Preserve all required changes regardless of diagram size.
