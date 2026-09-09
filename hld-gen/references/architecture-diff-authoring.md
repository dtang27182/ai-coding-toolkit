# Architecture Diff Authoring

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

- Set `stage` to `high level design`.
- Include added or modified classes and the unchanged context classes needed to show their interactions.
- List only added or modified public methods.
- Use declared class names as relationship endpoints.
- Use only `dataflow` and `composition` relationships.
- Direct composition relationships from the parent or owner in `from` to the child or component in `to`.
- Set `coreChange` only where the central feature logic resides.
- Mark every class and changed public method that owns part of the core feature logic.
- Ground every class, method, and relationship in the feature context, narrative, or current code.
- Keep the JSON consistent with the narrative while writing both as parts of the same design.

Validate the result from the repository root:

```sh
node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <json-path>
```
