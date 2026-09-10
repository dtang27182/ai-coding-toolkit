# HLD Narrative

An HLD sketches the core logic and dataflow needed to implement new or changed behavior for the core use cases. It shows where that logic fits in the existing code and architecture, where data enters and leaves it, and how newly introduced state interacts with existing components.

Keep the narrative concise. Leave detailed error handling, edge cases, implementation changes, and adjustments to existing logic and dataflow for later design work. Describe integration at the level of responsibilities and interface points.

Use the following five sections in order:

## Desired Behavior

Describe the intended new or changed behavior for the core use cases.

## Scope and Assumptions

State the scope, explicit constraints, and working assumptions.

## Core Logic and Dataflow

Sketch the core processing steps and how data moves through them, including the inputs, persistent state updates, and resulting outputs.

## Interface Points

Identify where the core logic and dataflow fit in existing classes or components. Describe where input data comes from and where output data goes. For new stateful variables or components, describe who owns the state and how existing components read, update, or otherwise interact with it.

## Open Questions

List unresolved questions affecting the core behavior, logic, dataflow, or architectural fit. State when there are none.
