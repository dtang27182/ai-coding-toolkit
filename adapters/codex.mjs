import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

export async function installCodexSkills(repoDirectory, toolkitDirectory, toolNames) {
  for (const toolName of toolNames) {
    const skillName = toolName === "hld-gen-new" ? "hld-gen" : toolName;
    const installedSkillDirectory = path.join(repoDirectory, ".agents", "skills", skillName);
    if (toolName === "hld-gen-new") {
      await copyDirectory(
        path.join(toolkitDirectory, toolName),
        installedSkillDirectory,
        ["SKILL.md"]
      );
    } else {
      await copyDirectory(
        path.join(toolkitDirectory, toolName, "skills", skillName),
        installedSkillDirectory
      );
    }
  }
}
