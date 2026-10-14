import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

// Claude Code-only frontmatter added to installed copies so the shared SKILL.md files stay agent-agnostic.
const designFrontmatter = [
  "allowed-tools:",
  "  - Bash(node ai-coding-toolkit/common/hld/generate/*)",
  "  - Bash(node ai-coding-toolkit/common/impl-dataflow/*)",
  "  - Bash(node ai-coding-toolkit/common/sys-dataflow/*)",
];
const claudeFrontmatter = {
  "feature-design": designFrontmatter,
  "refactor-design": designFrontmatter,
  "enrich-diff": [
    "context: fork",
    "allowed-tools:",
    "  - Bash(git diff *)",
    "  - Bash(node ai-coding-toolkit/enrich-diff/scripts/*)",
    "  - Bash(node ai-coding-toolkit/common/enriched-patch/*)",
  ],
};

export async function installClaudeSkills(repoDirectory, toolkitDirectory, toolNames) {
  for (const toolName of toolNames) {
    const sourceSkillDirectory =
      toolName === "feature-design" || toolName === "refactor-design"
        ? path.join(toolkitDirectory, toolName)
        : path.join(toolkitDirectory, toolName, "skills", toolName);
    const installedSkillDirectory = path.join(repoDirectory, ".claude", "skills", toolName);
    await copyDirectory(sourceSkillDirectory, installedSkillDirectory, ["SKILL.md"]);

    const skillPath = path.join(installedSkillDirectory, "SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    const frontmatterEnd = skill.indexOf("\n---\n");
    if (!skill.startsWith("---\n") || frontmatterEnd === -1) {
      throw new Error(`Skill has no frontmatter: ${skillPath}`);
    }
    await writeFile(
      skillPath,
      `${skill.slice(0, frontmatterEnd)}\n${claudeFrontmatter[toolName].join("\n")}${skill.slice(frontmatterEnd)}`
    );
  }
}
