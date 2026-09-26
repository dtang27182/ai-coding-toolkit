# Generate Enriched Patch Plan

Generate a self-contained `enriched-patch.json` from a standard full-context Git patch as the sole input. The JSON embeds the exact patch text alongside its element index.

## Generation

1. Parse the patch into file sections and diff rows with old and new source-line numbers.
2. Reconstruct each text file's complete old and new source images from its full-context diff.
3. Create a file element for each file section, using the new path or the old path for a deleted file.
4. Parse both source images to locate classes, class methods, and top-level functions. Represent top-level functions as methods whose parent is the file. Initially support JavaScript, JSX, TypeScript, and TSX with the TypeScript compiler API.
5. Match declarations across the old and new images by their file and structural identity. Do not infer a match when it is ambiguous.
6. Include declarations whose old or new ranges contain changed lines, plus any parent class required by an included method.
7. Assign each changed line to its innermost indexed method or class. Group remaining changed lines into file locations so every change is represented in the index.
8. Store inclusive old and new line ranges, using `null` when a location exists on only one side.
9. Assign monotonically increasing IDs in patch-file and source order, with parents before children.
10. Embed the exact patch text, validate the index against `common/enriched-patch/enriched-patch.schema.json`, and write it beside the source patch.

## Hierarchy

- Files have no `parentId`.
- A class's parent is its file.
- A method's parent is its class, or its file when it has no containing class.
- Directories are derived from file paths and are not stored in the index.

## Validation

In addition to JSON Schema validation, verify that parents exist and form a valid acyclic hierarchy, located files exist in the patch, ranges are ordered and in bounds, and every changed text line is covered by a method, class, or fallback file location.

Unsupported or ambiguous text files receive file elements whose locations capture their changes. Binary files receive file elements with empty locations. The visualizer always renders the complete selected file section and uses class and method locations only as scroll targets.
