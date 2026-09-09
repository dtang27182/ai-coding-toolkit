---
name: architecture-diff-hld
description: Create an HLD architecture diff from a high-level design discussion before low-level design or code changes.
---

# HLD Architecture Diff

Create a high-level map of the proposed code changes.

## Instructions

1. Read `ai-coding-toolkit/config.json`, `ai-coding-toolkit/schemas/architecture-diff.schema.json`, and `ai-coding-toolkit/examples/architecture-diff.example.json`.
2. Use the current high-level design discussion and available repository evidence.
3. Identify a concise feature name from the discussion. Ask the user for one if the feature name is unclear.
4. Convert the feature name to kebab case for use in the output filename.
5. Resolve `outputDirectory` from the configuration relative to the repository root.
6. Write the result to `<outputDirectory>/<feature-name>.architecture-diff.hld.json`.
7. Set `stage` to `high level design`.
8. Include proposed added or modified classes plus unchanged context classes needed to show interactions with the existing system.
9. List only proposed added or modified public methods.
10. Use class names as relationship endpoints and use only `dataflow` or `composition` relationships.
11. Set `coreChange` only on classes or methods where the central feature logic resides.
12. Do not invent details unsupported by the high-level design discussion or repository.
13. Run `node ai-coding-toolkit/scripts/validate-architecture-diff.mjs <output-path>` and fix all errors.
14. Report the output path and any unresolved high-level design ambiguities.
