# Handoff: Simplified File View (code diff × architecture diff)

## What to build

This is a code-review screen that shows a normal git diff, organized by the architecture diff
(`architecture-diff.json`, **schemaVersion 9**) that the `hld-gen` / `hld-gen-new` skills produce.

- The **left nav** is a tree: directory → file → class → method / state variable / component. It is
  split into two sections:
  - **Core user flow**: lines that belong to `userFlow: true` entities.
  - **Outside core flow**: everything else.
- The **main panel** is a plain, full-file unified diff of the selected file. It has no
  core/non-core separators, no graph, and no annotations.
- **Clicking a nav row** selects it and scrolls the main panel to that entity's first line.

The reviewer can see at a glance how much of the change is on the core user flow, and can jump
straight to that code.

## What's in this bundle

| Path | What it is |
|---|---|
| `reference/simplified-file-view.html` | A working reference mockup. Open it in a browser and click `ChangeService.js`, `ChangeService`, `buildChangeSet` or `configure` in the nav. All data is hard-coded, so treat it as a visual and behavioral spec, not code to copy. |
| `reference/01-default-buildChangeSet-selected.png` | The initial state. |
| `reference/02-after-clicking-configure.png` | The state after clicking `configure`. |
| `sample-data/architecture-diff.example.json` | A copy of `hld-gen/references/architecture-diff.example.json` (schema v9). |
| `sample-data/ChangeService.js.full-context.diff` | A full-context git diff of the file shown in the mockup. |

**Placeholder numbers:** only `src/ChangeService.js` has real sample content. The mockup's other
nav rows and its totals are placeholders (e.g. "8 files" when 7 are listed). Compute every number
from the data.

**Mockup vs. example JSON:**

- The mockup predates schema v9. Under v9, `ChangeModel` should show a `◈ changes` state-variable
  row and a `currentChanges` method row.
- The sample diff treats `ChangeService.js` as an existing file with new methods, while the example
  JSON marks the class `added`. Take added/deleted/modified lines from the git diff, never from
  `changeType`.

## Where it lives

The repo has two visualizers with an identical schema: `hld-gen/visualizer` and
`hld-gen-new/visualizer`. Both are vanilla TypeScript + Vite, with `types.ts` already modeling the
schema. **Ask the user which one gets this view** (or whether it should be a new package). Reuse:

- the schema types (`src/types.ts`) and validation (`src/validation.ts`);
- the design tokens in `src/styles.css` `:root`;
- the dev-server middleware pattern in `vite.config.mjs`, which already serves the newest
  architecture diff at `/__architecture-diff/default`. Add a sibling endpoint that returns the git
  diff (see Inputs).

## Inputs

1. **The architecture diff JSON**, schema v9 (`hld-gen/references/architecture-diff.schema.json`).
   It is used for entity names, `userFlow` flags and `changeType`.
2. **A git diff with full file context**, so the main panel can show whole files:
   `git diff --unified=1000000 <base>...<head>` (or `git diff -U1000000 <base>` against the working
   tree). The base ref should be configurable. You need both the pre-image and the post-image of
   each file: the post-image to locate added and modified entities, and the pre-image to locate
   deleted ones.

### The key gap: the JSON has no source locations

Schema v9 names classes, methods, state variables and components, but gives **no file paths or line
ranges** for them. The only location data is `variableExposure[].declaredAt.file`, which is a
useful hint for which file a class is in. The implementation must therefore **locate entities in
source itself**:

1. For every file in the git diff, parse the post-image (and the pre-image, for deleted entities)
   and record the line span of each class declaration, each method inside it, and each state
   variable (instance field / `this.x` assignment) declaration.
   - Start with JS/TS using the TypeScript compiler API. `typescript` is already a devDependency.
   - Keep the locator pluggable per language.
2. Match those declarations to JSON entities by class name + method name, and class name +
   state-variable name.
3. Match components (`ui` / `external-io`) with a best-effort name heuristic, e.g. `Change Panel`
   → a `ChangePanel` export or a `ChangePanel.jsx` file. If nothing matches, the component simply
   has no lines.
4. Anything that can't be matched is **unmapped** (see below). Never guess silently.

## Attributing changed lines

For each `+` / `−` line in the diff, pick the innermost matching span. Use the new-file line number
for `+` lines and the old-file line number for `−` lines.

| Line falls in… | Attributed to | Section |
|---|---|---|
| a method's span | that method | Core if `method.userFlow`, else Outside |
| a state-variable declaration | that state variable | Core if `stateVariable.userFlow`, else Outside |
| a component's matched span | that component | Core if `component.userFlow`, else Outside |
| a class, but none of the above | the class itself ("class-level lines") | Core if the class has any `userFlow` state variable, else Outside |
| no located entity | the file ("unmapped") | Outside, with the note `no entity` |

A line count is the number of `+` lines plus the number of `−` lines.

## Left nav (330px wide, `--header` background, right border `--border`)

**Summary block (top):**

- Title: "N changed lines", followed by dim text "F files · E entities".
- An 8px stacked bar split between core (`--accent`) and outside (neutral grey), with a 2px gap.
- The line "Core flow 154 · Outside 117 · of which unmapped 103" (the unmapped count uses the
  `--modified` color).

