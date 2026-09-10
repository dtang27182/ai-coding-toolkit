import { cp, lstat, readFile, readlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const installationMarker = ".ai-coding-toolkit-installed";

export async function copyDirectory(sourceDirectory, destinationDirectory) {
  let existingDirectory;

  try {
    existingDirectory = await lstat(destinationDirectory);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existingDirectory?.isSymbolicLink()) {
    const currentTarget = await readlink(destinationDirectory);
    if (path.resolve(path.dirname(destinationDirectory), currentTarget) === sourceDirectory) {
      await unlink(destinationDirectory);
    } else {
      throw new Error(`Refusing to replace existing link: ${destinationDirectory}`);
    }
  } else if (existingDirectory !== undefined) {
    let installedByToolkit = false;
    if (existingDirectory.isDirectory()) {
      try {
        installedByToolkit =
          (await readFile(path.join(destinationDirectory, installationMarker), "utf8")) ===
          "ai-coding-toolkit\n";
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
    if (!installedByToolkit) {
      throw new Error(`Refusing to replace existing path: ${destinationDirectory}`);
    }
  }

  await cp(sourceDirectory, destinationDirectory, { recursive: true, dereference: true });
  await writeFile(path.join(destinationDirectory, installationMarker), "ai-coding-toolkit\n");
  console.log(`Installed files: ${destinationDirectory}`);
}
