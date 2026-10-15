import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

export async function installCodexSkills(repoDirectory, toolkitDirectory, toolNames) {
  for (const toolName of toolNames) {
    const installedSkillDirectory = path.join(repoDirectory, ".agents", "skills", toolName);
    if (toolName === "feature-design" || toolName === "refactor-design") {
      await copyDirectory(
        path.join(toolkitDirectory, toolName),
        installedSkillDirectory,
        ["SKILL.md"]
      );
    } else {
      await copyDirectory(
        path.join(toolkitDirectory, toolName === "feature-redesign" ? "feature-design" : toolName, "skills", toolName),
        installedSkillDirectory
      );
    }
  }
}
