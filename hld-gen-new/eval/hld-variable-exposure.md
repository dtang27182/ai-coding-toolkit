# Variable Exposure

Variable Exposure counts the distinct existing variable declarations a change must account for. Build the inventory after completing the HLD doc and the Implementation Dataflow JSON's design entries.

## Build the Inventory

Use the Implementation Dataflow JSON's changed classes and methods as the starting scope. Interpret method-local declarations and instance state according to the target language's scoping, visibility, and inheritance rules. Exposure is determined by scope, so include eligible declarations even when the changed code does not read or write them.

For each class:

1. For every modified or deleted method, include all existing parameters and local declarations owned by that method. An added method has no existing method-local declarations.
2. If the design adds, modifies, or deletes an instance method, or changes instance state, include every existing instance variable accessible from that class, including inherited variables. For a new class, only inherited existing variables can count.
3. Create one `variableExposure` item per declaration using the Implementation Dataflow schema. Use the declaration's location in the current code as its identity, deduplicating it within the class. Repeat inherited declarations in each affected class.

Use the code before the proposed change. Count only declarations owned by affected methods or exposed as instance state; do not count new declarations or recursively inspect state reachable through a variable.

Use `[]` for unchanged context classes and after verifying that a changed class has no exposure. Use `null` for the entire class inventory when the affected scope or any declaration location remains unknown.
