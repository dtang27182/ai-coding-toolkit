# Dataflow Narrative Descriptions

## Purpose

Give every dataflow and state-update relationship in an Architecture Diff a written explanation of what data moves and why it is needed, and show that explanation when the reader hovers the edge in the visualizer.

Today an edge carries only a short `label` ("file contents"). A reader cannot tell what that data actually contains, or what would break without the edge. The narrative holds that knowledge but discards it on the way into the diagram.

## Shape

### Relationship fields

`label` is **removed**. Every `dataflow` and `state-update` relationship instead requires two fields:

- `dataDescription` — what data is transferred, read, or modified. For a state update, this names the instance variable being written and describes the update, which is what the old `label` rule required.
- `purpose` — why the relationship is needed. On a user-flow edge this explains its role in the flow and may name a step in prose; on a supporting edge it explains why the edge exists at all.

Both are required regardless of `userFlow`, so a supporting edge is still explained rather than left unaccounted for.

```json
{
  "from": { "class": "ChangeService", "method": "buildChangeSet" },
  "to": { "component": "Change Panel" },
  "type": "dataflow",
  "dataDescription": "The computed change set: one entry per file with its diff hunks and a summary count.",
  "purpose": "Delivers the result the user asked for in step 1 — until it arrives the panel still shows the pre-request state.",
  "changeType": "added",
  "userFlow": true
}
```

```json
{
  "from": { "class": "ChangeService", "method": "buildChangeSet" },
  "to": { "class": "ChangeModel" },
  "type": "state-update",
  "dataDescription": "Writes the computed change set into `changes`, replacing any set held from an earlier request.",
  "purpose": "Retains the result so it can be re-read without recomputing or re-reading the files.",
  "changeType": "added",
  "userFlow": true
}
```

Two fields rather than one combined description: asking for "what data *and* why it matters" in a single string is the same double-ask that strains the labeling pass. Two named fields split it at the point of writing, and the hover card renders them as a what and a why.

Composition relationships take neither field.

### User flows

Add `userFlows` at the top level, mirroring the narrative's User Flow Steps section, which now allows more than one flow:

```json
"userFlows": [
  {
    "name": "Import a workbook",
    "steps": [
      { "id": 1, "text": "The user picks a workbook and starts the import." },
      { "id": 2, "text": "The app proposes a column mapping." }
    ]
  },
  { "name": "Re-map a saved import", "steps": [] }
]
```

Step ids run 1..n within each flow. Branches and loops stay in the step text — there is no graph structure here, because nothing consumes one yet. References from `purpose` are prose, not structured links; a structured link can be added when the visualizer gains step support.

### Explicitly out of scope

Not part of this change: relationship ids, ordered hop paths, a step panel, numbered badges on the canvas, and any change to filtering. `userFlow` and `hasUserFlowState` keep their current meaning and their current owner.

## Authoring passes

`instructions/hld-user-flow.md` is **not modified**. It keeps its single job of setting `userFlow` and `hasUserFlowState`. Asking it to also write narrative text is what this plan avoids.

| Pass | File | Writes |
| --- | --- | --- |
| Generation | `instructions/hld-architecture-diff.md` | The diagram only. Loses its two `label` rules; gains nothing |
| Labeling | `instructions/hld-user-flow.md` | unchanged |
| Narrative | `instructions/hld-dataflow-narrative.md` (new) | `userFlows`, plus `dataDescription` and `purpose` on every dataflow and state-update edge |

The narrative pass is a **separate step at the end of `instructions/generate-hld.md`**, after labeling. `hld-architecture-diff.md` must not mention `userFlows`, `dataDescription`, or `purpose` at all; writing the diagram and explaining it stay separate jobs.

One pass owns everything drawn from the narrative's User Flow Steps section: transcribing the flows and referencing them from `purpose`. It reads that section closely either way, and running after labeling means the `userFlow` labels already exist, so it knows which edges are on a flow before it explains them.

## Visualizer

Hover only. No step UI.

- **Hit areas.** Edges are 1.6px strokes and are effectively unhoverable. Each edge needs a transparent companion path roughly 12px wide with `pointer-events: stroke`.
- **Tooltip.** A custom HTML card that follows the pointer and shows both sentences. Not SVG `<title>`: the native delay and lack of wrapping make two sentences unreadable.
- **Collapsed methods.** `mergeClassDataflows` collapses several dataflows into one line. The card stacks every merged relationship's description rather than showing only the first.
- **No regressions.** Right-drag panning and wheel zoom on the canvas must keep working.
- **Inspector rows.** Render both sentences in the existing flow rows. Near-free, and it makes the text reachable without hunting for a thin line.

Removing `label` has two render sites to update, both currently falling back to it: the flow rows at `visualizer/src/main.ts:354` and the overview state-update rows near `visualizer/src/main.ts:402`.

## Implementation order

1. Schema v8: add `dataDescription` and `purpose`, remove `label` and its state-update description override.
2. `references/architecture-diff.example.json`.
3. `scripts/validate-architecture-diff.mjs`: required fields, step ids contiguous within each flow, unique flow names — with negative tests for each.
4. Instructions: drop the two `label` rules from `hld-architecture-diff.md`, folding "name the instance variable" into the state-update guidance; write `hld-dataflow-narrative.md` covering `userFlows` and both description fields; add the final step to `generate-hld.md`.
5. Migrate `visualizer/workbook-import-hld.architecture-diff.json`.
6. Visualizer: types, then the two label render sites, then hit areas, then the tooltip.
7. Verify: validator, typecheck, build, and a headless browser pass over the hover behavior.

## Decisions

- Supporting (`userFlow: false`) edges require both fields. Everything in the diff is in core scope, so an edge that is not on a flow still has to say why it is there.
- Two fields, not one combined description.
- `purpose` replaces the earlier `userFlowRelevance` so one field covers both user-flow and supporting edges.
- The hover card stacks all descriptions when methods are hidden.
- The narrative pass transcribes `userFlows` as well, so one pass owns everything taken from the User Flow Steps section and the diagram pass keeps a single job.
