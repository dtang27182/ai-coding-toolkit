# System Dataflow Diff Hunks Plan

## Format

- Bump `schemaVersion` to `2`.
- Add a top-level `diffHunks` registry to code-review artifacts.
- Add optional `diffHunkIds` arrays to nodes and relationships.
- Keep hunks in one registry so a hunk can support multiple graph entities without duplicating its text.

```json
{
  "diffHunks": [
    {
      "id": "hunk-1",
      "file": "src/chat.ts",
      "patch": "@@ -10,6 +10,7 @@ ..."
    }
  ],
  "nodes": [{ "name": "Selected model", "diffHunkIds": ["hunk-1"] }],
  "relationships": [{ "id": "relationship-1", "diffHunkIds": ["hunk-1"] }]
}
```

`file` is repository-relative. `patch` is the exact unified diff hunk, including its `@@` header.

## Generation

- Include only hunks referenced by a node or relationship.
- Associate a changed node with the smallest set of hunks that establish its behavior.
- Associate a changed relationship with hunks that show the data transfer.
- Allow multiple entities to reference the same hunk.
- Do not attach every hunk from a containing file or method.
- Omit hunk references from unchanged entities and high-level-design artifacts.
- Keep `algorithm` focused on describing the algorithm; use `diffHunkIds` for its implementation evidence.

## Validation

- Require unique hunk IDs.
- Require every referenced hunk to exist.
- Require every stored hunk to be referenced.
- Allow hunks and hunk references only when `stage` is `code-review`.

## Visualizer

- Add a **Relevant diff** section to the selected node or relationship's details panel.
- Show each referenced file and patch in a code block.
- Color added and removed lines without adding a diff-rendering dependency.

## Tests

- Cover valid shared references, missing references, unused hunks, and stage restrictions.
- Verify that node and relationship detail panels render their referenced hunks.
