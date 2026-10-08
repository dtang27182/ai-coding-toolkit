---
name: hld-gen
description: Generate one high-level design for requested behavior, guided by qualitative design quality criteria.
---

# Design Generation

Generate one design that implements the requested behavior, guided by `hld-quality.md`. Preserve explicit requirements, existing behavior, and clear responsibilities.

The design is described by a High Level Design document (`hld-doc`) using the `.hld.md` extension.

## Workflow

Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root, for all generated artifacts. Choose one stable kebab-case feature slug (`<feature>`) for the run. Write all artifacts directly in `<outputDirectory>/<feature>/`.

1. Create `<outputDirectory>/<feature>/<feature>.hld.md` from `ai-coding-toolkit/hld-gen-new/generate/hld-doc-template.md`, substituting `<feature>` in the title and paths. Replace `<high level requirements section>` with the contents of `ai-coding-toolkit/hld-gen-new/define/high-level-requirements-template.md`. Draft only `Design Guidelines` from the initial user request.
   - Use concise bullets to set the detail level for requirements, user journeys, and design, distinguish what belongs in `High Level Requirements` versus `Detailed Requirements`, and list exclusions. Exclude error handling paths unless explicitly requested.
   - Proceed without confirmation when the request is sufficient. Otherwise, present the proposed guidelines, explain the uncertainty, and ask the user to confirm or revise them. Wait for confirmation or enough information to revise the guidelines before filling other sections.
2. Use `ai-coding-toolkit/hld-gen-new/define/define-behavior-and-scope.md` to fill `High Level Requirements` and `Clarification Questions` in the HLD and write `<outputDirectory>/<feature>/<feature>.detailed-requirements.md`. Link to that file from the HLD's `Detailed Requirements` section.
   - Ask the user every recorded clarification question. After each response, update `High Level Requirements` and the Detailed Requirements file as needed, remove each answered question, and record any necessary follow-up questions.
   - Present the high-level and detailed requirements to the user for review, including all three `High Level Requirements` subsections. Continue until `Clarification Questions` is `None` and the user explicitly approves the updated requirements. Do not proceed to step 3 before both conditions are met.
3. Follow `ai-coding-toolkit/hld-gen-new/generate/gen-hld.md` to complete the HLD, generate and validate its System Dataflow and Implementation Dataflow artifacts, and write its manifest. Use `ai-coding-toolkit/hld-gen-new/hld-quality.md` as qualitative guidance during generation. Minimize end-state complexity, and minimize change complexity wherever doing so does not increase end-state complexity.

Generate one design without candidate comparison, quantitative quality evaluation, or an automatic improvement loop. Complete the artifact validation required by the generation instructions before handing off the design.

If information required to define or generate the design is unavailable and cannot be resolved from the request, confirmed behavior, scope, and user journeys, current code, or repository guidance, record what is missing in the HLD's `Clarification Questions` if created, preserve existing artifacts, and stop with `needs-input`. If an execution failure prevents completion, report it and stop with `execution-error`.

## Human Handoff

Link the HLD, Detailed Requirements, both dataflows, and manifest that were generated. Report generation and artifact validation status, any incomplete artifacts, and the stopping reason.

Hand off the design for human review. Do not implement application code or claim human approval of the generated design as part of this workflow.
