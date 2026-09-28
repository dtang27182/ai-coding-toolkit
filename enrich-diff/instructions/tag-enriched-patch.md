# Tag Enriched Patch Changes

Use the Enriched Patch generated in the preceding step.

1. Use only tag values permitted by `ai-coding-toolkit/common/enriched-patch/enriched-patch.schema.json`, under `$defs.change.properties.tags.items.oneOf`.
2. Inspect each entry in every element's `changes` list against the embedded patch. Read its old lines for deletions, new lines for additions, and nearby context to understand the change's purpose.
3. Fill each change's `tags` array with every applicable tag. Use `[]` when none applies. Classify each change independently; do not assign tags to an entire element because another change in that element has the same purpose. Consider the changed content and the file's role, not its path alone.
4. Preserve the embedded patch, elements, ownership, and line ranges. Edit only the `tags` arrays. Save the Enriched Patch JSON.

## Tag Rules

- `non-code`: Apply to changed documentation, prose, static assets, or other non-executable content. Judge the changed content, including changes in files that also contain code.
- `test-code`: Apply to changed tests, assertions, mocks, test helpers, or test setup. Use the role of the changed code rather than the file name alone.
- `initialization`: Apply for explicit constructor code, one time initialization code, plumbing of callbacks, or object/dependency graph construction. Ordinary updates after initialization do not qualify.
- `data-plumbing`: Apply when the change's only purpose is to carry between parts of the system, such as forwarding arguments. A change that alters the underlying behavior beyond that transfer does not qualify solely because data passes through it. This includes, but is not limited to: 
  1. function parameter list change in a function that does not do anything with the changed parameter except passing the parameter to an nested function call 
  2. a nested function call that does not have any change except passing a modified parameter along that was also changed in the outer function parameter list
