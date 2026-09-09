# AI Coding Toolkit

## Purpose

Provide a portable collection of skills and scripts that helps a human developer work more effectively with AI coding agents. Target Codex first while keeping the toolkit usable with other agents and IDEs. The toolkit lives inside the repository where it is used.

## Structure

- Each tool has a top-level directory containing its skills, scripts, and references.
- Root `scripts/` contains toolkit installation and other shared commands.
- `adapters/` contains the discovery and configuration logic for each supported agent.
- Root configuration and package files support the toolkit as a whole.

For example, everything specific to the HLD generator lives under `hld-gen/`. Agent adapters expose skills from these tool directories through each agent's discovery mechanism.

## Installation

Copy `ai-coding-toolkit` into a repository and run the existing initializer for the chosen agent. The initializer stores repository-relative configuration, delegates agent-specific setup to an adapter, and may add convenient repository commands when they do not conflict with existing commands.

Installation must be repeatable and must not replace unrelated files, links, or commands. All canonical toolkit files remain under `ai-coding-toolkit`; installation may create agent discovery entries elsewhere in the repository.

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
