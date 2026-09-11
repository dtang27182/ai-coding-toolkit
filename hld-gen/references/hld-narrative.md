# HLD Narrative

An HLD sketches the core logic and dataflow needed to implement new or changed behavior for the core use cases. It shows where that logic fits in the existing code and architecture, where data enters and leaves it, and how newly introduced state interacts with existing components.

Keep the narrative concise and easy to scan. Write each section mostly as short bullet points, with one idea per bullet. Use at most one or two brief sentences per section when they help introduce or connect the points. Avoid repeating information across sections.

Leave detailed error handling, edge cases, implementation changes, and adjustments to existing logic and dataflow for later design work. Describe integration at the level of responsibilities and touch points.

Use the following six sections in order:

## Desired Behavior

Use bullets for the intended outcomes and core use cases.

## Scope and Assumptions

Use bullets for included and excluded scope, explicit constraints, and working assumptions.

## Core Logic and Dataflow

Begin with a brief paragraph explaining the overall approach and how the dataflow fits together. Then use bullets or a short numbered list for the processing steps, inputs, persistent state updates, and outputs.

## Touch Points

Use brief prose to group related changed classes, methods, or components and describe each group at a higher level. Under each group, use concise bullets for the individual touch points, responsibilities, and relevant inputs and outputs.

## Variable Exposure

Follow `hld-variable-exposure.md`. Use brief bullets to summarize the existing state that constrains each changed class. Keep individual declarations in the Architecture Diff.

## Open Questions

Use one bullet per unresolved question affecting behavior, scope, logic, dataflow, or architectural fit. Write `None` when there are no questions.
