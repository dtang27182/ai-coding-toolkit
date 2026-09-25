# Generate the HLD Architecture Diff

Generate the Architecture Diff (`arch-diff`) only after the HLD doc is complete. Use its `Core Logic and Dataflow` section as the authoritative design source. Read and follow `ai-coding-toolkit/common/arch-diff/arch-diff.schema.json`, the representation contract, and use `ai-coding-toolkit/common/arch-diff/arch-diff.example.json` as an HLD example.

Set `stage` to `high-level-design`. Set every class's `variableExposure` to `null`.

## Represent Core Logic and Dataflow

- Represent every entity and relationship described in Core Logic and Dataflow, including all required changes.
- Include unchanged entities and relationships only when Core Logic and Dataflow identifies them as implementing or connecting User Flow Steps, preserving intermediaries, state owners, and consumers.
- Do not add workflows or implementation details found only in Design Context and Related Workflows.
- When a User Flow Step supplies data or state to existing behavior, stop where Core Logic and Dataflow says it is read and applied.
- Ground every entry in Core Logic and Dataflow and the current code. If the representation exposes a design gap, update the HLD doc before continuing rather than expanding or revising the design only in the Architecture Diff.

## Represent User Flows

- Populate `userFlows` from the HLD doc's User Flows and their User Flow Steps.
- Set `userFlow` on every method, state variable, component, and non-composition relationship. Use `true` only when the entry explicitly participates in the dataflow of at least one documented User Flow, and `false` otherwise.
- Do not treat one-time initialization or object construction as User Flow participation.

## Validate Traceability

- Verify that every Architecture Diff entry is traceable to Core Logic and Dataflow.
- For each unchanged entry and relationship, identify the User Flow and numbered step it implements or connects; omit it if neither applies.
- Verify that every User Flow Step remains traceable through its unchanged participants.
- Preserve all changes required by Core Logic and Dataflow regardless of diagram size.
