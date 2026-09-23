# AI Coding Toolkit

This directory contains portable skills and scripts that help developers work with AI coding agents. Codex is the first supported agent.

## Install

Keep this toolkit checkout anywhere on your machine. From this directory, install its dependencies and pass the target code repository path:

```sh
cd ai-coding-toolkit
npm install
npm run install:codex -- /path/to/code-repo
```

To install only the alternative `hld-gen-new` implementation, run:

```sh
npm run install:hld-gen-new -- /path/to/code-repo
```

To install the `$annotate-diff` skill, run:

```sh
npm run install:annotate-diff -- /path/to/code-repo
```

Both implementations expose the skill as `$hld-gen`; install one implementation into a target repository at a time.

The target directory must already exist. Relative target paths are resolved from the current working directory. The output directory defaults to `docs/plans` under the target repository root. To choose another repository-relative directory, run:

```sh
npm run install:codex -- ../code-repo --output-dir architecture/plans
```

In the target repository, the installer records the selection in `ai-coding-toolkit/config.json`, copies the selected design tools and installed dependencies into `ai-coding-toolkit`, installs their skills under `.agents/skills/`, and adds their visualizer commands when the repository has a root `package.json`.

Each target repository has its own files and output configuration and works independently of this checkout. Rerun the installer to update its installed copies; this overwrites files in directories marked as toolkit installations. It will not replace unrelated existing directories or npm scripts. Links created by the earlier installer to this checkout are replaced with copies.

Full toolkit upgrades remove the retired toolkit-owned `hld-eval` skill, `SKILL.next.md` files, evaluation report format, and Mermaid converter and npm command. Unrelated skills, links, custom commands, and previously generated diagrams are preserved.

## Generate a High-Level Design

Start `$hld-gen` at any point in a conversation about a feature. Before drafting, the agent presents its understanding of the desired behavior and scope, asks the user to confirm or correct it, and waits for an explicit response. It does not create or revise the HLD before confirmation.

The rubric in `hld-gen/instructions/hld-quality.md` scores change size, concentration, and Variable Exposure. See `hld-gen/instructions/hld-variable-exposure.md` for the exposure rules.

Ask the agent:

```text
Use $hld-gen to develop a design from our workbook-import conversation so far.
```

`hld-gen` generates three candidate designs per iteration, each with a narrative and Architecture Diff. Shared instructions in `generate-hld.md` and `eval-hld.md` handle candidate generation and quantitative counting. The skill compares the candidates, retains the best design across iterations, and records their metrics, analysis, and improvement outcomes in an iteration summary. It generates three new candidates for an untried or newly justified improvement approach; otherwise, it selects the best design across the run.

Results are grouped by feature under the configured output directory:

- `<feature>/<feature>.hld.md`: narrative, stated intent and constraints, proposed approach, working assumptions, and open questions.
- `<feature>/<feature>.architecture-diff.hld.json`: current Architecture Diff.
- `<feature>/<feature>.hld-iteration-summary.md`: candidate metrics, analysis, improvement approaches, selection rationale, and stopping reason for each iteration.
- `<feature>/iterations/<iteration>/candidate-<candidate>/`: retained candidate narratives and Architecture Diff files.

The Architecture Diff records each class's `variableExposure` inventory. The exposure counter writes per-class counts and a deduplicated total; `null` means the exposure is unknown. The design change counter writes the other five quality metrics to the same JSON file.

The final artifacts and iteration summary are ready for human review; application implementation is a separate step.

## Alternative HLD Generator

The `hld-gen-new` tool installs as `$hld-gen` and provides the candidate generation, evaluation, comparison, and selection workflow without separate user-flow labeling, dataflow-narrative, or visualizer-description passes.

`hld-gen-new` retains the same narrative, Architecture Diff, quality metrics, and iteration structure as `hld-gen`. It uses `arch-diff` as shorthand for Architecture Diff and writes Architecture Diff artifacts as `<feature>.arch-diff.hld.json`.

It has independent validation and counting scripts and its own Architecture Diff visualizer, available through `npm run hld-gen-new-visualizer`.

## Annotate the Current Diff

After `hld-gen-new` produces a selected `<feature>.hld.md`, invoke `$annotate-diff`. The skill compares the current files with `HEAD` and writes `<feature>.system-dataflow.code-review.json` beside the HLD. It also writes `<feature>.diff-index.json` as a self-contained input for the diff visualizer, embedding the exact patch alongside locations for changed files, classes, and methods. The generated graph focuses on user and system boundaries, state, external dependencies, and critical data processing in the implemented feature.

`generate-diff-index.mjs` can currently identify class and method entities only in JavaScript and TypeScript files because it uses a deterministic AST parser. Future work could add an LLM-based entity-identification path for broader language support.

Run the installed System Dataflow visualizer from the target repository:

```sh
npm run system-dataflow-visualizer
```

## Architecture Diff Visualizer

Run the interactive visualizer from this toolkit checkout or an installed target repository:

```sh
npm run visualizer
```

The visualizer restores the last Architecture Diff opened in the browser. If there is no previous file, it opens the most recently modified Architecture Diff under the `outputDirectory` configured in `ai-coding-toolkit/config.json`, falling back to the bundled workbook-import sample when that directory contains none. Open or drag in any schema-v7 `architecture-diff.json` file to inspect its classes, methods, UI and external I/O components, dataflows, state updates, composition, and variable exposure. Its controls can hide unchanged elements, show only user-flow participants, collapse methods, and adjust the graph zoom. Filters apply to the graph and inspector; exposure counts exclude parameters and locals of filtered methods. Schema v7 requires `hasUserFlowState` on classes and `userFlow` on methods, components, dataflows, and state updates. Class visibility is derived from user-flow state, methods, or connected dataflows. Classes and composition edges have no `userFlow` flag; composition is shown only between visible classes. Older versions are not supported.

## Validate an Architecture Diff

Validate an Architecture Diff from the repository root with:

```sh
node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <path-to-json>
```
