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
- `imports`: Apply to changed import declarations or module-loading expressions. In TypeScript and JavaScript, this includes `import` declarations (including `import type` and side-effect imports), `require()` calls, and dynamic `import()` expressions. Changed imported names or module paths qualify. Do not tag `export` declarations or re-exports, including `export { ... } from` and `export * from`, merely because they name a module. Changes only to uses of an imported value elsewhere do not qualify.
