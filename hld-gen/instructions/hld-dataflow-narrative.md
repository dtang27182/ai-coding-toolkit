# Describe HLD Dataflow and State Updates

Write the Architecture Diff's `userFlows`, and the `dataDescription` and `purpose` of every dataflow and state-update relationship, using the narrative and the current code. Run this after user flow participation is labeled. Change only these three fields.

## Transcribe the User Flows

Copy the narrative's User Flow Steps into `userFlows`, one entry per user flow, preserving their order and wording. Use each flow's heading in the narrative as its `name`, and number its steps from 1. Keep conditional branches and loops in the step text.

## Describe Each Relationship

Give every `dataflow` and `state-update` relationship both fields. Composition relationships take neither.

Ground both fields in the narrative and current code. Do not restate the endpoints or the change type; the diagram already shows them.

### dataDescription

Name what moves, is read, or is modified, and enough of its shape that a reader knows what they are looking at.

- Dataflow: what the payload carries, not just its type. Include the parts that later relationships depend on.
- State update: name the instance variable being written and describe the change to it, including what it replaces or accumulates.

### purpose

Say why the relationship is needed, in one or two sentences.

- On a `userFlow: true` relationship, give its role in the flow: what becomes possible once the data arrives, or which step cannot complete without it. Name one or more steps if they depend on it, and leave the reference out when none fits.
- On a `userFlow: false` relationship, say why the relationship exists at all, such as setup, configuration, or an existing path the change depends on. State plainly that no user action triggers it.
- Do not paraphrase a User Flow Step. The step says what the user does and sees; the purpose says what this one relationship contributes to that.

## Validation

Run `node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <json-path>` and fix failures. The validator checks that both fields are present and that the user flows are well formed; it cannot check that a description is accurate.

Confirm that each relationship's two fields, read together and without the narrative at hand, explain what the edge carries and why the design needs it.
