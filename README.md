# AI Coding Toolkit

This directory contains portable skills and scripts that help developers work with AI coding agents. Codex is the first supported agent.

## Install

Keep this toolkit checkout anywhere on your machine. From this directory, install its dependencies and pass the target code repository path:

```sh
cd ai-coding-toolkit
npm install
npm run install:codex -- /path/to/code-repo
```

The target directory must already exist. Relative target paths are resolved from the current working directory. The output directory defaults to `docs/plans` under the target repository root. To choose another repository-relative directory, run:

```sh
npm run install:codex -- ../code-repo --output-dir architecture/plans
```

In the target repository, the installer records the selection in `ai-coding-toolkit/config.json`, copies the HLD files and installed dependencies into `ai-coding-toolkit`, copies `hld-gen` and `hld-eval` under `.agents/skills`, and adds `npm run mermaid` when the repository has a root `package.json`.

Each target repository has its own files and output configuration and works independently of this checkout. Rerun the installer to update its installed copies; this overwrites files in directories marked as toolkit installations. It will not replace unrelated existing directories or npm scripts. Links created by the earlier installer to this checkout are replaced with copies.

## Generate a High-Level Design

Start `$hld-gen` at any point in a conversation about a feature. Before drafting, the agent presents its understanding of the desired behavior and scope, asks the user to confirm or correct it, and waits for an explicit response. It does not create or revise the HLD before confirmation.

The rubric in `hld-gen/references/hld-quality.md` scores change size, concentration, and Variable Exposure. See `hld-gen/references/hld-variable-exposure.md` for the exposure rules.

Ask the agent:

```text
Use $hld-gen to develop a design from our workbook-import conversation so far.
```

`hld-gen` writes a narrative and Architecture Diff as one HLD. `hld-eval` returns each rubric attribute's raw score, whether higher or lower values are better, and one qualitative assessment without revision suggestions. `hld-gen` revises the same HLD until every score reaches its best possible value or it cannot identify another improvement.

| Skill      | Responsibility                                      |
| ---------- | --------------------------------------------------- |
| `hld-gen`  | Create and improve one HLD.                         |
| `hld-eval` | Score one HLD and write one qualitative assessment. |

You can also invoke `$hld-eval` on an existing HLD for a standalone evaluation.

Results are grouped by feature under the configured output directory:

- `<feature>/<feature>.hld.md`: narrative, stated intent and constraints, proposed approach, working assumptions, and open questions.
- `<feature>/<feature>.architecture-diff.hld.json`: current Architecture Diff.
- `<feature>/<feature>.architecture-diff.hld.mermaid.md`: generated diagram preview.
- `<feature>/<feature>.hld-evaluation.md`: latest attribute scores, qualitative assessment, and stopping reason.

The Architecture Diff records each class's `variableExposure` inventory. The counting script writes per-class counts and a deduplicated total; `null` means the exposure is unknown.

The report follows `hld-gen/references/hld-evaluation-format.md`. The final artifacts are ready for human review; application implementation is a separate step.

## Mermaid

From an installed target repository with a root `package.json`, convert an architecture diff JSON file into a Markdown file containing a Mermaid diagram:

```sh
npm run mermaid -- docs/plans/workbook-import/workbook-import.architecture-diff.hld.json
```

Validate an Architecture Diff from the repository root with:

```sh
node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <path-to-json>
```

By default, the converter writes beside the JSON file with `.mermaid.md` appended to its base name. Pass a second path to choose another output file.

The diagram groups added, modified, and deleted classes inside a change-scope outline. Unchanged context classes remain outside, small circles mark data flows that cross the scope, and all methods participating in the end-to-end flow appear inside their class nodes with change markers.

Only data flow relationships are drawn; composition relationships remain in the JSON. Diagrams use a compact top-to-bottom layout to reduce horizontal scrolling.

UI components and external I/O endpoints appear outside the class change scope, connected by directed data flows. Rounded nodes represent UI surfaces; hexagons represent external I/O such as network services, files, or browser storage. Their colors indicate change type, as for classes.
