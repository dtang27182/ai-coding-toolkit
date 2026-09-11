# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

## Scope

- Follow `hld-narrative.md` from user action through processing, state access, and I/O to displayed data and UI updates.
- Include only dataflow and state-update relationships directly needed by the core use cases, including relevant unchanged flows. Omit incidental interactions and unrelated state updates.
- Defer adjustments for interference with existing behavior to low level design, as defined in `hld-narrative.md`.
- Ground every entry in the feature context, narrative, or current code.

## Classes Methods and Components

- Include all required class and method changes, plus unchanged participants in the flow.
- Use `components` for UI surfaces (`ui`) and external I/O endpoints (`external-io`), such as network services, files, and browser storage. Each has `name`, `type`, and `changeType`; use `[]` when none participate.
- Keep implementation classes and methods, including UI handlers and I/O adapters, in `classes`. Variable exposure belongs to those classes.
- Mark reused entries `unchanged`. Participation or a new connection alone does not modify an endpoint.
- Keep class and component names globally unique, and method names unique within each class.

## Relationships

Every `from` and `to` reference must resolve to a listed entry:

| Endpoint  | Reference                                            |
| --------- | ---------------------------------------------------- |
| Method    | `{"class": "ClassName", "method": "methodName"}`     |
| Component | `{"component": "ComponentName"}`                     |
| Class     | `{"class": "ClassName"}`                             |

Explain sequencing and state changes in the narrative.

### Dataflow

- Connect UI components, methods, or external I/O components in the direction data travels. Classes are not endpoints.
- Route user input to handling methods, method outputs to consuming methods, display updates to UI components, I/O requests to external endpoints, and results to consuming methods.
- Use separate edges for each direction. Label the data passed and relevant operation.

### State Update

- Use `state-update` from a method to the class whose instance variable it updates, whether its own class or another.
- Require a `label` naming the variable and describing the update. State reads alone are not updates.

### Composition

- Use `composition` from the owner to the owned class or component.

## Scoring and Preview

- Score changed components separately from changed classes, and changed dataflow relationships separately from changed state-update relationships, under `hld-quality.md`.
- The preview draws individual method nodes, dataflow arrows, and dotted method-to-class state-update arrows. UI and I/O components stay outside the class change scope; composition edges are omitted.

## Validation

Populate `variableExposure` from changed classes and methods using `hld-variable-exposure.md`. Then validate the JSON and write its exposure counts:

```sh
node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>
```
