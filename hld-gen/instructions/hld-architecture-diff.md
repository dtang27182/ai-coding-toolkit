# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `../references/architecture-diff.schema.json` and `../references/architecture-diff.example.json` before writing it.

## Scope

- Represent Implementation Dataflow, including all changes required by the User Flow Steps. Keep broader workflows in Relevant Logic and Dataflow, outside the diagram.
- Include unchanged entities and relationships only when they implement or connect User Flow Steps, preserving intermediaries, state owners, and consumers. When a step supplies data or state to existing behavior, stop where it is read and applied.
- Shared entities, state, or execution paths do not bring other methods or workflows into scope. Following calls helps locate code but does not determine inclusion.
- Defer adjustments for interference with existing behavior to low level design, as defined in `hld-narrative.md`.
- Ground every entry in the feature context, narrative, or current code.

## Classes, State Variables, Methods, and Components

- Include all required class, state-variable, and method changes. Apply the scope criteria separately to unchanged classes, state variables and methods within included classes, and components.
- Use `components` for UI surfaces (`ui`) and external I/O endpoints (`external-io`), such as network services, files, and browser storage. Each has `name`, `type`, and `changeType`; use `[]` when none participate.
- Keep implementation classes and methods, including UI handlers and I/O adapters, in `classes`. Variable exposure belongs to those classes.
- Mark reused entries `unchanged`. Participation or a new connection alone does not modify an endpoint.
- A class with an added, modified, or deleted method or state variable must be marked changed.
- Keep class and component names globally unique, and method names unique within each class.

### State Variables

- Give every class a `stateVariables` array. Include every mutable instance variable added, modified, or deleted by the design and every unchanged mutable instance variable read or written by Implementation Dataflow. Use `[]` when none qualify.
- Exclude static/class variables, method-local variables, unrelated fields, explicitly read-only fields, and fields initialized at declaration or construction but never written afterward. Constructor assignment is initialization, not a state update.
- Exclude fields used only to reference owned child objects. Represent ownership with `composition`; do not duplicate the backing reference as state or create state relationships for ordinary access to it.
- Set a state variable's `changeType` from changes to its declaration or architectural meaning. Writing a new runtime value does not by itself make an existing variable `modified`.
- Keep state-variable names unique within their class.

## Relationships

- Preserve actual intermediate participants in dataflow and use separate relationships for request and response paths.
- Add state relationships for all state variables read or written by Implementation Dataflow, including cross-class access.
- Use `composition` only for class ownership, including child-object references excluded from `stateVariables`.
- Explain ordering and state transitions in the narrative; relationships do not represent execution sequence.

## Validation

For each unchanged entry and relationship, identify the numbered User Flow Step it implements or the steps it connects; omit it if neither applies. Relevance to design investigation, execution in the same workflow, or downstream carriage of the feature's data does not satisfy this check. Verify that every User Flow Step remains traceable through its unchanged participants. Preserve all required changes regardless of diagram size.
