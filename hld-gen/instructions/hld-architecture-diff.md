# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `../references/architecture-diff.schema.json` and `../references/architecture-diff.example.json` before writing it.

## Scope

- Represent Core Logic and Dataflow, including all changes required by the User Flow Steps. Keep broader workflows in Relevant Logic and Dataflow, outside the diagram.
- Include unchanged entities and relationships only when they implement or connect User Flow Steps, preserving intermediaries, state owners, and consumers. When a step supplies data or state to existing behavior, stop where it is read and applied.
- Shared entities, state, or execution paths do not bring other methods or workflows into scope. Following calls helps locate code but does not determine inclusion.
- Defer adjustments for interference with existing behavior to low level design, as defined in `hld-narrative.md`.
- Ground every entry in the feature context, narrative, or current code.

## User Flow Classification

- Set `userFlow` explicitly on every method, component, dataflow, and state-update relationship. Use `true` when it directly contributes to a numbered User Flow Step; use `false` for required supporting work that does not itself implement a step, including dependency wiring, initialization, registration, or internal instrumentation. Do not put `userFlow` on classes or composition edges.
- Judge the responsibility against the User Flow Steps, not its name or when it runs. Loading initial content or displaying a result can directly implement a step. Shared helpers that process the flow's data remain `true`.
- Classify methods individually. Set `hasUserFlowState` explicitly on every class: `true` if it owns state directly read or updated by a User Flow Step, even without listed methods or state-update edges; otherwise `false`. Merely retaining a reference to a contributing object does not qualify. Do not infer this flag from variable exposure, which inventories existing declarations affected by changes, not all state used by the flow.
- The visualizer derives class participation from `hasUserFlowState`, any method marked `userFlow: true`, or any incoming or outgoing dataflow marked `userFlow: true`. Composition never contributes to this decision.
- Classify dataflows and state updates independently: a supporting interaction between contributing endpoints can be `false`. A relationship marked `true` must reference contributing methods and components; a user-flow state update must target a class with `hasUserFlowState: true`.
- Keep all required changes in the JSON, including entries marked `false`. This classification does not expand the scope for unchanged context. The visualizer's User flow only filter hides noncontributing classes, `false` methods/components/interactions, and relationships with hidden endpoints.
- The filter applies to the graph, inspector, and displayed metrics. Displayed variable exposure includes instance fields of visible classes and parameters and locals of visible methods, deduplicated by declaration for the total. Collapsing methods changes presentation only. Saved evaluation counts cover the full diff.

## Classes Methods and Components

- Include all required class and method changes. Apply the scope criteria separately to unchanged classes, methods within included classes, and components.
- Use `components` for UI surfaces (`ui`) and external I/O endpoints (`external-io`), such as network services, files, and browser storage. Each has `name`, `type`, `changeType`, and `userFlow`; use `[]` when none participate.
- Keep implementation classes and methods, including UI handlers and I/O adapters, in `classes`. Variable exposure belongs to those classes.
- Mark reused entries `unchanged`. Participation or a new connection alone does not modify an endpoint.
- A class with an added, modified, or deleted method must be marked changed.
- Keep class and component names globally unique, and method names unique within each class.

## Relationships

Every `from` and `to` reference must resolve to a listed entry:

| Endpoint  | Reference                                            |
| --------- | ---------------------------------------------------- |
| Method    | `{"class": "ClassName", "method": "methodName"}`     |
| Component | `{"component": "ComponentName"}`                     |
| Class     | `{"class": "ClassName"}`                             |

Explain sequencing and state changes in the narrative.
Preserve actual intermediate participants and relationships on core data flows; do not replace an unchanged path with an inferred direct edge or a prose summary.

### Dataflow

- Connect UI components, methods, or external I/O components in the direction data travels. Classes are not endpoints.
- Route user input to handling methods, method outputs to consuming methods, display updates to UI components, I/O requests to external endpoints, and results to consuming methods.
- Use separate edges for each direction. Label the data passed and relevant operation.

### State Update

- Use `state-update` from a method to the class whose instance variable it updates, whether its own class or another.
- Require a `label` naming the variable and describing the update. State reads alone are not updates.

### Composition

- Use `composition` only from an owning class to an owned class. Components and methods cannot be composition endpoints.
- Omit `userFlow`. The visualizer shows composition only when both endpoint classes are visible; composition does not keep either endpoint visible.

## Preview

- The preview draws individual method nodes, dataflow arrows, and dotted method-to-class state-update arrows. UI and I/O components stay outside the class change scope; composition edges are omitted.

## Validation

For each unchanged entry and relationship, identify the numbered User Flow Step it implements or the steps it connects; omit it if neither applies. Relevance to design investigation, execution in the same workflow, or downstream carriage of the feature's data does not satisfy this check. Verify that every User Flow Step remains traceable through its unchanged participants. Preserve all required changes regardless of diagram size.
