---
name: feature-redesign
description: Regenerate the design and dataflow artifacts of an existing feature HLD whose Design Guidelines and Requirements are already filled out.
---

# Regenerate a Feature Design

Start at step 3 of `feature-design`, treating the existing Design Guidelines and Requirements as confirmed inputs.

## Workflow

1. Use the HLD identified by the user or current conversation. If the target is ambiguous, ask which HLD to use before overwriting anything. Keep its existing path and feature slug; use `outputDirectory` from `ai-coding-toolkit/config.json` to locate artifacts when needed.
2. Read its Design Guidelines and High Level Requirements. Preserve these sections, the linked Detailed Requirements file, and all other content outside `Design`. Do not repeat requirements definition or approval.
3. Follow `ai-coding-toolkit/feature-design/generate/gen-design.md` to generate a fresh design from those inputs and current code. Replace all generated content in `Design`, preserving the template's subsection structure and Implementation Instructions. Overwrite the existing `<feature>.sys-dataflow.json`, `<feature>.impl-dataflow.json`, and `<feature>.hld-manifest.json` beside the HLD. Generate them even if no previous design exists. Treat prior design content and artifacts as outputs to replace, not inputs to reuse.

If required inputs are missing or unresolved, ask for the missing information and stop with `needs-input` before overwriting the design. If generation or validation fails, report `execution-error`, the reason, and which outputs were replaced or remain incomplete.

## Human Handoff

Link the HLD, Detailed Requirements, both dataflows, and manifest. Report generation and validation status. Hand off for human review; do not implement application code or claim approval of the regenerated design.
