# HLD Function Coverage for Enriched Patches

## Goal

Derive review-function change types from the patch and flag HLD mismatches at the function level in both review artifacts.

- Match by `(sourceFile, container name, function name)`; compare presence and change types, without semantic or relationship analysis.
- Use one tag, `hld-change-mismatch`, including for changed functions absent from the HLD.
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
- In this step, change only function `changeType` fields; preserve diff-hunk references, stored hunks, and all other graph data, with function tags added in step 3.

## 3. Compare and annotate functions in both artifacts

After computing actual change types, add `hld-change-mismatch` to mismatching function nodes in the CR implementation dataflow and corresponding function elements in the enriched patch.

- Match against every function in the selected HLD, including unchanged and initialization functions, using the same file/container/function identifier.

Compare each function's planned `changeType` in the HLD impl-dataflow (rows) with its computed `changeType` in the CR impl-dataflow (columns).

| HLD impl-dataflow `changeType` | CR: `added` | CR: `modified` | CR: `unchanged` | CR: `deleted` | Function absent from CR |
| ----------------------------- | ----------- | -------------- | --------------- | ------------- | ----------------------- |
| `added`                       | Match       | Mismatch       | Mismatch        | Mismatch      | Add missing node        |
| `modified`                    | Mismatch    | Match          | Mismatch        | Mismatch      | Add missing node        |
| `unchanged`                   | Mismatch    | Mismatch       | Match           | Mismatch      | No tag                  |
| `deleted`                     | Mismatch    | Mismatch       | Mismatch        | Match         | Add missing node        |
| Function absent from HLD      | Mismatch    | Mismatch       | No tag          | Mismatch      | Not applicable          |

- Store the tag in the CR function node's `tags` array and the enriched-patch function element's `tags` array, not on individual change entries or hunks.
- Use the corrected CR function `changeType` for comparison; do not recompute separate results for added and deleted lines.
- For unchanged mismatching functions absent from the enriched-patch index, tag the CR function without creating artificial patch elements.
- For an HLD function marked `added`, `modified`, or `deleted` with no matching actual CR function, add a CR node with `type: "function"`, `subtype: "missing-from-cr"`, and `tags: ["hld-change-mismatch"]`.
- Copy its function identity and initialization flag from the HLD, record the planned status as `expectedChangeType`, and omit actual `changeType` and diff-hunk references: the node indicates missing CR coverage, not proof that the code was unchanged.
- Reuse its CR container by name and type, or add the corresponding container if absent; assign new nodes and containers unique IDs from a monotonically increasing counter without copying HLD IDs or relationships.
- Tag a corresponding enriched-patch function element when present; otherwise the missing-function marker appears only in the CR graph.
- On reruns, exclude generated missing nodes from actual-function matching, reuse still-needed markers, and remove obsolete markers and their generated containers when empty.
- Preserve patch text, change entries, diff-hunk evidence, and unrelated tags; recompute only the function-level mismatch tag on repeat runs.

## 4. Integrate generation and display

Run annotation after ordinary tagging, validate both artifacts, and display function-level mismatch tags in both viewers.

- Add optional function-level `tags` supporting `hld-change-mismatch` to CR function nodes and enriched-patch function elements in their schemas and shared types.
- Define `missing-from-cr` as a code-review-only function subtype requiring `expectedChangeType` instead of actual `changeType` and diff-hunk evidence; display it as an expected change missing from the CR graph and exclude it from actual change counts and derived container statuses.
- Display the tag on functions in both viewers and let enriched-patch filtering apply a function's tag to its owned changes without duplicating tags onto change entries.
- Keep the skill's top-level sequence unchanged: inside its third review-artifact step, update `enrich-diff/instructions/generate-enriched-patch.md` to run annotation after current step 4 (ordinary tagging) and before final validation.
- Document in `common/impl-dataflow/impl-dataflow.schema.json` that CR function `changeType` values are initially generated and then mechanically recomputed from the patch by the annotation script, which also assigns `hld-change-mismatch`.
- Document in `common/enriched-patch/enriched-patch.schema.json` that function-level `hld-change-mismatch` tags are assigned by the annotation script; keep these ownership rules in schema descriptions rather than generation or tagging instructions.
- Pass the HLD, CR impl-dataflow, patch, and enriched patch belonging to the same review.
- Validate both updated artifacts before writing either, then run both existing validators as final workflow checks.
- If corrected statuses conflict with existing graph evidence rules, report the validation error rather than modifying evidence to repair it.
- Keep the shared patch generator and standalone advanced diff independent of HLD input; store results in existing artifacts without extra trace files or graph snapshots.

```sh
node ai-coding-toolkit/enrich-diff/scripts/annotate-hld-function-coverage.mjs <hld-impl-dataflow-path> <cr-impl-dataflow-path> <patch-path> --enriched-patch <enriched-patch-path>
```

## 5. Verify behavior

Test computed statuses, mismatch rules, function-level annotations in both artifacts, and existing review workflows.

- Cover source-file validation, proposed files, duplicate names across files/containers, and differing graph IDs.
- Correct deliberately wrong review statuses and test all table combinations, including unchanged functions and deletions inside surviving functions.
- Cover renames, moves, unsupported or ambiguous declarations, and mixed-function hunks.
- Verify missing CR functions produce the special subtype only for planned changes, with valid container ownership, expected status, mismatch tags, and no fabricated patch evidence.
- Verify missing markers are reused or removed on reruns, appear distinctly in the graph, and annotate matching patch functions when available.
- Verify existing graph entries change only in function `changeType` and mismatch tags, with additions/removals limited to generated missing markers and their containers; preserve all evidence, patch change entries, and unrelated tags.
- Run graph/patch validators and focused parser, annotation, and viewer tests, including function tags in both viewers, validation errors without evidence repairs, patch filtering, and standalone advanced diff.

## Expected Result

The review graph receives corrected function change types, and both artifacts flag HLD mismatches on their function entries.

- Changed functions absent from the HLD and listed functions with conflicting statuses receive `hld-change-mismatch`.
- Expected changes absent from the CR graph appear as `missing-from-cr` function nodes carrying the planned change type.
- Matching identifiers and statuses remain untagged even when behavior differs from the design.
