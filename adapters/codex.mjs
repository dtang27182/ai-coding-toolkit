import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import path from "node:path";

const skillNames = ["hld-eval", "hld-gen"];

export async function installCodexSkills(repoDirectory, toolkitDirectory) {
  const codexSkillsDirectory = path.join(repoDirectory, ".agents", "skills");
  await mkdir(codexSkillsDirectory, { recursive: true });

  for (const skillName of skillNames) {
    const skillDirectory = path.join(toolkitDirectory, "hld-gen", "skills", skillName);
    const linkPath = path.join(codexSkillsDirectory, skillName);
    const relativeTarget = path.relative(codexSkillsDirectory, skillDirectory);
    let existingLink;

    try {
      existingLink = await lstat(linkPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (existingLink === undefined) {
      await symlink(relativeTarget, linkPath, "dir");
      console.log(`Installed Codex skill: ${linkPath}`);
    } else if (existingLink.isSymbolicLink()) {
      const currentTarget = await readlink(linkPath);
      const currentDirectory = path.resolve(codexSkillsDirectory, currentTarget);

      if (currentDirectory === skillDirectory) {
        console.log(`Codex skill already installed: ${linkPath}`);
      } else {
        throw new Error(`Refusing to replace existing link: ${linkPath}`);
      }
    } else {
      throw new Error(`Refusing to replace existing path: ${linkPath}`);
    }
  }
}
