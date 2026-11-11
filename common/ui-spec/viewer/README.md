# UI spec viewer

A browser view of a ui-spec JSON document (`../ui-spec.schema.json`). It draws content-state variables at the top, pages in the middle and backend API methods at the bottom, plus three edge layers:

- **Navigation** (rail edges): `navigate('page')` in an element's `on_click`, and a link element's `url` to an external node.
- **Dataflow** (solid, dot tail): a trigger calling a backend method, a same-page field passed as an argument, and a captured return value flowing back to the element.
- **State reads/writes** (dashed): assignments to a content-state variable in `on_click`, and `reads` / text `content` that name one.

Pages start collapsed; click a page (or its `+N` toggle) to expand just that page, and `−` to collapse it. Dataflow edges between the same two drawn nodes merge into one, as do state read/write edges, and two-way edges get a hollow back arrowhead. Navigation edges merge the same way: a two-way pair becomes one rail with arrowheads at both ends. Edges carry no labels. Every edge is drawn as a curve; when the curve would pass through another node, the edge is routed around it with rounded corners instead (`src/route.ts`). Merging is reapplied whenever a page is collapsed or expanded. Click a node to focus its edges; click empty canvas to clear. Click an edge to select it. The inspector on the right shows only spec details the graph doesn't draw: descriptions, a method's full signature, a content-state variable's full initialization, an external link's full URL, an element's full `on_click`, and both ends of the selected edge (every member edge when it is merged). Drag its left border to resize it, or collapse it to a rail. Right-drag the canvas to pan, and use the mouse wheel to zoom.

The palette follows the OS appearance the same way impl-dataflow does: dark by default, light under `prefers-color-scheme: light`.

## Run

```sh
npm run ui-spec-viewer        # dev server, opens the example spec
npm run ui-spec-viewer:build  # static build into common/ui-spec/viewer/dist
```

Load another spec with **Open spec** or by dropping a `.ui.json` file on the canvas. To view a DSL file, convert it first with `npm run parse-ui-spec`.

## Code

- `src/model.ts`: derives nodes, edges and page columns from a spec. Pure, no DOM.
- `src/edges.ts`: reroutes edges into collapsed pages and merges them. Pure, no DOM.
- `src/route.ts`: obstacle-aware edge routing. Pure, no DOM.
- `src/inspector.ts`: inspector panel markup for a selected node or edge. Pure, no DOM.
- `src/main.ts`: layout, SVG edge drawing, collapse, focus, inspector, pan and zoom.

Tests are in `scripts/ui-spec-viewer.test.ts`.
