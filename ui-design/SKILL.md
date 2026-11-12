---
name: ui-design
description: Design a change to an existing UI from high level requirements and the codebase, producing before and after UI DSL, a change-annotated UI JSON, and a design document.
---

# UI Design

Use the high level requirements and the existing codebase to describe the current UI architecture, the proposed architecture, and the changes needed to reach it. Keep the design at the level of pages, elements, content state, navigation, and backend interactions.

## Workflow

Choose one stable `<feature>` slug and write these four files together: `<feature>.old.ui.dsl`, `<feature>.new.ui.dsl`, `<feature>.diff.ui.json`, and `<feature>.ui-design-doc.md`. Use the user's requested destination, or write them under `<outputDirectory>/<feature>/` with `outputDirectory` from `ai-coding-toolkit/config.json` when present and `docs/plans/features` otherwise.

1. Create `<feature>.ui-design-doc.md` from `ai-coding-toolkit/ui-design/generate/ui-design-doc-template.md`. Use `ai-coding-toolkit/ui-design/define/high-level-requirements-template.md` to populate its Requirements section with the supplied high level requirements, preserving their original meaning and wording. Inspect the relevant UI code, state, navigation, and backend interfaces before describing the baseline.
2. Link the draft design document for the user to review and obtain explicit approval of its Desired Behavior and Scope and Assumptions before drafting the UI architecture. If the user corrects the requirements, update the document and present it again. An explicit approval already given in the conversation satisfies this step.
3. Write the old DSL from current code and the new DSL for the required end state. Use the same level of detail in both. Refer to `ai-coding-toolkit/common/ui-spec/ui-root.example.ui.dsl` for syntax and `ai-coding-toolkit/common/ui-spec/ui-spec.schema.json` for the parsed JSON format.
4. Parse both DSL files with `node ai-coding-toolkit/common/ui-spec/parser/parse-spec.ts <input.ui.dsl> <output.ui.json>` into temporary JSON files. Check that navigation targets, content-state references, backend methods, and relationship endpoints resolve; parsing does not validate those references.
5. Build the diff JSON from the two parsed graphs. Use the proposed graph as the base and include old-only nodes and edges so deletions remain visible. Match nodes by their explicit IDs or keyed names, and edges by kind and endpoints. Mark every node and edge relative to the current code; classify edges independently of their endpoints. Use new properties for retained and added entries, old properties for deleted entries, and treat a rename or move as deletion plus addition when no reliable identity links the two.
6. Complete the existing design document with links to the three graph artifacts and a narrative explaining the changes shown in the diff. Preserve the approved Requirements section. Check the diff JSON against the UI spec schema and review all four artifacts for consistency.

Deliver the four artifacts for design review.
