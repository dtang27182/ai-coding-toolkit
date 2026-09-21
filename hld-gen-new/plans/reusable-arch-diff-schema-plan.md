# Reusable Arch-Diff Schema

## 1. Goal

Make `arch-diff.schema.json` the self-contained, reusable definition of an Architecture Diff for design, code review, and code exploration.

Move generic entity, state, relationship, endpoint, and change semantics out of the HLD instructions and into schema descriptions and constraints. Keep only HLD workflow and scope-selection rules in `SKILL.md`, `generate-hld.md`, and `hld-architecture-diff.md`.

## 2. Ownership Boundary

`arch-diff.schema.json` owns:

- The meaning and valid shape of every entity and relationship.
- Representation rules that keep the selected architecture complete, such as showing intermediate participants and recording state reads and writes explicitly.
- Change-type semantics.
- Relationship direction, endpoint types, and required metadata.
- Machine-checkable structural invariants.
- Descriptions of semantic invariants that require the validator to enforce.

The HLD Markdown owns:

- Candidate generation, evaluation, comparison, and selection.
- HLD artifact locations, filenames, and lifecycle.
- How Desired Behavior, User Flow Steps, Core Logic and Dataflow, and Relevant Logic and Dataflow determine the represented scope.
- Which HLD fields must be populated from the narrative and current code.
- HLD-specific stopping points, traceability checks, and low-level-design deferrals.

## 3. Make the Schema Reusable

Update `hld-gen-new/references/arch-diff.schema.json` and increment `schemaVersion`.

### Remove HLD-only assumptions from the base contract

- Keep `stage` required and allow exactly `high-level-design` or `code-review`.
- Make `userFlows`, entity-level and relationship `userFlow` annotations, and Variable Exposure inventories optional in the shared schema.
- Keep derived HLD quality counts optional for both stages because generated HLD candidates omit them until evaluation.
- Rewrite descriptions that refer to the narrative, Core Logic and Dataflow, HLD selection, or post-selection visualizer passes in context-neutral language.
- Keep HLD field-presence, scope, and field-source requirements in `hld-architecture-diff.md`, and cross-entry semantic checks in the HLD validation path.

### Centralize shared semantics

- Add a root description explaining that an arch-diff records the architecture elements examined for a task, their change types, and the relationships between them.
- Define `changeType` once under `$defs` and reference it from classes, methods, state variables, components, and relationships.
- Document that `unchanged` means reused without a declaration, responsibility, or contract change; participation or a new relationship alone does not change an endpoint.
- Describe every top-level collection, including when an empty array is required.

### Define entities in the schema

- Move the UI and external-I/O component definition into `$defs.component`.
- State that implementation classes, methods, handlers, and adapters belong in `classes` rather than `components`.
- Require a changed class whenever one of its methods or state variables is added, modified, or deleted. Express this with JSON Schema conditionals where practical and retain semantic validation for cross-entry rules.
- State in the schema descriptions that class and component names must be unique across the document, and that method and state-variable names must be unique within their class. Continue enforcing these rules in the validator.

### Fully define state variables

- Define state variables as mutable instance fields whose declaration or architectural meaning is added, modified, or deleted, plus unchanged mutable fields referenced by a `state-read` or `state-update` relationship.
- Exclude static/class variables, locals, unrelated fields, read-only or constructor-only fields, and child-object composition references.
- State that constructor assignment is initialization rather than a state update.
- State that runtime writes do not make an existing declaration `modified`; `changeType` reflects declaration or architectural-meaning changes.
- Require state relationships to reference the exact state-variable entry.

### Fully define relationships

- Describe `dataflow`, `state-read`, `state-update`, and `composition` individually, including their allowed source and target endpoints.
- Require intermediate participants to remain explicit.
- Require every represented state read and write to have a corresponding state relationship.
- Define composition as class ownership, including owned child-object references excluded from state variables.
- State that relationships represent dependency and data movement, not execution order.
- Require `dataDescription` and `purpose` according to relationship type. Leave `userFlow` optional in the shared schema and require it through the HLD instructions.

## 4. Reduce the HLD Instructions

### `hld-architecture-diff.md`

Replace the duplicated representation rules with a short instruction to read and follow `arch-diff.schema.json` and its example.

Retain only:

- The HLD definition of represented scope: Core Logic and Dataflow required by User Flow Steps.
- The boundary between Core Logic and Dataflow and Relevant Logic and Dataflow.
- The requirement to include changed methods and unchanged methods needed by the HLD scope.
- Rules for including unchanged participants and stopping where supplied data or state is read and applied.
- The rule that shared state or execution paths do not expand HLD scope.
- Grounding in confirmed behavior, the HLD narrative, and current code.
- Low-level-design deferrals.
- HLD traceability from unchanged entries and relationships to numbered User Flow Steps.
- The requirement to use `stage: "high-level-design"` and populate `userFlows`, applicable `userFlow` annotations, and Variable Exposure inventories from the HLD and current code.

### `generate-hld.md`

Keep candidate inputs, differentiation, artifact paths, parallel narrative/arch-diff authoring, preservation rules, and iteration-record updates.

Remove generic arch-diff semantics. Retain only the lifecycle instruction that unknown inventories remain `null` and derived counts remain absent until evaluation; place the meanings of `null` and omitted counts in the schema.

### `SKILL.md`

Keep the outer workflow, candidate loop, evaluation, selection, stopping conditions, artifact locations, and handoff.

Update routing so `arch-diff.schema.json` is the authoritative representation contract and `hld-architecture-diff.md` is the HLD scope profile.

## 5. Align Validation and Examples

- Update `arch-diff.example.json` and the bundled visualizer sample to the new schema version while keeping them valid HLD examples.
- Update `validate-architecture-diff.mjs` so generic structural and referential checks apply to every arch-diff.
- Add an HLD validation mode or equivalent checks for required HLD fields, user-flow traceability, and evaluated HLD fields without making them mandatory for `code-review` documents.
- Keep property-name uniqueness, endpoint referential integrity, and ordered User Flow Step checks in the validator because standard JSON Schema cannot express them cleanly. Document these invariants in the schema descriptions as well.
- Update the visualizer only where optional HLD fields or the schema-version change require it.

## 6. Verification

- Validate the schema with minimal `high-level-design` and `code-review` fixtures, including a `code-review` fixture used for code exploration.
- Validate the HLD example through both the generic and HLD validation paths.
- Verify that invalid endpoint references, duplicate names, mismatched class change types, and malformed state relationships still fail.
- Build and type-check the visualizer with the updated schema and samples.
- Run installer tests to confirm the renamed schema and updated instructions are copied correctly.
- Confirm the three Markdown files no longer duplicate generic schema semantics.
