---
name: feature-design
description: Generate one high-level design for requested behavior, guided by qualitative design quality criteria.
---

# Design Generation

Generate one design that implements the requested behavior. Preserve explicit requirements, existing behavior, and clear responsibilities.

The design is described by a High Level Design document (`hld-doc`) using the `.hld.md` extension.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run. Write all artifacts directly in `<outputDirectory>/<feature>/`.

Create `<outputDirectory>/<feature>/<feature>.hld.md` from `ai-coding-toolkit/feature-design/generate/hld-doc-template.md`, substituting `<feature>` in the title and paths.

1. Follow `ai-coding-toolkit/feature-design/define/define+confirm-design-guidlines.md` to fill `Design Guidelines`.
2. Follow `ai-coding-toolkit/feature-design/define/define+confirm-requirements.md` to fill and confirm `Requirements`, using `ai-coding-toolkit/feature-design/define/define-requirements.md` as the requirements-definition instructions.
3. Follow `ai-coding-toolkit/feature-design/generate/gen-design.md` to fill the HLD's `Design` section, generate and validate its System Dataflow and Implementation Dataflow artifacts, and write its manifest.

If information required to define or generate the design is unavailable and cannot be resolved from the request, confirmed behavior, scope, and user journeys, current code, or repository guidance, record what is missing in the HLD's `Clarification Questions` if created, preserve existing artifacts, and stop with `needs-input`. If an execution failure prevents completion, report it and stop with `execution-error`.

## Human Handoff

Link the HLD, Detailed Requirements, both dataflows, and manifest that were generated. Report generation and artifact validation status, any incomplete artifacts, and the stopping reason.

Hand off the design for human review. Do not implement application code or claim human approval of the generated design as part of this workflow.
