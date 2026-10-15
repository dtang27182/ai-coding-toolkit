# AI Coding Toolkit

This directory contains portable skills and scripts that help developers work with AI coding agents. Codex is the first supported agent.

## Install

Keep this toolkit checkout anywhere on your machine. From this directory, install its dependencies and pass the target code repository path:

```sh
cd ai-coding-toolkit
npm install
npm run install:all -- /path/to/code-repo
```

Run `npm install` in this toolkit checkout before using any installer command; the installer copies its `node_modules` into the target repository. If an earlier attempt stopped with a missing `node_modules` error, install the dependencies and rerun the same installer command to finish the installation.

The default installer installs `feature-design` (including `feature-redesign`), `refactor-design`, and `enrich-diff` for Codex, along with the Advanced Diff Viewer (`adv-diff`). To install only the feature design skills, run:

```sh
npm run install:feature-design -- /path/to/code-repo
```

To install only the `$refactor-design` skill, run:

```sh
npm run install:refactor-design -- /path/to/code-repo
```

To install only the `$enrich-diff` skill, run:

```sh
npm run install:enrich-diff -- /path/to/code-repo
```

To install the Advanced Diff Viewer independently, run:

```sh
npm run install:adv-diff -- /path/to/code-repo
```

In either this toolkit checkout or an installed target repository, open the viewer with:

```sh
npm run adv-diff
```

The viewer generates `adv-diff/enriched-patch.json` automatically from current staged, unstaged, deleted, and untracked changes against `HEAD`. It updates as files change and provides a Refresh button. The generated enriched patch and, in installed repositories, the copied `ai-coding-toolkit` runtime and the output directory configured in `ai-coding-toolkit/config.json` are excluded from the comparison and do not trigger refreshes. You can open or drag in another enriched patch from the viewer.

The design skills are invoked as `$feature-design` and `$refactor-design`.

Skills install for Codex by default. To install them for Claude Code, where they are invoked as `/feature-design`, `/refactor-design`, and `/enrich-diff`, pass `--agent claude`, or `--agent codex,claude` for both:

```sh
npm run install:all -- /path/to/code-repo --agent claude
```

Claude Code skills install under `.claude/skills/` with Claude-only frontmatter added: their toolkit scripts are pre-approved, and `enrich-diff` runs in a forked subagent context.

The target directory must already exist. Relative target paths are resolved from the current working directory. For the HLD and enrich-diff tools, the output directory defaults to `docs/plans/features` under the target repository root. To choose another repository-relative directory, run:

```sh
node scripts/init.mjs ../code-repo --output-dir architecture/plans
```

In the target repository, the installer records the selection in `ai-coding-toolkit/config.json`, copies the selected design tools and installed dependencies into `ai-coding-toolkit`, installs their skills under `.agents/skills/` (Codex) or `.claude/skills/` (Claude Code), and adds supported npm commands when the repository has a root `package.json`.

Each target repository has its own files and output configuration and works independently of this checkout. Rerun the installer to update its installed copies; this overwrites files in directories marked as toolkit installations. It will not replace unrelated existing directories or npm scripts. Links created by the earlier installer to this checkout are replaced with copies.

## Generate a High-Level Design

Start `$feature-design` at any point in a conversation about a feature. Before generating the design, the agent drafts requirements in the HLD, presents its understanding of the desired behavior, scope, and user journeys, asks the user to confirm or correct all three, and waits for explicit approval.

`feature-design/hld-quality.md` defines qualitative guidance for generating one design. The goal is to minimize end-state complexity, then minimize change complexity wherever doing so does not increase end-state complexity.

`feature-design` defines and confirms requirements, including User Journeys, then calls `feature-design/generate/gen-design.md` to fill the HLD's Design section and generate its dataflow artifacts and manifest. The HLD template, generation instructions, manifest writer, and visualizer live in `feature-design`. The behavior-change requirements template and definition instructions remain in `feature-design/define`.

Ask the agent:

```text
Use $feature-design to develop a design from our workbook-import conversation so far.
```

