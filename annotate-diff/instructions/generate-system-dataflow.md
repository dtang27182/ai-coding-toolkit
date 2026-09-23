# Generate a System Dataflow from the Current Diff

## 1. Find the HLD

- Read `outputDirectory` from `ai-coding-toolkit/config.json`.
- Find the most recently modified final HLD matching `<outputDirectory>/<feature>/<feature>.hld.md`.
- Do not select an HLD under an `iterations` directory.
- Use the HLD only to initialize the diff-description.

## 2. Initialize the Diff Description

- Read and follow `ai-coding-toolkit/annotate-diff/instructions/generate-diff-description.md`.
- After creating the diff-description, use it instead of the HLD for all feature scope and user-flow references.

## 3. Inspect the Implementation

- Run `git diff HEAD --` to compare the current index and working tree with the most recent commit on the current branch.
- Read the changed files and enough surrounding code to understand the implemented dataflow.
- Treat the diff and current code as the ground truth.
- Ground every changed node in an actual change in the diff.
- Ground every unchanged node in actual current code.
- Include only dataflow connections supported by the diff or current code.
- Do not assume that planned implementation details were implemented unless the diff or current code supports them.

## 4. Read the Format

- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.schema.json`.
- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.example.json`.

## 5. Build the Graph

- Treat each `###` user flow in the diff-description as the scope of one separate connected subgraph.
- Start each subgraph with the flow's triggering user action, or with a system input when the described flow is externally triggered.
- Trace the implemented runtime dataflow only far enough to represent the outputs and high-level state updates named in that flow's numbered steps.
- Create nodes for the major system components defined by the schema that directly participate in producing those named effects.
- Stop the subgraph after all named effects are represented. Do not continue through unchanged downstream behavior or related workflows that the steps do not name.
- Never include one-time initialization, dependency setup, or object construction that occurs before the triggering user action or system input.
- Within each subgraph, represent each system component once per semantic role. For a component used by multiple user flows, create distinct flow-specific nodes with the same grounded `location` when appropriate.
- Set `changeType` from the diff, using `unchanged` only when the component is necessary to connect a trigger to a named effect.
- Associate each changed node with the smallest set of diff hunks that establishes its represented behavior.
- Associate each changed relationship with the smallest set of diff hunks that shows the represented data transfer, such as an assignment, argument, return value, request field, or state update.
- Allow a diff hunk to support multiple nodes and relationships. Do not associate every hunk from a containing file or method.
- Do not add diff hunk references to unchanged nodes or relationships.
- Create a data-processing node only when the algorithm directly implements a named action or effect and has at least one of these properties:
  - Conditional logic that meaningfully changes the user workflow's high-level direction, often corresponding to a branch in the diff-description's user workflow steps.
  - Loop logic that meaningfully changes the user workflow's high-level direction, often corresponding to a branch in the diff-description, or that expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
- Represent simple data forwarding and request construction with relationships between participating components rather than a data-processing node.
- Represent an algorithm implemented by multiple cooperating methods as one data-processing node.

## 6. Write the Dataflow Artifact

- Write `<outputDirectory>/<feature>/<feature>.system-dataflow.code-review.json`.
- Set `stage` to `code-review`.
- Add only referenced hunks to `diffHunks`, using simple monotonically increasing IDs.
- Store each hunk's repository-relative file path and its exact unified diff text, including the `@@` header.
- Reference those IDs from the relevant nodes and relationships with `diffHunkIds`.

## 7. Validate the Dataflow Artifact

- Run `node ai-coding-toolkit/annotate-diff/scripts/validate-system-dataflow.mjs <output-path>`.
- Correct every validation error.

## 8. Report the Result

- Report the diff base as `HEAD`.
- Report the generated JSON path.
