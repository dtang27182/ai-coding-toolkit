import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

export async function installCodexSkills(repoDirectory, toolkitDirectory) {
  const skillDirectory = path.join(toolkitDirectory, "hld-gen", "skills", "hld-gen");
  const installedSkillDirectory = path.join(repoDirectory, ".agents", "skills", "hld-gen");
  await copyDirectory(skillDirectory, installedSkillDirectory);
}