`feature-design` produces an HLD doc (`<feature>.hld.md`), a proposed System Dataflow (`<feature>.sys-dataflow.json`), and an Implementation Dataflow (`<feature>.impl-dataflow.json`), in that order. The Implementation Dataflow JSON is the working design artifact; its paths then inform the HLD narrative. The System Dataflow is generated directly from User Journeys; the HLD has no separate User Flows section. Detailed Requirements are captured separately in `<feature>.detailed-requirements.md` for implementation after design handoff. The HLD links to that file and gets `<feature>.hld-manifest.json` with absolute paths to all four artifacts. `sys-dataflow` is shorthand for System Dataflow.

The skill generates one design and validates its dataflow artifacts, without candidate comparison, quantitative quality evaluation, or automatic improvement iterations. All artifacts are grouped directly in `<feature>/` under the configured output directory. Requirements and clarification questions live in the HLD; there is no separate iteration summary.

The final artifacts are ready for human review; application implementation is a separate step.

Use `$feature-redesign` with an existing HLD whose Design Guidelines and Requirements are filled out to start directly at design generation. It regenerates the Design section, both dataflows, and manifest, overwriting existing design output while preserving the guidelines and requirements. It installs alongside `feature-design` for Codex and Claude Code, where it is invoked as `/feature-redesign`.

The shared dataflow validation scripts remain available independently. Run `npm run hld-visualizer` to switch between its System Dataflow and Implementation Dataflow views. The visualizer loads the newest HLD manifest under the configured output directory, keeping both views on the same design. You can open or drag in another HLD manifest. The views refresh when the open repository manifest or either referenced dataflow changes; manifests chosen with a browser file handle refresh too.

## Design a Refactoring

Use `$refactor-design` to plan structural changes to existing code, preserving externally observable behavior except for explicitly permitted changes. Its High Level Requirements are organized into Desired Code Structure, Scope, and User Journeys. Refactoring Goal sits under Desired Code Structure; behavior preservation, permitted changes, and explicit exclusions sit under Scope. The skill asks for approval of the high-level and detailed requirements before generating the design.

```text
Use $refactor-design to separate parsing from storage in the import workflow while preserving its behavior.
```

The skill uses the shared HLD template, definition and confirmation workflow, generator, and visualizer. It produces the same HLD, Detailed Requirements, dataflows, and manifest as `feature-design`, under a slug chosen for the refactoring. Design generation may leave the System Dataflow unchanged when the refactoring affects only implementation structure. Application implementation follows human design review.

## Enrich the Current Diff

After `feature-design` produces `<feature>.hld.md`, invoke `$enrich-diff`. You can ask it to compare the working tree with the latest commit, the latest commit with its parent, or any two commits; it uses the older commit as the base regardless of the order you name them. Without a selection, it uses the working tree when staged, unstaged, or untracked changes exist; otherwise it compares `HEAD^` with `HEAD`. The skill writes the selected diff to `<feature>.patch` and a graph to `<feature>.cr.sys-dataflow.json` beside the HLD. It also writes `<feature>.enriched-patch.json` as a self-contained input for the enriched patch viewer, embedding the selected patch alongside locations for changed files, classes, and methods. `<feature>.rich-diff.json` contains absolute paths to the enriched patch and both dataflow JSON artifacts for the combined visualizer. The generated System Dataflow focuses on user and system boundaries, state, external dependencies, and critical data processing in the implemented feature.

The skill also generates `<feature>.cr.impl-dataflow.json` using three passes: identify changed entities and required endpoints throughout the diff, write direct relationships, and validate diff coverage and implementation accuracy. The diff-description provides behavior context without limiting which changes appear in the graph. This artifact records classes and modules with their functions, state variables, components, and direct transfers, with relevant diff hunks attached to changed entries. Schema limitations and unresolved discrepancies are written to `<feature>.cr.impl-dataflow.discrepencies.md`. The skill reports both paths alongside the combined visualizer input.

`generate-enriched-patch.mjs` can currently identify class and method entities only in JavaScript and TypeScript files because it uses a deterministic AST parser. Future work could add an LLM-based entity-identification path for broader language support.

Run the combined visualizer from the target repository, then switch between the System Dataflow and Enriched Patch views:

```sh
npm run diff-visualizer
```

The combined visualizer opens the newest `rich-diff.json` under the configured output directory, then loads all three JSON files named in it. You can open or drag in another rich-diff manifest to switch all three views together.

In the combined visualizer, the diff view derives its directory tree from indexed file paths and exposes the indexed files, classes, and methods. Selecting one opens its full-file diff and scrolls to the indexed declaration.
