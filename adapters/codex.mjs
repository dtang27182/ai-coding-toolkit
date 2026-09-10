import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

const skillNames = ["hld-eval", "hld-gen"];

export async function installCodexSkills(repoDirectory, toolkitDirectory) {
  const codexSkillsDirectory = path.join(repoDirectory, ".agents", "skills");

  for (const skillName of skillNames) {
    const skillDirectory = path.join(toolkitDirectory, "hld-gen", "skills", skillName);
    const installedSkillDirectory = path.join(codexSkillsDirectory, skillName);
    await copyDirectory(skillDirectory, installedSkillDirectory);
  }
}
