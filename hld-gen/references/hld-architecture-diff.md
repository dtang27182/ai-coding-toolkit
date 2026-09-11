# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

Cover the complete core logic and end-to-end dataflow defined in `hld-narrative.md`: user action, processing, system state changes, I/O requests and results, and data display and UI updates. Include existing state and I/O touched by the new flow. Adjustments to existing classes, persistent state, methods, and dataflows that might interfere with or be disrupted by it can remain for later low level design, as defined in `hld-narrative.md`.

- Include every class and method touched by that flow, including unchanged methods in changed or unchanged classes. Include every added, modified, or deleted class and method required to implement the behavior.
- Use `unchanged` for classes, methods, and relationships reused without modification; participation in the flow alone does not make them modified. Omit unrelated context.
- Include dataflow relationships between the involved classes, including requests, responses, and UI update paths. Label them with the data passed and relevant operations; describe method-level sequencing, state ownership and updates, and I/O details in the narrative.
- For composition relationships, place the owner in `from` and the component in `to`.
- Ground every entry in the feature context, narrative, or current code.

After completing these design entries, use the changed classes and methods to populate `variableExposure` as described in `hld-variable-exposure.md`. Then validate the JSON and write its exposure counts:

```sh
node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>
```
