# Model Selector Graph Scope Analysis

## Context

The generated `model-selector.system-dataflow.code-review.json` contains 15 nodes and 30 relationships. Its nodes are generally grounded in the implementation, but many describe existing chat, workbook, and restore behavior outside the model selector's core dataflow.

The HLD defines one user flow, **Choose a model for subsequent requests**. Its core implementation scope ends when the current model configuration is applied to a request body. Existing transport and response handling are context rather than part of the feature's core logic.

## Excess Graph Scope

The graph correctly includes the model selector's primary participants:

- Choose a model
- Model catalog
- Session model selection
- Displayed model selection
- Subsequent model operation
- OpenRouter Responses API

It then expands through existing downstream behavior that is not needed to explain the model selector:

- Conversation and review state
- Main query and clarification processing beyond request preparation
- Scenario comparison processing beyond applying the selected configuration
- Apply model response outcome
- Excel workbook
- Chat transcript and review controls
- Clear or restore chat
- Clear or restore conversation
- Restore checkpoints

These entities exist in the code, but their full behavior is not part of the feature. Several appear only to show that existing behavior continues normally or that model selection is absent from conversation and restore state.

## Why the Graph Expanded

### The traversal rule has no feature boundary

The generation instructions say to trace runtime dataflow through final outputs and state changes. This encourages a transitive traversal of the complete application workflow.

For the model selector, that traversal continues from request preparation into:

- OpenRouter response streaming and parsing
- Conversation-state updates
- Scenario and diff-sheet creation
- Workbook reads and writes
- Transcript rendering
- Restore-point management

This conflicts with the HLD's explicit statement that core scope stops where the selected configuration is applied to a request body.

### One HLD user flow contains several independent triggers

The HLD groups several actions into one named user flow:

- Selecting a model
- Submitting a later chat or clarification request
- Starting a scenario comparison
- Starting accepted-edit analysis
- Clearing chat
- Restoring a checkpoint

The instruction to create one connected subgraph per HLD user flow therefore places all of these independently triggered event chains in one graph. The generated `Subsequent model operation` and `Clear or restore chat` nodes are evidence of this expansion.

### Algorithm eligibility does not require feature relevance

The instructions allow a data-processing node when code contains meaningful branching, looping, or another non-trivial algorithm. They do not also require that the algorithm itself is part of the feature.

Consequently, existing algorithms qualify even when the diff only adds the selected model configuration to their request bodies:

- Main-query streaming and response interpretation
- Clarification tool-call matching
- Scenario-range traversal and overlap detection
- Response-outcome branching
- Clear and Restore state replacement

The containing methods changed, but most of the algorithms described by the generated nodes did not.

### Grounding does not establish relevance

The grounding requirements prevent invented nodes, but a node can be both real and irrelevant to the feature's core dataflow. Every downstream component in the generated graph can be traced to actual code, so grounding alone does not limit graph scope.

The validator also cannot catch this problem. It verifies:

- JSON Schema conformance
- Unique node names and relationship IDs
- Valid relationship endpoints
- Legal incoming and outgoing directions

It does not evaluate whether a node is necessary to explain the feature.

### Context in the HLD became graph content

The HLD's Relevant Logic and Dataflow section describes unchanged transport, result handling, workbook updates, and restore behavior to explain how the feature fits the existing system. The generator treated those contextual descriptions as graph candidates even though the HLD later states a narrower core boundary.

## Instruction Gaps

The graph-building instructions need two additional relevance rules:

1. Stop following a flow when feature-specific data reaches its first existing consumption boundary, unless downstream behavior is itself changed by the feature.
2. Create a data-processing node only when the algorithm itself is introduced, changed, or necessary to explain a feature-specific branch or transformation. A method receiving new configuration is not sufficient.

The instructions should also distinguish a user flow from the independent triggers contained within it. Later actions used to demonstrate persistence or compatibility should not automatically expand the graph through their complete existing workflows.

## Expected Scope for This Feature

A focused model-selector graph would show:

- The user's model selection
- The static model catalog
- The retained session model configuration
- The displayed selection
- A later model-backed operation
- The selected configuration reaching the request boundary

Clear and Restore preservation can be stated in the session-state node description. Their complete event processing and restore checkpoint structures do not need graph nodes because they do not read or update the selection.
