# AI Coding Toolkit

## Purpose

Provide a portable collection of skills and scripts that helps a human developer work more effectively with AI coding agents. Target Codex first while keeping the toolkit usable with other agents and IDEs. One toolkit checkout can serve multiple target repositories.

## Structure

- Each tool has a top-level directory containing its skills, scripts, and references.
- Root `scripts/` contains toolkit installation and other shared commands.
- `adapters/` contains the discovery and configuration logic for each supported agent.
- Root configuration and package files support the toolkit as a whole.

For example, everything specific to the HLD generator lives under `hld-gen/`. Agent adapters expose skills from these tool directories through each agent's discovery mechanism.

## Installation

Run the initializer from the toolkit checkout with a target repository path and the chosen agent. The initializer stores repository-relative configuration in the target's `ai-coding-toolkit/config.json`, copies the HLD files and installed dependencies into the target, delegates agent-specific setup to an adapter, and may add convenient repository commands when they do not conflict with existing commands.

Installation must be repeatable and must not replace unrelated directories, links, or commands. Installed toolkit directories carry an ownership marker so subsequent installations can update their files. Each target receives independent copies of the skills, scripts, references, and dependencies and does not require the source checkout to remain available.

## Principles

- Build tools in an agent-agnostic way by default.
- Codex-specific optimizations must have an agent-agnostic fallback.
- Scripts must be directly runnable.
- Generated artifacts stay in the target repository at configured paths.
- Tool-specific files stay under the directory for that tool.
- Shared guidance belongs in the tool's `references/`; deterministic behavior belongs in its `scripts/`.
- Keep agent-specific discovery and configuration in adapters.

## Verification

- Install the toolkit twice in a temporary repository and confirm setup remains correct.
- Confirm Codex discovers and can use the installed skills.
- Confirm Codex-specific behavior has a working agent-agnostic fallback.
- Confirm scripts work without a particular IDE or AI agent.
- Confirm configuration and generated output stay inside the target repository.
- Confirm installation refuses to overwrite conflicting repository content.
