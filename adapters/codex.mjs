import { lstat, readFile, readlink, rm, unlink } from "node:fs/promises";
import path from "node:path";

import { copyDirectory } from "../scripts/copy-directory.mjs";

export async function installCodexSkills(repoDirectory, toolkitDirectory, skillNames) {
  for (const skillName of skillNames) {
    const skillDirectory = path.join(toolkitDirectory, skillName, "skills", skillName);
    const installedSkillDirectory = path.join(repoDirectory, ".agents", "skills", skillName);
    await copyDirectory(skillDirectory, installedSkillDirectory);
    await rm(path.join(installedSkillDirectory, "SKILL.next.md"), { force: true });
  }

  if (skillNames.includes("hld-gen")) {
    const retiredSkillDirectory = path.join(repoDirectory, ".agents", "skills", "hld-eval");
    let retiredSkill;
    try {
      retiredSkill = await lstat(retiredSkillDirectory);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (retiredSkill?.isSymbolicLink()) {
      const currentTarget = await readlink(retiredSkillDirectory);
      if (
        path.resolve(path.dirname(retiredSkillDirectory), currentTarget) ===
        path.join(toolkitDirectory, "hld-gen", "skills", "hld-eval")
      ) {
        await unlink(retiredSkillDirectory);
      }
    } else if (retiredSkill?.isDirectory()) {
      let installationMarker;
      try {
        installationMarker = await readFile(path.join(retiredSkillDirectory, ".ai-coding-toolkit-installed"), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
      if (installationMarker === "ai-coding-toolkit\n") {
        await rm(retiredSkillDirectory, { recursive: true });
      }
    }
  }
}
