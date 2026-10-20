# HLD Function Coverage for Enriched Patches

## Goal

Derive review-function change types from the patch and flag HLD mismatches at the function level in both review artifacts.

- Match by `(sourceFile, container name, function name)`; compare presence and change types, without semantic or relationship analysis.
- Use an optional `hld-change-mismatch` boolean on CR functions and the matching tag on enriched-patch functions, including for changed functions absent from the HLD.
- Represent expected function changes missing from the CR graph with a special function subtype.

## 1. Record source files on functions

Require `sourceFile` on function nodes in both HLD and code-review graphs.

- Use repository-relative paths with forward slashes, such as `src/services/OrderService.ts`, on each function rather than its container.
- Record intended paths for proposed functions and original paths for deleted functions; file existence is not required.
- Bump the shared schema version and update types, examples, fixtures, consumers, and both graph-generation instructions.

## 2. Compute actual function change types

The separate `enrich-diff/scripts/annotate-hld-function-coverage.mjs` script overwrites each actual review function's `changeType` using the patch, and may add generated missing-function nodes.

- Accept the HLD graph, review graph, and full-context patch as inputs, plus the existing enriched-patch update target through `--enriched-patch`.
- Reuse the JavaScript/TypeScript declaration parser, sharing helpers with the patch generator where needed; compare container names, not artifact-local IDs.
- Determine each review function's change type from the additions, deletions, and context recorded in the supplied patch:

| Change recorded in the patch                      | Change type |
| ------------------------------------------------- | ----------- |
| Introduces a new function                          | `added`     |
| Removes an entire function                         | `deleted`   |
| Changes an existing function that remains defined | `modified`  |
| Does not change the function, or omits its file   | `unchanged` |

- Classify whole functions: deleting lines inside a surviving function is a modification; renames are deletion and addition of distinct identifiers.
- Report unsupported or ambiguous identities and review functions that cannot be located in a file represented in the patch rather than guessing a status.
- In this step, change only function `changeType` fields; preserve diff-hunk references, stored hunks, and all other graph data, with function mismatch annotations added in step 3.

## 3. Compare and annotate functions in both artifacts

After computing actual change types, add `hld-change-mismatch` to mismatching function nodes in the CR implementation dataflow and corresponding function elements in the enriched patch.

- Match against every function in the selected HLD, including unchanged and initialization functions, using the same file/container/function identifier.

Compare each function's planned `changeType` in the HLD impl-dataflow (rows) with its computed `changeType` in the CR impl-dataflow (columns).

| HLD impl-dataflow `changeType` | CR: `added` | CR: `modified` | CR: `unchanged` | CR: `deleted` | Function absent from CR |
| ----------------------------- | ----------- | -------------- | --------------- | ------------- | ----------------------- |
| `added`                       | Match       | Mismatch       | Mismatch        | Mismatch      | Add missing node        |
| `modified`                    | Mismatch    | Match          | Mismatch        | Mismatch      | Add missing node        |
| `unchanged`                   | Mismatch    | Mismatch       | Match           | Mismatch      | No mismatch             |
| `deleted`                     | Mismatch    | Mismatch       | Mismatch        | Match         | Add missing node        |
| Function absent from HLD      | Mismatch    | Mismatch       | No mismatch     | Mismatch      | Not applicable          |

- Store the comparison result in the CR function's optional `hld-change-mismatch` boolean and the enriched-patch function's `tags` array, not on individual change entries or hunks.
- Use the corrected CR function `changeType` for comparison; do not recompute separate results for added and deleted lines.
- For unchanged mismatching functions absent from the enriched-patch index, flag the CR function without creating artificial patch elements.
- For an HLD function marked `added`, `modified`, or `deleted` with no matching actual CR function, add a CR node with `type: "function"`, `subtype: "missing-from-cr"`, and `"hld-change-mismatch": true`.
- Copy its identity, initialization flag, and planned `changeType` from the HLD, omitting diff-hunk references; `changeType` means the expected change for a `missing-from-cr` function.
- Reuse its CR container by name and type, or add the corresponding container if absent; assign new nodes and containers unique IDs from a monotonically increasing counter without copying HLD IDs or relationships.
- Tag a corresponding enriched-patch function element when present; otherwise the missing-function marker appears only in the CR graph.
- On reruns, exclude generated missing nodes from actual-function matching, reuse still-needed markers, and remove obsolete markers and their generated containers when empty.
- Preserve patch text, change entries, diff-hunk evidence, and unrelated tags; recompute the function-level mismatch annotations on repeat runs.

## 4. Update generation instructions

Run annotation after ordinary tagging and before final validation.

- Update `enrich-diff/instructions/generate-enriched-patch.md` after its current step 4, preserving the skill's top-level sequence.
- Pass the same review's HLD, CR graph, patch, and enriched patch to the command below.
- Run both existing artifact validators after annotation as final workflow checks.
- Update existing artifacts only; keep the shared generator and standalone advanced diff independent of HLD input.

```sh
node ai-coding-toolkit/enrich-diff/scripts/annotate-hld-function-coverage.mjs <hld-impl-dataflow-path> <cr-impl-dataflow-path> <patch-path> --enriched-patch <enriched-patch-path>
```

## 5. Update the impl-dataflow viewer

Display function mismatches and missing-function markers in the CR graph.

- Visually ndicate functions whose `hld-change-mismatch` boolean is true.
- Display `missing-from-cr` functions distinctly, treating their `changeType` as the expected change rather than an actual change.
    - These should all be layed out together to the left side of the graph
- Exclude missing-function markers from derived container statuses.

## 6. Update the enriched-patch viewer

Display function-level mismatch tags and use them when filtering changes.

- Show `hld-change-mismatch` tags on function elements.
- Apply each function's tags to its owned changes during filtering without copying tags onto change entries.

## 7. Verify behavior

Test computed statuses, mismatch rules, function-level annotations in both artifacts, and existing review workflows.

- Cover source-file validation, proposed files, duplicate names across files/containers, and differing graph IDs.
- Correct deliberately wrong review statuses and test all table combinations, including unchanged functions and deletions inside surviving functions.
- Cover renames, moves, unsupported or ambiguous declarations, and mixed-function hunks.
- Verify missing CR functions produce the special subtype only for planned changes, with valid container ownership, expected `changeType`, a mismatch boolean, and no fabricated patch evidence.
- Verify missing markers are reused or removed on reruns, appear distinctly in the graph, and annotate matching patch functions when available.
- Verify existing graph entries change only in function `changeType` and mismatch booleans, with additions/removals limited to generated missing markers and their containers; preserve all evidence, patch change entries, and unrelated tags.
- Run graph/patch validators and focused parser, annotation, and viewer tests, including function mismatch annotations in both viewers, validation errors without evidence repairs, patch filtering, and standalone advanced diff.

## Expected Result

The review graph receives corrected function change types, and both artifacts flag HLD mismatches on their function entries.

- Changed functions absent from the HLD and listed functions with conflicting statuses receive `hld-change-mismatch`.
- Expected changes absent from the CR graph appear as `missing-from-cr` function nodes carrying the planned change type.
- Matching identifiers and statuses remain unflagged even when behavior differs from the design.
