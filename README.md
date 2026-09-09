# AI Coding Toolkit

This directory contains the portable source for the change-structure skills. The initial implementation supports the high-level design stage and Codex installation.

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

The installer records the selection in `ai-coding-toolkit/config.json`, creates `.agents/skills/change-structure-high-level-design` as a link to the canonical skill, and adds `npm run mermaid` when the repository has a root `package.json`. It is safe to run more than once and will not replace unrelated existing paths or npm scripts.

## Use

Ask Codex to use `$change-structure-high-level-design` during a high-level design discussion. The skill includes the feature name in the output filename, such as `docs/plans/workbook-import.high-level-design.change-structure.json`.

Validate any change-structure file from the repository root with:

```sh
node ai-coding-toolkit/scripts/validate-change-structure.mjs <path-to-json>
```

## Mermaid

Convert a change-structure JSON file into a Markdown file containing a Mermaid diagram:

```sh
npm run mermaid -- docs/plans/workbook-import.high-level-design.change-structure.json
```

By default, the converter writes beside the JSON file with `.mermaid.md` appended to its base name. Pass a second path to choose another output file.

The diagram groups added and modified classes inside a change-scope outline. Unchanged context classes remain outside, small circles mark data flows that cross the scope, and changed methods appear inside their class nodes.
