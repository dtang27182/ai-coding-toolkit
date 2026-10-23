---
name: user-journey-dataflow
description: Trace a user journey specified in chat through the current codebase and generate a high-level System Dataflow diagram of its implemented behavior.
---

# User Journey Dataflow

## 1. Setup the outfiles

Generate one System Dataflow JSON for the user journey described in chat. Use `outputDirectory` from `ai-coding-toolkit/config.json`, resolved relative to the target repository root. Choose a short, stable kebab-case slug for the journey and write `<outputDirectory>/user-journey-dataflow/<slug>.sys-dataflow.json`. Do not create requirements, an HLD, an Implementation Dataflow, a diff, or a manifest.

## 2. Understand the sys-dataflow schema

Read `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.schema.json` and `ai-coding-toolkit/common/sys-dataflow/sys-dataflow.example.json` before writing the JSON. Use the example for structure, while representing only behavior verified in the current code.

Set `stage` to `inspect-code` and `feature` to a readable journey title. Leave out `changeType` and diff hunk fields because this diagram has no comparison baseline.

## 3. Generate the graph based off the User Journey and current code base

**The current codebase is the primary input for the graph:** derive its nodes, data transfers, processing, state, and external dependencies from the implementation you inspect. The chat journey sets the entry point, scope, and useful result; it does not establish that a behavior exists in code. Explain the current implementation rather than proposing a design.

- Treat each `then` in the user's journey as a boundary between sets of user inputs and system effects. Create one connected subgraph for each set, in journey order. Keep each set's inputs, results, and effects within its subgraph. If a later set uses data from an earlier one, show how the current code reads that data in the later subgraph.
- Use each set's stated actions, useful result, and boundary to find its entry point in code. Trace the actual path to the result and material side effects, including relevant state and external dependencies. Inspect further code wherever a transfer or responsibility is uncertain; do not infer implementation from names alone.
- Start each subgraph with its user action as `user-input`. Include other `user-input` nodes only for actions the user described in that set and `system-input` nodes only for external triggers within its boundary. End at the visible result, external output, and relevant state writes. Omit subsequent workflows and setup before the trigger.
- Represent major components directly contributing to those effects. Connect them by data transferred, not merely by call order. Include requests and responses through `external-dependency` nodes and connect state reads and static data to their consumers.
- Give each incoming dataflow a complete input for its destination's role. Add `data-processing` for meaningful transformation, combining sources, branching that changes the flow, nontrivial algorithms, or significant loops. Treat simple forwarding and request construction as relationships. One processing operation spanning several methods can be one node.
- Use concrete component, method, storage, or service locations in nodes, without source file and line locations. Describe transferred data and its purpose in each relationship. Keep the graph at a high level and omit methods that add no meaningful dataflow step.

## 4. Validate

Trace every subgraph from its trigger to a result or material effect. Check that each subgraph is connected, each relationship supplies data its consumer needs, and every element is grounded in the code and within its set of user inputs and system effects. Resolve gaps by inspecting more code and remove unnecessary elements.

Run `node ai-coding-toolkit/common/sys-dataflow/validate-sys-dataflow.mjs <output-path>` and correct every validation error. Link the JSON in the final response and mention that `npm run user-journey-dataflow-viewer` opens the newest output from this skill.
