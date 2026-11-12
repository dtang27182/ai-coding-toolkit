# UI Design Skill Reformulation Plan

## Phase 1: Update the UI spec

- Update `common/ui-spec/ui-spec.schema.json` to represent the relationships that the viewer currently derives: navigation, backend calls, arguments, returns, and content-state reads and writes.
- Add `changeType` to nodes and relationships so the JSON format can describe added, modified, deleted, and unchanged parts of a UI design.
- Move deterministic relationship generation out of the viewer and into the DSL-to-JSON path. Keep display-specific routing and edge merging in the viewer.
- Update the parser, viewer, example files, and focused tests to use the explicit relationships.

**Result:** Converting a `.ui.dsl` file produces JSON with explicit relationships, and the viewer reads those relationships instead of generating them.

## Phase 2: Define the design artifacts

- Create a high level requirements template based on `common/hld/define/high-level-requirements-template.md`, omitting the User Journeys section.
- Create a `ui-design-doc` template based on `common/hld/generate/hld-doc-template.md`. It should contain the original high level requirements, links to `<feature>.old.ui.dsl`, `<feature>.new.ui.dsl`, and `<feature>.diff.ui.json`, and a design narrative that explains the changes represented in the diff.

**Result:** Both document templates are ready for the skill to use.

## Phase 3: Create the basic new skill

- Replace the app-building workflow in `ui-design/SKILL.md` with a design workflow that takes the high level requirements and existing codebase as inputs.
- Have the skill describe the current high level UI architecture in `<feature>.old.ui.dsl` and the proposed architecture in `<feature>.new.ui.dsl`.
- Have the skill produce `<feature>.diff.ui.json`, setting `changeType` on its nodes and relationships relative to the current code. Classify relationships independently of their endpoint nodes.
- Have the skill produce the UI design document from the Phase 2 template, including the original requirements, artifact links, and a narrative that gives context to the diff.

**Result:** The skill produces all four requested artifacts in one end-to-end run.

## Phase 4: Refine the skill

- Run the skill on representative changes to an existing UI and review all four artifacts together.
- Refine the instructions where those runs reveal ambiguous architecture, missed code paths, inaccurate change types, or a narrative that does not explain the diff.
- Update supporting guidance and tests where the trials show a concrete need.

**Result:** The workflow produces useful, internally consistent designs across more than the first example.
