# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

Cover the complete core logic and end-to-end dataflow defined in `hld-narrative.md`: user action, processing, system state changes, I/O requests and results, and data display and UI updates. Include existing state and I/O touched by the new flow. Adjustments to existing classes, persistent state, methods, and dataflows that might interfere with or be disrupted by it can remain for later low level design, as defined in `hld-narrative.md`.

- Include every class and method touched by that flow, including unchanged methods in changed or unchanged classes. Include every added, modified, or deleted class and method required to implement the behavior.
- Include `components` for the UI surfaces the user interacts with (`type: "ui"`) and external I/O endpoints (`type: "external-io"`), such as network services, files, and local or session storage. Each component has a `name`, `type`, and `changeType`. Use `[]` when none participate.
- Components represent interaction endpoints. Keep their implementation classes and methods in `classes`, including UI handlers and I/O adapters, with variable exposure on those classes.
- Use unique names across classes and components. Relationship `from` and `to` values refer to these names directly.
- Use `unchanged` for classes, methods, components, and relationships reused without modification; participation in the flow alone does not make them modified. An added connection to an existing endpoint does not by itself change that endpoint. Omit unrelated context.
- Include directed dataflow relationships between the involved classes and components. Draw user input from UI components toward handling classes and display updates toward UI components. Draw I/O requests toward external endpoints and results toward consuming classes. Represent each direction separately when both occur. Label relationships with the data passed and relevant operations; describe method-level sequencing, state ownership and updates, and I/O details in the narrative.
- For composition relationships, place the owner in `from` and the component in `to`.
- Ground every entry in the feature context, narrative, or current code.

Components do not count as classes or carry variable exposure; their changed dataflow relationships count under the existing rubric. The Mermaid preview places these endpoints outside the class change scope and colors them by `changeType`.

After completing these design entries, use the changed classes and methods to populate `variableExposure` as described in `hld-variable-exposure.md`. Then validate the JSON and write its exposure counts:

```sh
node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>
```
