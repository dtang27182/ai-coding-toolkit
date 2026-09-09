# AI Coding Toolkit

This directory contains portable skills and scripts that help developers work with AI coding agents. Codex is the first supported agent.

## Install

Copy `ai-coding-toolkit` into the root of a repository, then run:

```sh
cd ai-coding-toolkit
npm install
npm run install:codex
```

The output directory defaults to `docs/plans` under the repository root. To choose another repository-relative directory, run:

```sh
npm run install:codex -- --output-dir architecture/plans
```

The installer records the selection in `ai-coding-toolkit/config.json`, links `hld-gen` and `hld-eval` under `.agents/skills`, and adds `npm run mermaid` when the repository has a root `package.json`. It is safe to run more than once and will not replace unrelated existing paths or npm scripts.

## Generate a High-Level Design

Start `$hld-gen` at any point in a conversation about a feature. Clarification, discussion of possible approaches, and an agreed design are optional. The agent uses the available context to draft or refine a design, records working assumptions, and preserves explicit user constraints and decisions.

The default rubric in `hld-gen/references/hld-quality.md` scores the size and concentration of the proposed changes and their placement in the composition hierarchy. You can supply another rubric for a particular HLD.

Ask the agent:

```text
Use $hld-gen to develop a design from our workbook-import conversation so far.
Use ai-coding-toolkit/hld-gen/references/hld-quality.md as the rubric.
```

`hld-gen` writes a narrative and Architecture Diff as one HLD. `hld-eval` returns each rubric attribute's raw score, whether higher or lower values are better, and one qualitative assessment without revision suggestions. `hld-gen` revises the same HLD until every score reaches its best possible value or it cannot identify another improvement.

| Skill      | Responsibility                                      |
| ---------- | --------------------------------------------------- |
| `hld-gen`  | Create and improve one HLD.                         |
| `hld-eval` | Score one HLD and write one qualitative assessment. |

You can also invoke `$hld-eval` on an existing HLD for a standalone evaluation.

Results are saved under the configured output directory:

- `<feature>.hld.md`: narrative, stated intent and constraints, proposed approach, working assumptions, and open questions.
- `<feature>.architecture-diff.hld.json`: current Architecture Diff.
- `<feature>.architecture-diff.hld.mermaid.md`: generated diagram preview.
- `<feature>.hld-evaluation.md`: latest attribute scores, qualitative assessment, and stopping reason.

The report follows `hld-gen/references/hld-evaluation-format.md`. The final artifacts are ready for human review; application implementation is a separate step.

## Mermaid

Convert an architecture diff JSON file into a Markdown file containing a Mermaid diagram:

```sh
npm run mermaid -- docs/plans/workbook-import.architecture-diff.hld.json
```

Validate an Architecture Diff from the repository root with:

```sh
node ai-coding-toolkit/hld-gen/scripts/validate-architecture-diff.mjs <path-to-json>
```

By default, the converter writes beside the JSON file with `.mermaid.md` appended to its base name. Pass a second path to choose another output file.

The diagram groups added and modified classes inside a change-scope outline. Unchanged context classes remain outside, small circles mark data flows that cross the scope, and changed methods appear inside their class nodes.
