# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

Keep the diff at the level of core logic and touch points defined in `hld-narrative.md`; it need not enumerate detailed integration changes.

- Include every changed class and only the unchanged context classes needed to show its interactions.
- Include every added, modified, or deleted method.
- For composition relationships, place the owner in `from` and the component in `to`.
- Set `coreChange: true` on every class and method that owns core feature logic, and nowhere else.
- Ground every entry in the feature context, narrative, or current code.

After completing these design entries, use the changed classes and methods to populate `variableExposure` as described in `hld-variable-exposure.md`. Then validate the JSON and write its exposure counts:

```sh
node ai-coding-toolkit/hld-gen/scripts/count-variable-exposure.mjs <json-path>
```
