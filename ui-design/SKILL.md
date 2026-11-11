---
name: ui-design
description: Build a new Vite TypeScript UI from a .ui.dsl application specification when the declared backend already exists in the repository.
---

# Build a Vite app from UI DSL

Use this skill for a **new app**. Treat the `.ui.dsl` file as the source of truth for behavior and the existing backend as the implementation of its declared API.

1. Read the spec and locate the backend implementation. Run `node ai-coding-toolkit/common/ui-spec/parser/parse-spec.ts <input.ui.dsl> <output.ui.json>` and inspect the resulting JSON against `ai-coding-toolkit/common/ui-spec/ui-spec.schema.json`; the parser does not validate references. Check that page targets, content-state names, and backend calls resolve, and identify any method-name or return-shape differences before wiring the UI.
2. Create a Vite TypeScript entry point and a controller for each declared page. Use the first declared page as the initial page unless the task supplies another entry page. Initialize content state from `content_state`; keep input values, open menus, pending requests, errors, and other UI control state separate. Keep page and element IDs traceable to the spec.
3. Implement every element and `on_click` action, including nested containers, links, content reads, state writes, backend calls, and navigation. Execute statements in their written order. Await a backend operation before running the next statement when it returns a promise; update visible content after state changes so users can see intermediate results. Make `custom` elements from their doc comments and `reads` declarations.
4. Connect to the existing backend without changing its behavior. Use a small UI adapter if the implementation names or types differ from the declared interface. Follow any supplied visual mockup; otherwise make a simple, accessible layout without treating visual choices as spec behavior.
5. Run the app's type check, build, and relevant behavior tests. Verify each page is reachable, displayed content reflects state, actions call the backend in order, and navigation works. Report any spec ambiguity or backend mismatch that could not be resolved from the repository.

See `ai-coding-toolkit/common/ui-spec/ui-root.example.ui.dsl` and `ai-coding-toolkit/common/ui-spec/ui-root.example.ui.json` for the supported syntax and JSON shape. Do not assume that parsing alone generates an app.
