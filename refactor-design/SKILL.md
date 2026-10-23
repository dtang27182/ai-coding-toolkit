---
name: refactor-design
description: Generate one high-level refactoring design, preserving existing behavior except for explicitly permitted changes.
---

# Refactoring Design

Generate one design that realizes the user's desired code structure and Refactoring Goal within the confirmed Scope. Preserve externally observable behavior except for changes the user explicitly permits.

The design is described by a High Level Design document (`hld-doc`) using the `.hld.md` extension.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case slug (`<feature>`) for the run. Write all artifacts directly in `<outputDirectory>/<feature>/`.

Create `<outputDirectory>/<feature>/<feature>.hld.md` from `ai-coding-toolkit/common/hld/generate/hld-doc-template.md`, substituting `<feature>` in the title and paths, and removing the `System Dataflow` subsection.

1. Follow `ai-coding-toolkit/common/hld/define/define+confirm-design-guidlines.md` to fill `Design Guidelines`.
2. Follow `ai-coding-toolkit/common/hld/define/define+confirm-requirements.md` to fill and confirm `Requirements`, using `ai-coding-toolkit/refactor-design/define/define-requirements.md` as the requirements-definition instructions.
3. Follow `ai-coding-toolkit/refactor-design/generate/gen-design.md` to fill the HLD's `Design` section, generate and validate its Implementation Dataflow artifact, and write its manifest.

If information required to define or generate the design is unavailable and cannot be resolved from the request, confirmed refactoring goals and scope, current code, or repository guidance, record what is missing in the HLD's `Clarification Questions` if created, preserve existing artifacts, and stop with `needs-input`. If an execution failure prevents completion, report it and stop with `execution-error`.

## Human Handoff

Link the HLD, Detailed Requirements, Implementation Dataflow, and manifest that were generated. Report generation and artifact validation status, any incomplete artifacts, and the stopping reason.

Hand off the design for human review. Do not implement application code or claim human approval of the generated design as part of this workflow.
