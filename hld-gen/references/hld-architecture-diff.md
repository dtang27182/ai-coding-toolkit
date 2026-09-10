# HLD Architecture Diff

Use the Architecture Diff to show how the existing architecture changes to implement the HLD. Read `architecture-diff.schema.json` and `architecture-diff.example.json` in this directory before writing it.

Keep the diff at the level of core logic and interface points defined in `hld-narrative.md`; it need not enumerate detailed integration changes.

- Set `stage` to `high level design`.
- Include added, modified, or deleted classes and the unchanged context classes needed to show their interactions.
- List only added, modified, or deleted public methods.
- Use declared class names as relationship endpoints.
- Use only `dataflow` and `composition` relationships.
- Direct composition relationships from the parent or owner in `from` to the child or component in `to`.
- Include deleted relationships and keep their endpoint classes in the diff.
- Set `coreChange` only where the central feature logic resides.
- Mark every class and changed public method that owns part of the core feature logic.
- Ground every class, method, and relationship in the feature context, narrative, or current code.
- Keep the JSON consistent with the narrative while writing both as parts of the same design.

Validate the result from the repository root:

```sh
node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <json-path>
```