**Two sections:** "CORE USER FLOW" first, then "OUTSIDE CORE FLOW". Each section header shows a
colored square, a mono uppercase label, the section's line total, the "lines · %" of the whole, and
a one-line dim subtitle.

**Tree inside each section:** dir → file → class → (method | state variable | component).

- A file appears in **both** sections if it has lines in both. Each section lists only that
  section's entities and counts only that section's lines.
- Components that aren't inside a class sit directly under their file.
- Sort rows by path, then by position in the file.

**Rows:**

- Height 26px, with 14px of indent per level and 1px vertical guide lines per level.
- Each row has a chevron (dirs, files and classes), a 14px icon, the name, an optional note, and
  right-aligned counts: `+N` in `--added` and `−N` in `--deleted`, with zero counts omitted.
- Icons: dir = folder outline; file = page outline; class = dashed rounded rect colored by
  `changeType`; method = small pill with a colored left rail; ui component = card with a top rail;
  unmapped file = dashed page in `--modified`. The reference HTML has exact SVGs for each.
- Names are mono 11.5px; class names are 600 weight.
- Notes:
  - `supporting` on non-userFlow methods in the Outside section;
  - `◈ <name>` for a userFlow state variable (or render it as its own leaf row);
  - `deleted` on deleted files;
  - `no entity` on unmapped files.
- **Selected row:** background `oklch(0.262 0.045 255)`, plus `box-shadow: inset 2px 0 0
  var(--accent)`.
- Dirs collapse and expand; clicking a dir selects nothing.

## Main panel: full-file diff

- **File bar:** background `oklch(0.228 0.024 255)` with a bottom border. It shows the file icon,
  the full repo-relative path (mono 12.5px), and the whole file's `+N` / `−N` at the right.
- **Body:** the entire file in one continuous unified diff. There are no hunk headers, no collapsed
  regions, no per-method cards, no dataflow tags, and no core/non-core divider. The body scrolls
  vertically, and horizontally for long lines (no wrapping).
- **Each line:** old line number (44px, right-aligned) | new line number (44px) | marker (18px:
  `+`, `−` or blank) | code.
  - Mono 12px; row min-height 21px.
  - Line numbers use `oklch(0.52 0.02 250)`.
  - Added rows: background `--added` at 10% alpha, `+` in `--added`.
  - Removed rows: background `--deleted` at 11% alpha, `−` in `--deleted`.
  - Context rows: transparent.
  - Removed lines have no new number; added lines have no old number.
- **Deleted file:** the whole old file as `−` lines. **Added file:** the whole new file as `+`
  lines.
- **Binary or huge files:** show a one-line placeholder.

## Behavior

- **Clicking a nav row:**
  - A method, state variable, component or class makes it the selection, opens its file in the
    main panel if it isn't open already, and smooth-scrolls so the entity's first line sits 12px
    below the top of the panel.
  - A file opens it and scrolls to the top.
  - An unmapped file opens it at the top.
- **Initial state:** the first row of the Core section that isn't a dir, scrolled into place with
  no animation.
- **Selection persistence:** keep the selection in the URL (hash or query), so a reload restores
  it.
- **Keyboard:** nice to have. ↑/↓ moves through rows, Enter selects.

## Header

- **Height:** about 60px plus the legend row. Background `--header`, bottom border `--border`,
  padding 10px 20px.
- **Row 1:**
  - the title "Code Diff · <branch>" (15px, 600 weight);
  - a chip reading "FILE STRUCTURE" (mono 10px uppercase, background `oklch(0.295 0.060 255)`, text
    `--accent`).
- **Row 2:** the status legend, matching the existing arch-diff viewer's top bar: four items,
  each a 3×12px bar in the status color plus an 11px `--muted` label (added, modified, deleted,
  unchanged), with a 16px gap.
- **Removed from this view:** the Core / Outside / All filter.

## Tokens

Use the variables in `styles.css` `:root`: `--surface` (page background), `--header`, `--raised`,
`--border`, `--subtle-border`, `--muted`, `--bright`, `--added`, `--modified`, `--deleted`,
`--unchanged`, `--accent`.

This view also uses:

- ink `oklch(0.938 0.010 250)`
- dim text `oklch(0.62 0.020 250)`
- panel `oklch(0.228 0.024 255)`
- selection background `oklch(0.262 0.045 255)`

Fonts are IBM Plex Sans (UI) and IBM Plex Mono (code, paths, counts), already imported by
`styles.css`.

## Out of scope for this view

- The architecture graph, and the right-hand graph context panel.
- Inline dataflow annotations on code lines.
- The core/outside filter.
- Commenting and editing.
- The separate "Flow view" (graph → code) design on the same canvas.

## Acceptance checks

1. With the sample JSON and a diff containing `src/ChangeService.js`:
   - `buildChangeSet` appears under Core with its lines;
   - `configure` appears under Outside with the note `supporting`;
   - `ChangeService.js` appears in both sections.
2. Clicking `configure` scrolls the panel so `configure(settings) {` is at the top. Clicking
   `buildChangeSet` scrolls to `async buildChangeSet(...)`.
3. Section totals add up to the grand total. Every changed line is counted exactly once.
4. A file with no located entities appears only under Outside, marked `no entity`, and still
   opens and renders in full.
5. The main panel never shows a core/outside divider, hunk headers or collapsed context.
