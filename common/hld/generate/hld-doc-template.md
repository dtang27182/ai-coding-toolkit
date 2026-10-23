# <feature> High Level Design

## Design Guidelines

- <what belongs in High Level Requirements versus Detailed Requirements>
- <general level of abstraction for the design>

## Requirements
<high level requirements section>

### Detailed Requirements

[Detailed Requirements](<feature>.detailed-requirements.md)

## Clarification Questions

<clarification questions or None>

## Design
### Design Context and Related Workflows

<design context and related workflows>

### System Dataflow

[System Dataflow JSON](<feature>.sys-dataflow.json)

### Implementation Dataflow

[Implementation Dataflow JSON](<feature>.impl-dataflow.json)

<implementation dataflow narrative>

### Implementation Instructions

For the coding agent implementing this HLD after design handoff:

1. Read this HLD, its linked Detailed Requirements and dataflow artifacts, and the relevant code and repository guidance.
2. Make the change as specified by the HLD and flesh out the implementation as necessary to satisfy the Detailed Requirements. Design Guidelines limit the HLD's detail, not the implementation requirements.
3. If satisfying the Detailed Requirements would materially change the HLD, ask the user for clarification and wait for their response before implementing the affected changes.
