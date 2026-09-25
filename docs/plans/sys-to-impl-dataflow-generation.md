# Derive Implementation Dataflow from System Dataflow

## Goal

Use each candidate's validated `<feature>.system-dataflow.json` to design one Implementation Dataflow narrative, then generate `<feature>.impl-dataflow.json` from that narrative. The system graph defines the candidate's high-level paths; the narrative defines how the implementation realizes them.

## Plan

1. **Make the handoff explicit.** Update [gen-hld.md](../hld-gen-new/generate/gen-hld.md) so the validated sys-dataflow is an input to the Implementation Dataflow step. Keep the HLD's User Flows, confirmed behavior and scope, and current code as grounding sources.

2. **Frame narrative generation as a mapping task.** Rewrite the narrative instructions in [gen-impl-dataflow.md](../hld-gen-new/generate/gen-impl-dataflow.md) to trace each sys-dataflow subgraph from its input to its named outputs and state updates. Identify the UI components, classes, methods, state owners, and I/O endpoints that realize each path. Expand system-level processing and relationships into the direct implementation interactions required by the impl-dataflow schema. Include required state and static-data reads.

3. **Merge shared implementation participants.** Combine flow-specific sys-dataflow nodes into one implementation entity when they refer to the same grounded component, class, method, or state owner. Preserve each flow's distinct path. Do not invent relationships to force otherwise independent paths into a connected graph. A system node or relationship may expand into several implementation entities or relationships, and several system nodes may map to one implementation entity.

4. **Add behavior the graphs do not convey clearly.** Describe sequencing, branch conditions, and asynchronous requests and results in the narrative where they affect the design. Map mutable instance state to owning classes and state variables. Represent external storage through the appropriate I/O endpoint and handling methods. Describe static data in the narrative without inventing an impl-dataflow entity that the schema does not support.

5. **Generate JSON from the finished narrative.** Keep the narrative authoritative for `<feature>.impl-dataflow.json`. Encode the documented classes, methods, components, state variables, direct `dataflow`, `state-read`, `state-update`, and composition relationships, along with `userFlows`, `userFlow`, and `changeType` values under the existing schema.

6. **Check traceability and validate.** Verify that every sys-dataflow path to a named effect has an implementation path, and that every impl-dataflow entry is grounded in the narrative and the current code or proposed design. Trace user-flow participants to the relevant numbered steps. Reconcile gaps in the system graph and narrative before evaluation. Run the existing impl-dataflow validation and counting scripts.

## Trial

Apply the revised instructions to a candidate with multiple User Flows, shared state, and an external dependency. Check that shared implementation entities appear once, each flow retains its required path and sequencing, and both JSON artifacts validate.
