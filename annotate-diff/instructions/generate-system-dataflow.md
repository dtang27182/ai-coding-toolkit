# Generate a System Dataflow from the Current Diff

## 1. Find the HLD

- Read `outputDirectory` from `ai-coding-toolkit/config.json`.
- Find the most recently modified final HLD matching `<outputDirectory>/<feature>/<feature>.hld.md`.
- Do not select an HLD under an `iterations` directory.
- Use the HLD only for the feature description, scope, and user workflows.

## 2. Inspect the Implementation

- Run `git diff HEAD --` to compare the current index and working tree with the most recent commit on the current branch.
- Read the changed files and enough surrounding code to understand the implemented dataflow.
- Treat the diff and current code as the ground truth.
- Ground every changed node in an actual change in the diff.
- Ground every unchanged node in actual current code.
- Include only dataflow connections supported by the diff or current code.
- Do not assume that any proposed design from the HLD was implemented.

## 3. Read the Format

- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.schema.json`.
- Read `ai-coding-toolkit/common/system-dataflow/system-dataflow.example.json`.

## 4. Build the Graph

- Build one separate connected subgraph for each user flow specified in the HLD.
- Start each subgraph with its triggering user action or system input and trace the runtime dataflow through its final outputs and state changes.
- Create nodes for the major system components defined by the schema that participate in that event chain.
- Never include one-time initialization, dependency setup, or object construction that occurs before the triggering user action or system input.
- Within each subgraph, represent each system component once per semantic role. For a component used by multiple user flows, create distinct flow-specific nodes with the same grounded `location` when appropriate.
- Set `changeType` from the diff, using `unchanged` only for context required to understand the changed flow.
- Create a data-processing node for an algorithm with at least one of these properties:
  - Conditional logic that meaningfully changes the user workflow's high-level direction, often corresponding to a branch in the HLD's user workflow steps.
  - Loop logic that meaningfully changes the user workflow's high-level direction, often corresponding to a branch in the HLD, or that expresses a meaningful pattern for processing a large data set.
  - A non-trivial algorithm such as search, sorting, or tree or graph traversal.
- Represent an algorithm implemented by multiple cooperating methods as one data-processing node.

## 5. Write the Artifact

- Write `<outputDirectory>/<feature>/<feature>.system-dataflow.code-review.json`.
- Set `stage` to `code-review`.

## 6. Validate the Artifact

- Run `node ai-coding-toolkit/annotate-diff/scripts/validate-system-dataflow.mjs <output-path>`.
- Correct every validation error.

## 7. Report the Result

- Report the HLD path.
- Report the diff base as `HEAD`.
- Report the generated JSON path.
