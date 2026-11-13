# UI spec viewer

A browser view of a ui-spec JSON document (`../ui-spec.schema.json`). The DSL parser writes state variables and relationships into that JSON; the viewer reads them and derives external display nodes from link URLs. It draws content-state variables at the top, pages in the middle and backend API methods at the bottom, plus three edge kinds:

- **Navigation** (rail edges): `navigate('page')` in an element's `on_click`, and a link element's `url` to an external node.
- **Method calls** (solid): an element invoking a backend method in `on_click`.
- **Dataflow** (solid, dot tail): values passed to or returned from backend methods, assignments to content-state variables, and state values read by elements.

Pages start collapsed; click a page (or its `+N` toggle) to expand just that page, and `−` to collapse it. Edges of the same kind between the same two drawn nodes merge into one, and two-way dataflow edges get a hollow back arrowhead. A two-way navigation pair becomes one rail with arrowheads at both ends. Edges carry no labels. Every edge is drawn as a curve; when the curve would pass through another node, the edge is routed around it with rounded corners instead (`src/route.ts`). Merging is reapplied whenever a page is collapsed or expanded. Click a node to focus its edges; click empty canvas to clear. Click an edge to select it. The inspector on the right shows only spec details the graph doesn't draw: descriptions, a method's full signature, a content-state variable's full initialization, an external link's full URL, an element's full `on_click`, and both ends of the selected edge (every member edge when it is merged). Drag its left border to resize it, or collapse it to a rail. Right-drag the canvas to pan, and use the mouse wheel to zoom.

The palette follows the OS appearance the same way impl-dataflow does: dark by default, light under `prefers-color-scheme: light`.

## Run

```sh
npm run ui-spec-viewer        # dev server, opens the newest UI design manifest when available
npm run ui-spec-viewer:build  # static build into common/ui-spec/viewer/dist
```

The dev server searches recursively under `outputDirectory` in `config.json` for `ui-design-manifest.json` and opens the newest by modification time. Its **Old UI**, **New UI**, and **Diff** tabs show the referenced files; a missing entry or missing file has no tab. If no manifest exists, the viewer opens the newest `.ui.diff.json` or `.diff.ui.json`, then the bundled example. Use **Open file** or drag and drop to open a manifest or an individual `.ui.json` or `.ui.dsl` spec. The viewer converts DSL through the existing parser when served by Vite; the static build still opens individual JSON files.

## Code

- `src/model.ts`: builds display nodes and page columns from the spec's explicit nodes and relationships. Pure, no DOM.
- `src/edges.ts`: reroutes edges into collapsed pages and merges them. Pure, no DOM.
- `src/route.ts`: obstacle-aware edge routing. Pure, no DOM.
- `src/inspector.ts`: inspector panel markup for a selected node or edge. Pure, no DOM.
- `src/main.ts`: layout, SVG edge drawing, collapse, focus, inspector, pan and zoom.

Tests are in `scripts/ui-spec-viewer.test.ts`.
